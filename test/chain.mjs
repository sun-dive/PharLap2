// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The chain service — graded OFFLINE, with the transport and the clock injected.
 *
 * ★★★ A RATE LIMITER TESTED ONLY AGAINST A LIVE API HAS NOT BEEN TESTED. The cases that matter are the
 *   ones a service will not produce on demand: a 429 storm, a Retry-After header, two callers racing,
 *   an endpoint that fails. All of them are constructed here, and none of them touch the network.
 *
 * ★★ AND THE LAST TEST IS THE ONE THAT MATTERS MOST: fetched UTXOs are fed straight through selection,
 *   building and signing, and the result is verified. Each module was already graded alone; this is the
 *   only check that the SHAPES actually meet - a display txid where wire bytes belong, or a missing
 *   script, produces a perfectly well formed transaction that no node will accept.
 */
import { Provider, ChainHttp, RateLimiter, ChainError, MIN_REQUEST_GAP_MS,
         CONFIRM_POLL_TRIES, CONFIRM_POLL_INTERVAL_MS, GATE_POLL_TRIES, GATE_POLL_INTERVAL_MS } from '../impl/js/chain.mjs'
import { Signer, txidToWire } from '../impl/js/signer.mjs'
import { select, build } from '../impl/js/coins.mjs'
import { Script } from '../impl/js/script.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { toHex, equals, reversed, fromHex } from '../impl/js/bytes.mjs'

let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }
const rejects = async (p, match) => {
  try { await p; return false } catch (e) { return String(e.message).includes(match) }
}

// ── a fake service ──────────────────────────────────────────────────────────────────────────────────
const resp = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: k => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
})
/** records every sleep instead of performing it, so the suite costs no real time */
const clock = () => { const slept = []; return { slept, sleep: async ms => { slept.push(ms) } } }

const ME = Signer.fromSeed(new Uint8Array(64).fill(3))
const ADDR = ME.address()
const BASE = 'https://woc.test/v1/bsv/main'
// ⚠ a genuinely different HOST, so the two relays get their own queues and really do race
const BANANA = 'https://banana.test/api/v1'
const row = (hash, pos, value, extra = {}) => ({ tx_hash: hash, tx_pos: pos, value, ...extra })
// ⚠⚠ ASYMMETRIC ON PURPOSE. My first attempt used 'aa'.repeat(32), which is a PALINDROME: reversing it
//   is a no-op, so the display-to-wire conversion could not be exercised at all and the check that
//   caught it looked like a code failure. Test data has to be able to tell the two apart.
const A = 'aa'.repeat(31) + '01'
const B = 'bb'.repeat(31) + '02'
const C = 'cc'.repeat(31) + '03'

/** a provider whose transport answers from a table of url-substring → response */
function provider(table, { maxRetries = 3 } = {}) {
  const calls = []
  const c = clock()
  const fetchImpl = async url => {
    calls.push(url)
    for (const [frag, r] of table) if (url.includes(frag)) return typeof r === 'function' ? r(calls.length) : r
    return resp(null, 404)
  }
  const http = new ChainHttp({ fetchImpl, sleep: c.sleep, maxRetries })
  return { p: new Provider(ADDR, { http, base: BASE, bananaBase: BANANA }), calls, slept: c.slept, http }
}

// ── ★ the locking script is DERIVED from the address, and must equal the key's own ───────────────────
// ⚠ Not a tautology: one is built from the base58 address, the other from the public key. They agree
//   only if the derivation is right, and the service never sends a script at all.
{
  const { p } = provider([])
  ok(equals(p.script, ME.lockingScript()),
     '★★ the script derived from the ADDRESS equals the one derived from the KEY')
  ok(toHex(p.script).startsWith('76a914') && toHex(p.script).endsWith('88ac'), '…and it is P2PKH shaped')
}
ok(await rejects((async () => new Provider('not-an-address'))(), 'not a P2PKH address'),
   '⛔ a malformed address is refused')
// ⚠ a REAL P2SH address, checksum and all - my first one was invalid base58check, so it failed at the
//   earlier branch and proved nothing about the version check.
ok(await rejects((async () => new Provider('37jMtwxS6iNvfbdPL4mxaxJWnwvLXWeRRp'))(), 'not mainnet P2PKH'),
   '⛔ a valid P2SH address is refused for its VERSION byte, not silently treated as P2PKH')
// ⚠ the RIGHT version with the WRONG payload length. Nothing else covered this, and a mutation removing
//   the length check survived: a 21-byte payload would build a locking script of the wrong shape.
ok(await rejects((async () => new Provider('13q1P3NyDM6J9SNKPaBC7rMQ9NMEabXocoX'))(), 'not a P2PKH address'),
   '⛔ a mainnet-version address whose payload is not 20 bytes is refused')

// ── ⚠ the two conversions the service forces on us ──────────────────────────────────────────────────
{
  const { p } = provider([['unspent/all', resp([row(A, 1, 5000)])], ['unconfirmed', resp([])]])
  const [u] = await p.getUtxos()
  ok(u.txid instanceof Uint8Array && u.txid.length === 32, 'the txid comes back as 32 wire bytes')
  ok(toHex(u.txid) === toHex(reversed(fromHex(A))), '★★ …REVERSED from the display form the service sent')
  ok(toHex(u.txid) !== A, '⚠ …and genuinely different from it, so the reversal is not a no-op')
  ok(u.vout === 1 && u.value === 5000, 'vout and value carry across')
  ok(equals(u.script, ME.lockingScript()), '★ the script is filled in, not left empty')
}

// ── the indexer's mempool flag: a SUPPLEMENT, not an authority ──────────────────────────────────────
// ⚠⚠ This chain has FIRST-SEEN and no RBF, so our own record of what we spent is the reliable half and
//   cannot be invalidated by a replacement. The flag covers only what that record cannot know: the same
//   key on another device, or a wallet restored from a phrase with no local history.
// ⚠ It is also an INDEXER feature, but for a NARROWER reason than "SPV only sees blocks" - that is
//   wrong. An unconfirmed transaction IS verifiable, through its ancestry back to confirmed proofs.
//   ⇒ The real line is positive versus negative: *is this valid and descended from real coins* can be
//     proved; *has anyone else spent this* cannot, because there is no proof of a negative.
{
  const { p } = provider([
    ['unspent/all', resp([row(A, 0, 1000), row(B, 0, 2000, { isSpentInMempoolTx: true }), row(C, 0, 3000)])],
    ['unconfirmed', resp([])],
  ])
  const u = await p.getUtxos()
  ok(u.length === 2 && !u.some(x => x.display === B), 'a UTXO flagged as mempool-spent is excluded')
  ok(u.reduce((t, x) => t + x.value, 0) === 4000, '…and the rest are kept')
}
{
  // ⚠⚠ FAILS OPEN, DELIBERATELY. If the indexer stops sending the field, the coin is kept: an indexer
  //   that drops a flag must not be able to freeze a wallet. The local record is what protects us.
  const { p } = provider([['unspent/all', resp([row(A, 0, 1000)])], ['unconfirmed', resp([])]])
  ok((await p.getUtxos()).length === 1, '⚠ with the flag ABSENT the coin is kept - the check fails open')
}
{
  // ★★ …and the local record still holds without any help from the indexer, which is the ranking that
  //   first-seen makes correct: an accepted transaction is final, so what we spent stays spent.
  const { p } = provider([['unspent/all', resp([row(A, 0, 1000)])], ['unconfirmed', resp([])]])
  p.registerPendingTx(C, [{ display: A, vout: 0 }], null)
  ok((await p.getUtxos()).length === 0,
     '★★ an outpoint WE spent is withheld on our own record alone, with no flag from the service')
}

// ── merging the two endpoints ───────────────────────────────────────────────────────────────────────
{
  const { p } = provider([
    ['unspent/all', resp({ result: [row(A, 0, 1000)] })],   // ★ the { result: [...] } envelope too
    ['unconfirmed', resp([row(A, 0, 1000), row(B, 3, 700)])],
  ])
  const u = await p.getUtxos()
  ok(u.length === 2, `confirmed and unconfirmed are merged and DEDUPED by outpoint (got ${u.length})`)
  ok(u.some(x => x.display === B && x.vout === 3), 'an unconfirmed receipt is spendable')
}
{
  // ⚠ unconfirmed is BEST EFFORT: if it fails the wallet still works
  const { p } = provider([['unspent/all', resp([row(A, 0, 1000)])], ['unconfirmed', resp(null, 500)]])
  const u = await p.getUtxos()
  ok(u.length === 1, '⚠ a failing unconfirmed endpoint does not take the wallet down')
}
{
  const { p } = provider([['unspent/all', resp(null, 503)]])
  ok(await rejects(p.getUtxos(), 'HTTP 503'), '⛔ …but a failing MAIN endpoint is reported, never silently empty')
}

// ── ⛔ 429 is not an error ───────────────────────────────────────────────────────────────────────────
{
  const { p, slept, calls } = provider([
    ['unspent/all', n => (n <= 2 ? resp(null, 429) : resp([row(A, 0, 1000)]))],
    ['unconfirmed', resp([])],
  ])
  const u = await p.getUtxos()
  ok(u.length === 1, '⛔ two 429s are retried and the call SUCCEEDS')
  ok(calls.filter(c => c.includes('unspent/all')).length === 3, '…after exactly 3 attempts')
  ok(slept.includes(500) && slept.includes(1000), '★ backoff is 500 then 1000 ms')
}
{
  const { p, calls } = provider([['unspent/all', resp(null, 429)]], { maxRetries: 3 })
  ok(await rejects(p.getUtxos(), 'HTTP 429'), 'an unrelenting 429 eventually surfaces')
  ok(calls.length === 4, '…after 1 attempt plus 3 retries, not forever')
}
{
  // ★ Retry-After is honoured when sent, and CAPPED so a service cannot wedge the wallet
  const { p, slept } = provider([
    ['unspent/all', n => (n === 1 ? resp(null, 429, { 'retry-after': '2' }) : resp([]))],
    ['unconfirmed', resp([])],
  ])
  await p.getUtxos()
  ok(slept.includes(2000), '★ Retry-After: 2 waits 2000 ms, not the guessed 500')
}
{
  const { p, slept } = provider([
    ['unspent/all', n => (n === 1 ? resp(null, 429, { 'retry-after': '99999' }) : resp([]))],
    ['unconfirmed', resp([])],
  ])
  await p.getUtxos()
  ok(slept.includes(60000) && !slept.includes(99999000), '⚠ …but an absurd Retry-After is capped at 60 s')
}

// ── ★ the queue actually serializes ─────────────────────────────────────────────────────────────────
{
  // ⚠ Proved by OVERLAP, not by timing: a second call must not start before the first finishes.
  let live = 0, maxLive = 0
  const lim = new RateLimiter(0, async () => {})
  const job = () => lim.run(async () => {
    live++; maxLive = Math.max(maxLive, live)
    await new Promise(r => setTimeout(r, 5))
    live--
    return true
  })
  await Promise.all([job(), job(), job(), job()])
  ok(maxLive === 1, `★★ four concurrent callers never overlap (peak in flight: ${maxLive})`)
}
{
  // ⚠ the gap is paid even when the request THROWS - a failing service is the last one to hammer
  // ⚠⚠ `>= 1` WAS TOO WEAK and a mutation walked through it: the following SUCCESSFUL call also sleeps,
  //   so the count stayed above zero with the failure path paying nothing. Count exactly.
  const c = clock()
  const lim = new RateLimiter(350, c.sleep)
  try { await lim.run(async () => { throw new Error('boom') }) } catch { /* expected */ }
  ok(c.slept.filter(x => x === 350).length === 1, '⚠ a FAILED request pays the gap, on its own')
  await lim.run(async () => true)
  ok(c.slept.filter(x => x === 350).length === 2, '…and a successful one pays it too')
}
{
  const http = new ChainHttp({ fetchImpl: async () => resp({}), sleep: async () => {} })
  const a = http.limiter('https://one.test/x'), b = http.limiter('https://two.test/y')
  ok(a !== b, '★ each HOST gets its own queue, so one slow service cannot stall another')
  ok(http.limiter('https://one.test/z') === a, '…and the same host reuses its queue')
  ok(MIN_REQUEST_GAP_MS === 350, '★ the gap is the deployed wallet’s 350 ms, carried over unchanged')
}

// ── ★ pending UTXOs: what makes two transfers in a row possible ─────────────────────────────────────
{
  const { p } = provider([['unspent/all', resp([row(A, 0, 1000)])], ['unconfirmed', resp([])]])
  p.registerPendingTx(B, [{ display: A, vout: 0 }], { vout: 1, value: 800 })
  const u = await p.getUtxos()
  ok(u.length === 1 && u[0].display === B, '★★ the spent input is gone and the pending change is spendable')
  ok(u[0].value === 800 && equals(u[0].script, ME.lockingScript()), '…with its value and script intact')
  ok(u[0].txid instanceof Uint8Array && toHex(u[0].txid) === toHex(reversed(fromHex(B))),
     '⚠ …and its txid in WIRE order, like every other row')
}
{
  // ⚠ once the service reports it, OUR copy must go - two sources of truth drift apart
  const { p } = provider([['unspent/all', resp([row(B, 1, 800)])], ['unconfirmed', resp([])]])
  p.registerPendingTx(B, [], { vout: 1, value: 800 })
  const u = await p.getUtxos()
  ok(u.length === 1, '⚠ a pending UTXO the service now reports is NOT returned twice')
  ok(p.pending.size === 0, '…and the local copy is dropped')
}
{
  const { p } = provider([['unspent/all', resp([row(A, 0, 1000)])], ['unconfirmed', resp([])]])
  p.registerPendingTx(C, [{ display: A, vout: 0 }], null)
  ok((await p.getUtxos()).length === 0, '⛔ an outpoint we already spent is never offered again')
}

// ── ★★★ END TO END: fetch → select → build → sign → verify ──────────────────────────────────────────
// ⚠⚠ This is the only test that proves the SHAPES meet. Every module passed alone; a display txid where
//   wire bytes belong, or an empty script, still yields a transaction that serializes and that no node
//   will accept.
{
  const { p } = provider([
    ['unspent/all', resp([row(A, 0, 5000), row(B, 2, 3000)])],
    ['unconfirmed', resp([])],
  ])
  const utxos = await p.getUtxos()
  const other = Signer.fromSeed(new Uint8Array(64).fill(4))
  const sel = select(utxos, [{ value: 2000, script: other.lockingScript() }], ME.lockingScript())
  ok(sel.inputs.length > 0, `selection funded the spend (${sel.inputs.length} input(s), fee ${sel.fee})`)

  const tx = build(sel, [{ value: 2000, script: other.lockingScript() }], ME.lockingScript())
  ME.signP2PKH(tx, sel.inputs)          // ⚠ the alignment guard runs here, on real fetched rows

  let verified = 0
  tx.inputs.forEach((inp, i) => {
    const sig = Script.fromBinary(inp.script).chunks[0]
    if (Signer.verifyInput(tx, i, sel.inputs[i].script, sel.inputs[i].value, ME.publicKey(), sig.data)) verified++
  })
  ok(verified === tx.inputs.length,
     `★★★ every input of a transaction built from FETCHED rows verifies (${verified}/${tx.inputs.length})`)
  ok(tx.txid().length === 64, `…and it has a txid: ${tx.txid().slice(0, 16)}…`)
  ok(Tx.parse(tx.hex()).hex() === tx.hex(), '★ and the signed transaction round-trips through the parser')
}


// ══ BROADCAST ═══════════════════════════════════════════════════════════════════════════════════════

// a real signed transaction, so the txid is a genuine one rather than a literal
const bTx = (() => {
  const u = { txid: txidToWire(A), vout: 0, value: 5000, script: ME.lockingScript() }
  const t = new Tx(1, [{ txid: u.txid, vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                      [{ value: 4000, script: ME.lockingScript() }], 0)
  ME.signP2PKH(t, [u])
  return { hex: t.hex(), txid: t.txid() }
})()

// ── ⚠⚠⚠ the txid is OURS, never the relay's echo ────────────────────────────────────────────────────
{
  // ⛔ The relay replies 200 with a DIFFERENT txid. An ARC-style relay can do this and then leave the
  //   transaction in ORPHAN_MEMPOOL, never mining it (arc #1006). We already know the answer.
  const LIE = 'de'.repeat(32)
  const { p, calls } = provider([['tx/raw', resp({ txid: LIE })], ['tx/broadcast', resp(null, 500)]])
  const got = await p.broadcast(bTx.hex)
  ok(got === bTx.txid, '★★★ the txid is computed from the SIGNED BYTES, not read from the reply')
  ok(got !== LIE, '⛔ …and the relay’s contradicting echo is ignored entirely')
  ok(calls.some(c => c.includes('woc.test')) && calls.some(c => c.includes('banana.test')),
     '★ both relays were tried')
}

// ── ★ two relays, different body shapes, first acceptance wins ──────────────────────────────────────
{
  const bodies = []
  const c = clock()
  const fetchImpl = async (url, init) => {
    bodies.push([url, init?.body])
    return url.includes('banana.test') ? resp({ ok: true }) : resp('policy', 400)
  }
  const http = new ChainHttp({ fetchImpl, sleep: c.sleep })
  const p = new Provider(ADDR, { http, base: BASE, bananaBase: BANANA })
  const got = await p.broadcast(bTx.hex)
  ok(got === bTx.txid, '★★ WoC refusing on POLICY does not stop the broadcast - the permissive miner carries it')
  const woc = bodies.find(([u]) => u.includes('woc.test'))[1]
  const ban = bodies.find(([u]) => u.includes('banana.test'))[1]
  ok(JSON.parse(woc).txhex === bTx.hex, '⚠ WoC is sent { txhex }')
  ok(JSON.parse(ban).rawtx === bTx.hex, '⚠ BananaBlocks is sent { rawtx } - same bytes, different key')
  ok(JSON.parse(woc).txhex === JSON.parse(ban).rawtx, '★ …and it is the SAME transaction, so one txid')
}
{
  const { p } = provider([['tx/raw', resp('bad', 400)], ['tx/broadcast', resp('nope', 400)]])
  ok(await rejects(p.broadcast(bTx.hex), 'rejected by every relay'), '⛔ only ALL refusing is a failure')
  ok(await rejects(p.broadcast(bTx.hex), 'WoC 400'), '…and the message names each relay and its status')
}
{
  // ⚠⚠ Promise.any, NOT Promise.race: a FAST rejection must not beat a SLOW acceptance.
  const c = clock()
  const fetchImpl = async url => url.includes('woc.test')
    ? resp('instant no', 400)
    : new Promise(r => setTimeout(() => r(resp({ ok: true })), 20))
  const http = new ChainHttp({ fetchImpl, sleep: c.sleep })
  const p = new Provider(ADDR, { http, base: BASE, bananaBase: BANANA })
  ok(await p.broadcast(bTx.hex) === bTx.txid, '★★ a fast rejection does not beat a slow acceptance')
}

// ── ★ the ancestry is kept ──────────────────────────────────────────────────────────────────────────
{
  const { p, calls } = provider([['tx/raw', resp({})], ['tx/broadcast', resp({})]])
  await p.broadcast(bTx.hex)
  ok(p.rawTxs.get(bTx.txid) === bTx.hex, '★★★ the raw bytes are RETAINED - the ancestry a payee needs')
  const before = calls.length
  ok(await p.getRawTransaction(bTx.txid) === bTx.hex, '★ …and served from our own copy')
  ok(calls.length === before, '⚠ …with NO network call, so a child is spendable immediately')
}
{
  // ⛔ bytes from a relay are checked against the txid we asked for
  const { p } = provider([[`tx/${bTx.txid}/hex`, resp(bTx.hex)]])
  ok(await p.getRawTransaction(bTx.txid) === bTx.hex, 'a fetched raw transaction is returned')
  const other = 'ee'.repeat(32)
  const { p: p2 } = provider([[`tx/${other}/hex`, resp(bTx.hex)]])
  ok(await rejects(p2.getRawTransaction(other), 'was given'),
     '⛔★ a relay handing back the WRONG transaction is refused, not cached')
}

// ── the orphan guard ────────────────────────────────────────────────────────────────────────────────
{
  // ★ BananaBlocks is asked FIRST - independent and non-pruning, so the more complete mempool view
  // ⚠ match on the HOST: the path is /api/v1/tx/<txid>, so 'banana.test/tx/' matches nothing
  const { p, calls } = provider([['banana.test', resp('seen')], ['woc.test', resp(null, 404)]])
  ok(await p.visibleOn(bTx.txid) === 'BananaBlocks', '★ visibility prefers the non-pruning relay')
  ok(calls[0].includes('banana.test'), '…and it is asked first')
}
{
  const { p } = provider([['tx/', resp(null, 404)]])
  ok(await p.visibleOn(bTx.txid) === null, '⚠ nobody reporting it is "not seen", not an error')
}
{
  const { p } = provider([['tx/', () => { throw new Error('network down') }]])
  ok(await p.visibleOn(bTx.txid) === null, '⚠ a relay that THROWS is also just "not seen"')
}
{
  // ⛔ never visible ⇒ throws, so the caller aborts BEFORE broadcasting an orphan child
  let broadcasts = 0
  const c = clock()
  const fetchImpl = async (url, init) => {
    if (init?.method === 'POST') { broadcasts++; return resp({}) }
    return resp(null, 404)
  }
  const http = new ChainHttp({ fetchImpl, sleep: c.sleep })
  const p = new Provider(ADDR, { http, base: BASE, bananaBase: BANANA })
  ok(await rejects(p.awaitInMempool(bTx.txid, bTx.hex), 'Missing inputs'),
     '⛔ a parent that never appears ABORTS the child, naming why')
  ok(broadcasts === 2, `★ …after exactly ONE re-broadcast between the two rounds (${broadcasts} relay posts)`)
  ok(c.slept.filter(x => x === GATE_POLL_INTERVAL_MS).length === GATE_POLL_TRIES * 2,
     '⚠ …having polled both rounds in full')
}
{
  // ★ the ordinary case returns at once: the first check is immediate, before any sleep
  const c = clock()
  const http = new ChainHttp({ fetchImpl: async () => resp('here'), sleep: c.sleep })
  const p = new Provider(ADDR, { http, base: BASE, bananaBase: BANANA })
  ok(await p.awaitInMempool(bTx.txid, bTx.hex) === 'BananaBlocks', 'a visible parent clears the gate')
  // ⚠ NOT `slept.length === 0`: the rate limiter pays its own 350 ms gap after every request, and that
  //   is recorded too. The claim is about the GATE's wait, so count the gate's interval specifically.
  ok(c.slept.filter(x => x === GATE_POLL_INTERVAL_MS).length === 0,
     '★ …with no GATE wait at all, because the first check comes before the first sleep')
}
{
  // the background guard re-broadcasts once if the tx has vanished
  let posts = 0
  const c = clock()
  const http = new ChainHttp({
    fetchImpl: async (url, init) => { if (init?.method === 'POST') { posts++; return resp({}) } return resp(null, 404) },
    sleep: c.sleep,
  })
  const p = new Provider(ADDR, { http, base: BASE, bananaBase: BANANA })
  ok(await p.confirmLanded(bTx.txid, bTx.hex) === 're-broadcast', 'the background guard re-sends a vanished tx')
  ok(c.slept.filter(x => x === CONFIRM_POLL_INTERVAL_MS).length === CONFIRM_POLL_TRIES,
     `⚠ …after ${CONFIRM_POLL_TRIES} slow polls, not immediately`)
}
{
  // ⚠⚠ MUTATION TESTING FOUND THIS: checking only the RETURN VALUE proves nothing, because the txid is
  //   the same whether the gate ran or not. Ignoring `awaitSeen` entirely walked straight through it.
  //   ⇒ Assert the VISIBILITY CHECK actually happened, and that without the flag it does not.
  const vis = `/tx/${bTx.txid}`
  const table = [['tx/raw', resp({})], ['tx/broadcast', resp({})], ['tx/', resp('seen')]]
  const a = provider(table)
  ok(await a.p.broadcast(bTx.hex, { awaitSeen: true }) === bTx.txid, 'awaitSeen returns the txid')
  ok(a.calls.some(c => c.includes(vis)), '★★ …and it really DID wait for the tx to be visible')
  const b = provider(table)
  ok(await b.p.broadcast(bTx.hex) === bTx.txid, 'without the flag it returns the txid too')
  ok(!b.calls.some(c => c.includes(vis)),
     '⚠ …and does NOT block - so the two paths are genuinely different')
}


// ══ ⚠⚠⚠ THE INVARIANT: EVERY REQUEST THIS MODULE MAKES IS PACED ═════════════════════════════════════
//
// ⚠⚠ A polling loop is exactly where a bypass hides. It is the highest-frequency path in the wallet, it
//   runs while nothing else is happening, and skipping the queue there LOOKS harmless because each call
//   is small - which is how you burst a free tier at the one moment you most need it answering.
//   ⇒ THE DEPLOYED WALLET HAS THIS BYPASS: its `relayBroadcast` uses the queue and its `visibleOn` calls
//     `fetch` directly. Ported faithfully that would have come across, so it is pinned here.
//
// ★ The method is general rather than per-call: the limiter pays a gap of exactly `minGapMs` after EVERY
//   request it handles, so if the count of those gaps equals the count of fetches, nothing went round it.
//   A distinctive gap value keeps it apart from the poll intervals and the 429 backoff.
{
  const GAP = 7777                              // ⚠ distinctive: not 2000, 15000, 500 or 1000
  const slept = []
  let fetches = 0
  const fetchImpl = async (url, init) => {
    fetches++
    if (init?.method === 'POST') return resp({})
    return resp(null, 404)                      // never visible, so the gate runs its full course
  }
  const http = new ChainHttp({ fetchImpl, sleep: async ms => { slept.push(ms) }, minGapMs: GAP })
  const p = new Provider(ADDR, { http, base: BASE, bananaBase: BANANA })

  await rejects(p.awaitInMempool(bTx.txid, bTx.hex), 'Missing inputs')
  const paced = slept.filter(x => x === GAP).length
  ok(fetches > 20, `the gate really did poll hard (${fetches} requests)`)
  ok(paced === fetches, `★★★ EVERY one of the ${fetches} gate requests went through the queue (${paced} paced)`)
}
{
  // ★ and the same invariant across the OTHER paths, so this is a module property rather than one fix
  const GAP = 7777
  const slept = []
  let fetches = 0
  const fetchImpl = async (url, init) => {
    fetches++
    if (init?.method === 'POST') return resp({})
    if (url.includes('unspent')) return resp([])
    if (url.includes('/hex')) return resp(bTx.hex)
    return resp('seen')
  }
  const http = new ChainHttp({ fetchImpl, sleep: async ms => { slept.push(ms) }, minGapMs: GAP })
  const p = new Provider(ADDR, { http, base: BASE, bananaBase: BANANA })
  await p.getUtxos()
  await p.broadcast(bTx.hex)
  await p.visibleOn(bTx.txid)
  await p.getRawTransaction('ff'.repeat(32)).catch(() => {})
  const paced = slept.filter(x => x === GAP).length
  ok(paced === fetches, `★★ fetch, broadcast, visibility and raw-tx are all paced (${paced}/${fetches})`)
}
{
  // ⚠ and the cadence is SANE, not merely present: one poll costs the interval plus one gap per host
  const perPoll = GATE_POLL_INTERVAL_MS + MIN_REQUEST_GAP_MS
  ok(perPoll >= 2000 && perPoll <= 3000,
     `★ the gate asks each relay about every ${perPoll} ms - fast enough to catch a tx in seconds, `
   + `slow enough to be polite`)
  ok(GATE_POLL_TRIES * perPoll < 30000, `…and the whole gate gives up inside ${Math.round(GATE_POLL_TRIES * perPoll / 1000)} s per round`)
}

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [chain · offline, injected transport]`)
process.exit(fail === 0 ? 0 : 1)
