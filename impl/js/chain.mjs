// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * ══ THE CHAIN SERVICE — the only way this wallet talks to the network ═══════════════════════════════
 *
 * ★★ PORTED from the deployed wallet's `queuedFetch`, whose behaviour is not guesswork: it has survived
 *   contact with the free tier. What carried over unchanged, because it was right:
 *
 *     | a MINIMUM GAP between requests | 350 ms, so concurrent paths cannot burst through the limit |
 *     | a 429 branch WITH BACKOFF      | 500 / 1000 / 1500 ms, three retries                        |
 *
 *   ⛔ 429 IS NOT AN ERROR AND MUST NEVER BE REPORTED AS ONE. It means "ask again shortly". A verifier
 *     that reports *invalid* when it was merely throttled is worse than one that waits, because the
 *     caller acts on a wrong answer instead of a slow one.
 *
 * ★ An in-process promise chain is the RIGHT mechanism here, and only here. One tab is one process, so
 *   one variable really does see every request. The server-side sibling cannot use this and does not:
 *   there each request is its own process, so its queue lives in a file lock instead.
 *
 * ⚠ FOUR DELIBERATE DIFFERENCES from the deployed version, stated rather than smuggled in:
 *   1. **The queue is PER HOST.** One global chain for every service is safe but throws away half the
 *      throughput - they are different services with different limits. It also removes the deployed
 *      version's footgun, which needed the comment *"do not instantiate multiple providers"*.
 *   2. **`Retry-After` is honoured** when the server sends one. If a service tells you exactly how long
 *      to wait, guessing 500 ms instead is worse for both sides.
 *   3. **`confirmLanded` is NOT fired automatically.** The deployed version starts it unawaited after
 *      every broadcast. That is right in an app, which owns the page and can log to a console; it is
 *      wrong in a library, which would be starting background work the caller cannot await, observe or
 *      cancel, and whose failures surface nowhere. ⇒ It is a method the caller starts. ⚠ The guard
 *      itself is NOT optional - see the note on `broadcast`, and start it.
 *
 * ⚠⚠ `fetchImpl` AND `sleep` ARE INJECTABLE SO ALL OF THIS IS GRADED OFFLINE. A rate limiter that has
 *   only ever been run against a live API has not been tested: the interesting cases - a 429 storm, a
 *   Retry-After header, two callers racing - are exactly the ones a service will not produce on demand.
 */
import { p2pkhScript, b58decode } from './address.mjs'
import { reversed, fromHex, toHex } from './bytes.mjs'
import { Tx } from './transaction.mjs'

/** ★ The deployed wallet's number, and it has survived contact with the free tier. */
export const MIN_REQUEST_GAP_MS = 350
export const WOC_MAIN = 'https://api.whatsonchain.com/v1/bsv/main'
/**
 * ★★ A SECOND, INDEPENDENT RELAY, and the reason is policy rather than uptime. WhatsOnChain front-ends
 *   ARC, which applies a stricter policy than GorillaPool's permissive miner, so a transaction one
 *   refuses still has a home at the other.
 *
 * ⚠⚠⚠ AND SAY THIS PRECISELY, BECAUSE THE LOOSE VERSION MISLEADS THE NEXT PERSON TO DEBUG A REJECTION:
 *   **NOTHING IN THIS PATH KNOWS WHAT A COVENANT IS.** Not ARC, not the miners. There is no covenant
 *   rule to fall foul of and no covenant flag to set. A covenant is an ordinary transaction whose
 *   script happens to be long and to use opcodes most transactions never touch.
 *   ⇒ So what a relay actually weighs is generic: SCRIPT SIZE, TRANSACTION SIZE, WHICH OPCODES ARE
 *     CONSIDERED STANDARD, FEE RATE, OUTPUT VALUES. ⇒ When a broadcast is refused, look at those
 *     numbers. "It is a covenant" explains nothing and points debugging in the wrong direction.
 *   ⚠ The deployed wallet's comment says ARC "can bounce non-standard covenant txs" and this inherited
 *     that imprecision until it was corrected.
 *
 * ★ Consensus is stable; what strands one of these transactions is POLICY. One relay is one policy,
 *   which is the whole reason there are two.
 */
export const BANANA_MAIN = 'https://bananablocks.com/api/v1'

// ── the orphan guard's cadence, carried over unchanged ──────────────────────────────────────────────
/** background re-check after a standalone broadcast */
export const CONFIRM_POLL_TRIES = 3, CONFIRM_POLL_INTERVAL_MS = 15000
/** the BLOCKING gate before a child spends its parent - fast, because a tx usually surfaces in seconds */
export const GATE_POLL_TRIES = 10, GATE_POLL_INTERVAL_MS = 2000

export class ChainError extends Error {}

/**
 * A serializing queue: each call waits for the previous one to FINISH, then for the gap.
 *
 * ⚠ The gap is enforced AFTER the request completes, not before it starts, so it is a gap between the
 *   end of one and the start of the next. Enforcing it beforehand would let a slow request be followed
 *   immediately by another, which is the burst being prevented.
 * ⚠ A failed request still pays the gap. A service that is failing is the last one to hammer.
 */
export class RateLimiter {
  constructor(minGapMs = MIN_REQUEST_GAP_MS, sleep = defaultSleep) {
    this.minGapMs = minGapMs
    this.sleep = sleep
    this.chain = Promise.resolve()
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      this.chain = this.chain.then(async () => {
        try { resolve(await fn()) } catch (e) { reject(e) }
        // ⚠ outside the try: the gap is paid whether the call succeeded or not
        await this.sleep(this.minGapMs)
      })
    })
  }
}

const defaultSleep = ms => new Promise(r => setTimeout(r, ms))

export class ChainHttp {
  /**
   * @param fetchImpl  defaults to the platform `fetch`
   * @param sleep      injectable so the suite does not spend real seconds proving the pacing
   */
  constructor({ fetchImpl, sleep = defaultSleep, minGapMs = MIN_REQUEST_GAP_MS, maxRetries = 3 } = {}) {
    this.fetchImpl = fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
    this.sleep = sleep
    this.minGapMs = minGapMs
    this.maxRetries = maxRetries
    this.limiters = new Map()
  }

  /** ⚠ One queue per host. Two services throttle independently, so one queue would halve both. */
  limiter(url) {
    let host
    try { host = new URL(url).host } catch { throw new ChainError(`not a URL: ${url}`) }
    if (!host) throw new ChainError(`no host in URL: ${url}`)
    if (!this.limiters.has(host)) this.limiters.set(host, new RateLimiter(this.minGapMs, this.sleep))
    return this.limiters.get(host)
  }

  async request(url, init) {
    if (this.fetchImpl === null) throw new ChainError('no fetch available and none was injected')
    const lim = this.limiter(url)
    for (let attempt = 0; ; attempt++) {
      const resp = await lim.run(() => this.fetchImpl(url, init))
      if (resp.status !== 429 || attempt >= this.maxRetries) return resp
      // ★ Honour Retry-After when the service sends one - it knows, and we are guessing.
      //   ⚠ Capped: a service asking for an hour should not wedge the wallet for an hour.
      const after = resp.headers?.get?.('retry-after')
      const ms = after !== null && after !== undefined && after !== '' && Number.isFinite(Number(after))
        ? Number(after) * 1000
        : 500 * (attempt + 1)
      await this.sleep(Math.min(ms, 60000))
    }
  }

  async json(url, init) {
    const r = await this.request(url, init)
    if (!r.ok) throw new ChainError(`${url} returned HTTP ${r.status}`)
    return r.json()
  }
}

/**
 * A wallet's view of one address on the chain.
 *
 * ⚠⚠⚠ THIS IS WHERE TWO SHAPES MEET, AND BOTH CONVERSIONS ARE SILENT IF SKIPPED:
 *   | the API says `tx_hash` | DISPLAY order hex ⇒ must be REVERSED into wire bytes, or every signature
 *     commits to an outpoint that does not exist |
 *   | the API omits the script entirely | ⇒ derived here from the ADDRESS, which is exactly what a
 *     P2PKH locking script is made of. Leaving it empty would have the signer commit to an empty
 *     scriptCode: well formed, and refused by every node |
 */
export class Provider {
  constructor(address, { http = new ChainHttp(), base = WOC_MAIN, bananaBase = BANANA_MAIN } = {}) {
    const d = b58decode(address)
    if (!d || d.payload.length !== 20)
      throw new ChainError(`not a P2PKH address: ${address}`)
    if (d.version !== 0x00)
      throw new ChainError(`address version 0x${d.version.toString(16)} is not mainnet P2PKH`)
    this.address = address
    this.script = p2pkhScript(d.payload)
    this.http = http
    this.base = base
    this.bananaBase = bananaBase
    /**
     * ★★★ THE RAW TRANSACTIONS WE HAVE SEEN OR SENT, txid → hex.
     * ⚠ Not a speed cache. This is the ANCESTRY: to spend an unconfirmed output you must be able to
     *   hand a payee the transactions behind it, back to where merkle proofs begin. Keeping the bytes
     *   of what we just broadcast is what makes a child spendable immediately, with no relay round trip
     *   and no waiting for anything to index it.
     */
    this.rawTxs = new Map()
    // ★★★ THESE ARE THE AUTHORITY ON WHAT WE HAVE SPENT, and the ranking is deliberate.
    //
    // ⚠⚠ THE DEPLOYED WALLET RANKS IT THE OTHER WAY UP, calling the indexer *"the source of truth for
    //   mempool spends"* and the local record a *"short-window supplement"*. That is correct on a chain
    //   with REPLACE-BY-FEE, where your own broadcast can be replaced underneath you, so the network's
    //   current view outranks your memory of what you sent.
    //   ⇒ ⛔ THIS CHAIN HAS FIRST-SEEN AND NO RBF. A transaction that is accepted is final, so our own
    //     record of what we spent cannot be invalidated by a replacement. It is the RELIABLE half, and
    //     the indexer's mempool flag is the supplement.
    //
    // ⚠ And the SPV reason, which is the stronger one - stated carefully, because the obvious version of
    //   it is WRONG. SPV is NOT limited to confirmed transactions: an unconfirmed one is verified
    //   through its ANCESTRY, walking back through its inputs until every branch terminates in a
    //   confirmed transaction with a merkle proof. That is why a child can spend an unconfirmed parent
    //   without waiting for a block, and it needs no indexer at all.
    //   ⇒ ★★★ THE REAL LINE IS POSITIVE VERSUS NEGATIVE:
    //     ✅ *is this transaction valid, and descended from real coins?*  — PROVABLE, confirmed or not.
    //     ⛔ *has anyone ELSE spent this output?*                          — NOT provable. There is no
    //        proof of a negative; a conflicting spend is OBSERVED, and observing needs someone with a
    //        mempool view.
    //   ⇒ `isSpentInMempoolTx` asks the second question, which is why it is an indexer feature and why
    //     it is a supplement here. Leaning on it would make the wallet stoppable by one service.
    //
    // ⚠ Both are IN MEMORY, so they are empty after a reload. That is the gap the indexer flag covers,
    //   and it is why the flag is kept rather than removed. Persisting them is the real fix and is not
    //   done here.
    //
    // ⏭⚠⚠ AND THE PORT DROPPED SOMETHING THAT BELONGS HERE. `pending` keeps an outpoint, a value and a
    //   script - enough to SPEND unconfirmed change, which is what it was for. It does NOT keep the raw
    //   ancestor transactions, and the deployed wallet does (`txCache`, txid → raw hex).
    //   ⇒ Those are the raw material for a PARTIAL ANCESTRAL PROOF: hand a payee the unconfirmed
    //     transaction plus its ancestors back to confirmed merkle proofs, and they verify it themselves,
    //     with no indexer and no waiting for a block. That is the point of spending unconfirmed change,
    //     and without the ancestry this map supports only OUR half of it.
    //   ★ THE FORMAT IS THIS PROJECT'S OWN, not a borrowed one: `ProofChain` = `{ genesisTxId, entries }`
    //     with each entry `{ txId, blockHeight, merkleRoot, path: [{ hash, position }] }`. It already
    //     exists on both rails - `tokenProtocol.ts` and the PHP sibling's `spv.php`. ⚠ "Partial" is the
    //     load-bearing word: an unconfirmed ancestor HAS no proof yet, so the chain carries proofs where
    //     it is confirmed and raw transactions where it is not.
    //   ⚠⚠ AND THE ONE RULE THAT TRAVELS WITH IT: anchor `merkleRoot` to the block HEADER, never to the
    //     proof's own claim about itself, and treat a MISSING header as a failure rather than a pass.
    //   ⇒ Wanted when broadcast lands, not before. Noted so it is a decision rather than an omission.
    this.pending = new Map()        // "displayTxid:vout" → utxo
    this.spent = new Set()          // "displayTxid:vout"
  }

  /** @returns rows in THIS wallet's shape: `{ txid: wire bytes, vout, value, script }` */
  #row(u) {
    const display = u.tx_hash
    if (typeof display !== 'string' || display.length !== 64)
      throw new ChainError(`unexpected tx_hash from the service: ${JSON.stringify(display)}`)
    return {
      txid: reversed(fromHex(display)),  // ⚠ display → wire
      vout: u.tx_pos,
      value: u.value,
      script: this.script,
      display,                           // ★ kept for keys and for showing a person
    }
  }

  #map(data) {
    const rows = Array.isArray(data?.result) ? data.result : (Array.isArray(data) ? data : [])
    return rows
      // ── ⚠⚠⚠ A SUPPLEMENT, NOT AN AUTHORITY. Read the note above `spent` before changing this. ──
      // ★ It catches the one case our own record cannot: the same key in use on another device, or a
      //   wallet freshly restored from a phrase with no local history at all.
      // ⚠ Fails OPEN by design. If the field is absent, `!== true` keeps the coin, because the local
      //   record is what actually protects our own spends. An indexer that stops sending a flag must
      //   not be able to freeze a wallet.
      .filter(u => u.isSpentInMempoolTx !== true)
      .map(u => this.#row(u))
  }

  async getUtxos() {
    const all = await this.http.json(`${this.base}/address/${this.address}/unspent/all`)
    const confirmed = this.#map(all)

    // ★ Unconfirmed received coins, so funding can be spent before it confirms. Best effort: if this
    //   endpoint is unavailable the wallet still works, it just cannot spend money that just arrived.
    let unconfirmed = []
    try {
      unconfirmed = this.#map(await this.http.json(`${this.base}/address/${this.address}/unconfirmed/unspent`))
    } catch { /* best effort, deliberately */ }

    const seen = new Set()
    const onchain = []
    for (const u of [...confirmed, ...unconfirmed]) {
      const k = `${u.display}:${u.vout}`
      if (seen.has(k)) continue
      seen.add(k)
      onchain.push(u)
    }

    // ⚠ Anything the service now reports is no longer OUR guess - drop the local copy so the two
    //   cannot drift apart.
    for (const u of onchain) this.pending.delete(`${u.display}:${u.vout}`)
    const isSpent = u => this.spent.has(`${u.display}:${u.vout}`)
    return [...onchain.filter(u => !isSpent(u)), ...[...this.pending.values()].filter(u => !isSpent(u))]
  }

  /**
   * Record a transaction we just broadcast, so its change can fund the NEXT one immediately.
   *
   * ⚠ Without this, two transfers in a row fail: the change output does not appear in the service's
   *   UTXO list until the transaction confirms, so the second transfer finds nothing to spend.
   *
   * @param txid          the broadcast transaction id, in DISPLAY form
   * @param spentInputs   `[{ display, vout }]` - the outpoints this transaction consumed
   * @param changeOutput  `{ vout, value }` if it made change
   */
  registerPendingTx(txid, spentInputs = [], changeOutput = null) {
    for (const i of spentInputs) {
      const k = `${i.display}:${i.vout}`
      this.spent.add(k)
      // ⚠ if we just spent our OWN unconfirmed change, it is no longer pending either
      this.pending.delete(k)
    }
    if (changeOutput && changeOutput.value > 0) {
      this.pending.set(`${txid}:${changeOutput.vout}`, {
        txid: reversed(fromHex(txid)),
        vout: changeOutput.vout,
        value: changeOutput.value,
        script: this.script,
        display: txid,
      })
    }
  }

  // ══ BROADCAST ═════════════════════════════════════════════════════════════════════════════════════

  /**
   * POST the same signed transaction to both relays; resolve with the name of the FIRST to accept.
   * Rejects only if EVERY relay refuses.
   *
   * ★★ Sending the same bytes to two relays carries no double-spend risk: same transaction, same txid.
   *   It buys two independent shots at a miner and removes either service as a single point of failure.
   *   A relay that is down, or CORS-blocked in one environment, simply loses the race.
   *
   * ★ AND THIS IS WHY THE QUEUES ARE PER HOST. On one global queue these two would serialize, paying
   *   the gap between them and turning a race into a sequence. Different hosts, different queues, so
   *   they genuinely go at once.
   *
   * ⚠ The two relays want DIFFERENT BODY SHAPES for the identical transaction. Nothing warns you.
   */
  async relayBroadcast(rawHex) {
    const relays = [
      { name: 'WoC', url: `${this.base}/tx/raw`, body: { txhex: rawHex } },
      { name: 'BananaBlocks', url: `${this.bananaBase}/tx/broadcast`, body: { rawtx: rawHex } },
    ]
    const attempts = relays.map(async r => {
      const resp = await this.http.request(r.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.body),
      })
      // ⚠⚠ A REJECTION IS A REJECTION. No relay's error taxonomy is parsed here, and none should be:
      //   a rejected transaction is simply rejected, the reasons are POLICY, and policy is the thing
      //   that changes without notice. ⇒ A parser built on today's codes goes wrong SILENTLY the day
      //   one is renamed, and it would be classifying something we already act on the same way.
      //   ★ So the relay's own words are carried back verbatim for a person to read, and the only
      //     status with behaviour attached is 429, which is not a rejection at all.
      if (!resp.ok) throw new ChainError(`${r.name} ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
      return r.name
    })
    // ⚠ Promise.any resolves on the first ACCEPTANCE and rejects only when all reject. Promise.race
    //   would resolve on the first SETTLEMENT, so one fast rejection would lose a slower acceptance.
    try { return await Promise.any(attempts) } catch (agg) {
      const errs = (agg?.errors ?? [agg]).map(e => String(e?.message ?? e))
      throw new ChainError(`rejected by every relay: ${errs.join(' | ')}`)
    }
  }

  /**
   * Broadcast a signed transaction. Returns its txid.
   *
   * ⚠⚠⚠ THE TXID IS COMPUTED LOCALLY, NEVER READ FROM THE RELAY'S REPLY. It is determined by the signed
   *   bytes, so we already know it - and an ARC-style relay can answer 200 with a txid for a transaction
   *   it then leaves in ORPHAN_MEMPOOL and never mines (arc #1006). ⇒ Trusting the echo means believing
   *   a service about something you can compute yourself, and believing it at the one moment it is
   *   least reliable.
   *
   * ⚠⚠ THE ORPHAN GUARD IS NOT OPTIONAL, it is just not automatic. Either pass `awaitSeen`, or start
   *   `confirmLanded(txid, rawHex)` yourself. A transaction accepted and then dropped, with nobody
   *   watching, is the failure this whole path exists for.
   *
   * @param awaitSeen BLOCK until the transaction is actually visible in a relay mempool. Pass this when
   *   a CHILD transaction will spend one of its outputs: the child would otherwise be refused as
   *   "Missing inputs", and this throws first so the caller aborts BEFORE broadcasting an orphan child.
   */
  async broadcast(rawHex, { awaitSeen = false } = {}) {
    const txid = Tx.parse(rawHex).txid()
    await this.relayBroadcast(rawHex)
    // ★ Keep the bytes. A spend of one of these outputs can then be built at once - see `rawTxs`.
    this.rawTxs.set(txid, rawHex)
    if (awaitSeen) await this.awaitInMempool(txid, rawHex)
    return txid
  }

  /**
   * Which relay, if any, currently reports this transaction as present.
   * ★ BananaBlocks is asked FIRST: it is independent and non-pruning, so it holds the more complete
   *   mempool view. ⚠ A failure to answer is "not seen", never an error - this is a check, not a fetch.
   */
  async visibleOn(txid) {
    const relays = [
      ['BananaBlocks', `${this.bananaBase}/tx/${txid}`],
      ['WoC', `${this.base}/tx/${txid}/hex`],
    ]
    const seen = await Promise.all(relays.map(async ([name, url]) => {
      try { return (await this.http.request(url)).ok ? name : null } catch { return null }
    }))
    return seen.find(Boolean) ?? null
  }

  /**
   * The BLOCKING parent gate: wait until `txid` is visible so a child may safely spend its output.
   *
   * ⚠⚠ Two rounds with ONE re-broadcast between them. A relay can accept a transaction and then silently
   *   drop it, and re-sending is harmless because it is the same bytes and therefore the same txid.
   * ★ The first check is immediate, so the ordinary case returns almost at once.
   * ⛔ Throws if it never appears. That is the point: the caller must abort rather than broadcast a
   *   child whose parent no node has.
   */
  async awaitInMempool(txid, rawHex) {
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < GATE_POLL_TRIES; i++) {
        const on = await this.visibleOn(txid)
        if (on) return on
        await this.http.sleep(GATE_POLL_INTERVAL_MS)
      }
      // ⚠ swallowed deliberately: the ORIGINAL acceptance may still surface, so keep polling either way
      if (round === 0) try { await this.relayBroadcast(rawHex) } catch { /* keep polling */ }
    }
    throw new ChainError(
      `${txid} never appeared in a relay mempool. ⇒ Aborting before the dependent transaction, which `
    + `would be refused as "Missing inputs".`)
  }

  /**
   * The non-blocking orphan guard for a standalone transaction: poll on a slow cadence and re-broadcast
   * once if it has vanished. ★ Best effort - the caller already holds the txid and need not wait.
   */
  async confirmLanded(txid, rawHex) {
    for (let i = 0; i < CONFIRM_POLL_TRIES; i++) {
      await this.http.sleep(CONFIRM_POLL_INTERVAL_MS)
      const on = await this.visibleOn(txid)
      if (on) return on
    }
    try { await this.relayBroadcast(rawHex); return 're-broadcast' } catch { return null }
  }

  /**
   * A transaction's raw bytes. ★ Ours first: what we just broadcast is already here, and a relay may
   * not have indexed it yet.
   */
  async getRawTransaction(txid) {
    const held = this.rawTxs.get(txid)
    if (held) return held
    const r = await this.http.request(`${this.base}/tx/${txid}/hex`)
    if (!r.ok) throw new ChainError(`raw transaction fetch failed for ${txid}: HTTP ${r.status}`)
    const hex = (await r.text()).trim()
    // ⚠⚠ VERIFY WHAT WE WERE GIVEN. A relay hands back bytes; only the hash says they are the ones
    //   asked for. Caching an unchecked response would poison the ancestry for everything after it.
    const got = Tx.parse(hex).txid()
    if (got !== txid) throw new ChainError(`asked for ${txid} and was given ${got}`)
    this.rawTxs.set(txid, hex)
    return hex
  }

  /** ★ For a person, and for the keys above. `display` is what an explorer shows. */
  static displayOf(wireTxid) { return toHex(reversed(wireTxid)) }
}
