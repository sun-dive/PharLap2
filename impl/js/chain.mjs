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

// ⚠ THE ORPHAN GUARD'S CADENCE IS NOT DEFINED HERE. It belongs to the guard, which lives in the wallet
//   layer; duplicating it in the transport would give two places to change and one of them would be
//   missed. This module owns only what the transport itself needs.

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
 * ⛔ THE `Provider` CLASS THAT STOOD HERE IS GONE, and its removal is the point rather than a tidy-up.
 *
 * ⚠⚠ It reimplemented eight methods of `src/walletProvider.ts` — getUtxos, broadcast, relayBroadcast,
 *   visibleOn, awaitInMempool, confirmLanded, registerPendingTx, getRawTransaction — and not one of
 *   them was unique to it. That file is 614 lines of deployed code of which SEVEN touched the removed
 *   library; rewriting a subset of it was work that did not need doing, and it silently dropped the
 *   other sixteen methods, including the whole merkle-proof layer with its two-source adapters.
 *
 * ★★★ SO THE BOUNDARY IS: this module is the TRANSPORT. `ChainHttp` and `RateLimiter` are genuinely new
 *   and genuinely better than what they replace — per-host queues, `Retry-After`, an injectable clock.
 *   Everything ABOVE the transport already exists and is adapted, not rebuilt.
 */
