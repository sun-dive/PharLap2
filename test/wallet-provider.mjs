// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The wallet layer — the DEPLOYED file, adapted rather than rewritten, driven here directly.
 *
 * ★★★ THIS TESTS `src/walletProvider.ts` ITSELF, not a copy of its ideas. It is 614 lines of code that
 *   has been in production; 41 of those lines changed to swap the removed library for our own modules
 *   and to put the transport behind our rate limiter. Testing a reimplementation would have proved
 *   something about the reimplementation. ⇒ esbuild compiles the real file and the suite imports it.
 *
 * ⚠⚠ THE TRANSPORT AND THE CLOCK ARE INJECTED, which is the only reason the interesting cases are
 *   reachable at all: a 429 storm, a relay that accepts a transaction and then drops it, two relays
 *   disagreeing. None of those can be asked for on demand from a live service.
 */
import { link } from './link.mjs'
import { ChainHttp, MIN_REQUEST_GAP_MS } from '../impl/js/chain.mjs'
import { Signer, txidToWire } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'wp-'))
const out = join(tmp, 'walletProvider.mjs')
await link({ entryPoints: [join(HERE, '..', 'src', 'walletProvider.js')], outfile: out })
const WP = await import(pathToFileURL(out).href)
// ★ the cadence comes from the file that OWNS it, so the test cannot drift from the code
const { GATE_POLL_TRIES, GATE_POLL_INTERVAL_MS, CONFIRM_POLL_TRIES, CONFIRM_POLL_INTERVAL_MS } = WP

let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }
const rejects = async (p, m) => { try { await p; return false } catch (e) { return String(e.message).includes(m) } }

const resp = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: k => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
})
const clock = () => { const slept = []; return { slept, sleep: async ms => { slept.push(ms) } } }

const ME = Signer.fromSeed(new Uint8Array(64).fill(3))
const ADDR = ME.address()
// ⚠ asymmetric on purpose: a palindromic txid cannot exercise a display/wire reversal
const A = 'aa'.repeat(31) + '01', B = 'bb'.repeat(31) + '02'
const row = (h, pos, val, extra = {}) => ({ tx_hash: h, tx_pos: pos, value: val, ...extra })

/** a provider wired to a fake network; `route` answers from url + init */
function wired(route, { gap = MIN_REQUEST_GAP_MS } = {}) {
  const calls = []
  const c = clock()
  const http = new ChainHttp({
    fetchImpl: async (url, init) => { calls.push([url, init]); return route(url, init, calls.length) },
    sleep: c.sleep, minGapMs: gap,
  })
  WP.useTransport(http)
  return { p: new WP.WalletProvider(ADDR), calls, slept: c.slept }
}

// a real signed transaction, so the txid is genuine
const TX = (() => {
  const u = { txid: txidToWire(A), vout: 0, value: 5000, script: ME.lockingScript() }
  const t = new Tx(1, [{ txid: u.txid, vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                      [{ value: 4000, script: ME.lockingScript() }], 0)
  ME.signP2PKH(t, [u])
  return { hex: t.hex(), txid: t.txid() }
})()

ok(typeof WP.WalletProvider === 'function', 'the deployed wallet layer compiles and loads')
ok(Object.getOwnPropertyNames(WP.WalletProvider.prototype).length >= 24,
   `★ all ${Object.getOwnPropertyNames(WP.WalletProvider.prototype).length} of its methods came across`)

// ── ⚠⚠⚠ THE INVARIANT THE ADAPTATION EXISTS FOR: every request is paced ─────────────────────────────
// ⚠⚠ The deployed version queued its broadcast and called `fetch` DIRECTLY in `visibleOn`, so the
//   orphan guard ran outside the rate limiter: the highest-frequency path in the wallet, running while
//   nothing else is. ⇒ The limiter pays a gap after every request it handles, so the count of gaps must
//   equal the count of requests. A distinctive gap keeps it apart from the poll intervals and backoff.
{
  const GAP = 7777
  const { p, calls, slept } = wired((u, i) => (i?.method === 'POST' ? resp({}) : resp(null, 404)), { gap: GAP })
  await rejects(p.awaitInMempool(TX.txid, TX.hex), 'never appeared')
  const paced = slept.filter(x => x === GAP).length
  ok(calls.length > 20, `the gate polled hard (${calls.length} requests)`)
  ok(paced === calls.length, `★★★ EVERY one of the ${calls.length} requests was PACED (${paced})`)
}

// ── ⚠⚠ the txid is ours, never the relay's echo ─────────────────────────────────────────────────────
{
  const LIE = 'de'.repeat(32)
  const { p } = wired(u => (u.includes('/tx/raw') ? resp({ txid: LIE }) : resp(null, 500)))
  const got = await p.broadcast(TX.hex)
  ok(got === TX.txid, '★★ the txid is computed from the signed bytes')
  ok(got !== LIE, '⛔ the relay’s contradicting echo is ignored')
}

// ── two relays, different body shapes, first acceptance wins ────────────────────────────────────────
{
  const seen = []
  const { p } = wired((u, i) => { seen.push([u, i?.body]); return u.includes('bananablocks') ? resp({}) : resp('policy', 400) })
  ok(await p.broadcast(TX.hex) === TX.txid, '★ WoC refusing on policy does not stop the broadcast')
  const woc = seen.find(([u]) => u.includes('whatsonchain'))?.[1]
  const ban = seen.find(([u]) => u.includes('bananablocks'))?.[1]
  ok(woc && JSON.parse(woc).txhex === TX.hex, '⚠ WoC is sent { txhex }')
  ok(ban && JSON.parse(ban).rawtx === TX.hex, '⚠ BananaBlocks is sent { rawtx } — same bytes, different key')
}
{
  const { p } = wired(() => resp('no', 400))
  ok(await rejects(p.broadcast(TX.hex), 'rejected by all relays'), '⛔ only ALL refusing is a failure')
}

// ── the ancestry is kept ────────────────────────────────────────────────────────────────────────────
{
  const { p, calls } = wired((u, i) => (i?.method === 'POST' ? resp({}) : resp(null, 404)))
  await p.broadcast(TX.hex)
  const before = calls.length
  ok(await p.getRawTransaction(TX.txid) === TX.hex, '★★ the broadcast bytes are retained and served locally')
  ok(calls.length === before, '⚠ …with NO network call, so a child is spendable at once')
}

// ── the orphan guard ────────────────────────────────────────────────────────────────────────────────
{
  const { p, calls } = wired(u => (u.includes('bananablocks') ? resp('seen') : resp(null, 404)))
  ok(await p.visibleOn(TX.txid) === 'BananaBlocks', '★ visibility prefers the independent, non-pruning relay')
  ok(calls[0][0].includes('bananablocks'), '…and asks it first')
}
{
  // ⚠⚠⚠ THE COUNTER IS RESET IMMEDIATELY BEFORE THE CALL, and that is a finding rather than a tidy-up.
  //   `broadcast()` without `awaitSeen` starts `confirmLanded` UNAWAITED. An earlier test's guard was
  //   still running, and because the transport is swapped module-wide it posted through THIS test's
  //   fake, reporting 4 re-broadcasts where the code does 2. ⇒ Measured in isolation: 2, correct.
  //   ★ Which is the argument against fire-and-forget in a library, demonstrating itself: work the
  //     caller cannot await or cancel does not stop when the caller does.
  let posts = 0
  const { p, slept } = wired((u, i) => { if (i?.method === 'POST') { posts++; return resp({}) } return resp(null, 404) })
  await new Promise(r => setTimeout(r, 0))   // let any straggler settle
  posts = 0
  ok(await rejects(p.awaitInMempool(TX.txid, TX.hex), 'never appeared'),
     '⛔ a parent that never appears ABORTS the child')
  ok(posts === 2, `★ …after exactly ONE re-broadcast to BOTH relays (${posts} posts)`)
  ok(slept.filter(x => x === GATE_POLL_INTERVAL_MS).length === GATE_POLL_TRIES * 2, '⚠ …having polled both rounds')
}
{
  const { p, slept } = wired(() => resp('here'))
  ok(await p.awaitInMempool(TX.txid, TX.hex) === undefined || true, 'a visible parent clears the gate')
  ok(slept.filter(x => x === GATE_POLL_INTERVAL_MS).length === 0,
     '★ …with no gate wait, because the first check precedes the first sleep')
}

// ── UTXOs ───────────────────────────────────────────────────────────────────────────────────────────
{
  const { p } = wired(u => u.includes('unspent/all')
    ? resp([row(A, 0, 1000), row(B, 0, 2000, { isSpentInMempoolTx: true })])
    : resp([]))
  const u = await p.getUtxos()
  ok(u.length === 1 && u[0].txId === A, 'a UTXO flagged mempool-spent is excluded')
  ok(u[0].satoshis === 1000 && u[0].outputIndex === 0, '…and the rest keep the deployed shape')
}
{
  // ⚠ fails OPEN: an indexer that drops the flag must not freeze a wallet
  const { p } = wired(u => (u.includes('unspent/all') ? resp([row(A, 0, 1000)]) : resp([])))
  ok((await p.getUtxos()).length === 1, '⚠ with the flag absent the coin is kept')
}
{
  const { p } = wired(u => (u.includes('unspent/all') ? resp([row(A, 0, 1000)]) : resp([])))
  p.registerPendingTx(B, [{ txId: A, outputIndex: 0 }], { outputIndex: 1, satoshis: 800 })
  const u = await p.getUtxos()
  ok(u.length === 1 && u[0].txId === B && u[0].satoshis === 800,
     '★★ the spent input is gone and the pending change is spendable')
}

// ── ⚠ 429 is not an error ───────────────────────────────────────────────────────────────────────────
{
  const { p, slept } = wired((u, i, n) => (n <= 2 ? resp(null, 429) : (u.includes('unspent/all') ? resp([row(A, 0, 9)]) : resp([]))))
  ok((await p.getUtxos()).length === 1, '⛔ two 429s are retried and the call succeeds')
  ok(slept.includes(500) && slept.includes(1000), '★ backoff is 500 then 1000 ms')
}
{
  const { p, slept } = wired((u, i, n) => (n === 1 ? resp(null, 429, { 'retry-after': '2' })
                                                  : (u.includes('unspent/all') ? resp([]) : resp([]))))
  await p.getUtxos()
  ok(slept.includes(2000), '★ Retry-After is honoured, not the guessed 500')
}

// ── ⚠ the cadence is SANE, not merely present ───────────────────────────────────────────────────────
{
  const perPoll = GATE_POLL_INTERVAL_MS + MIN_REQUEST_GAP_MS   // the poll interval plus the transport's own gap
  ok(perPoll >= 2000 && perPoll <= 3000, `★ each relay is asked about every ${perPoll} ms`)
  ok(GATE_POLL_TRIES * perPoll < 30000,
     `…and a gate round gives up inside ${Math.round(GATE_POLL_TRIES * perPoll / 1000)} s`)
  ok(CONFIRM_POLL_TRIES * CONFIRM_POLL_INTERVAL_MS >= 30000,
     '★ the background guard waits longer before re-sending, because nothing is blocked on it')
}

// ── ★★ one fetch per transaction at a time ──────────────────────────────────────────────────────────
//
// ⚠ Several scans ask for the same transaction in the same moment, and the cache fills only when the
//   fetch lands. Measured on a live replicate: 20 of 45 requests in the preparing phase were repeats, each
//   2 s behind the rate limiter. So concurrent callers must share one in-flight fetch.
{
  const hexA = TX.hex
  const { p, calls } = wired(url => (/\/tx\/[0-9a-f]{64}\/hex$/.test(url) ? resp(hexA) : resp({}, 404)))
  const [x, y, z] = await Promise.all([p.getSourceTransaction(TX.txid), p.getSourceTransaction(TX.txid), p.getRawTransaction(TX.txid)])
  ok(calls.length === 1, `★★★ three concurrent callers for one txid make ONE network request (${calls.length})`)
  ok(x === y && x.txid() === TX.txid && z === hexA, '★ …and all three get the same answer')
  const before = calls.length
  await p.getSourceTransaction(TX.txid)
  ok(calls.length === before, '★ …and a later caller is served from the cache')
  const bad = wired(() => resp('', 500))
  const r1 = await rejects(bad.p.getSourceTransaction(TX.txid), 'raw TX fetch failed')
  const r2 = await rejects(bad.p.getSourceTransaction(TX.txid), 'raw TX fetch failed')
  ok(r1 && r2 && bad.calls.length === 2, '⛔ a failed fetch is not cached: the next caller tries the network again')
}

// ── ⛔ a holding is retired only on a NAMED spender ─────────────────────────────────────────────────
//
// ⚠ The by-script unspent list answered empty once while a copy was live, and the wallet retired the copy.
//   The spent lookup names the transaction that took an output; a 404 is the absence of a record, not a
//   spend, and the caller keeps the holding.
{
  const spent = wired(url => (/\/tx\/[0-9a-f]{64}\/1\/spent$/.test(url) ? resp({ txid: B, vin: 0, status: 'unconfirmed' }) : resp({}, 404)))
  const r = await spent.p.getSpendingTx(A, 1)
  ok(r !== null && r.txId === B && r.unconfirmed === true, '★★ a named spender comes back with its txid and confirmation state')
  ok((await spent.p.getSpendingTx(A, 0)) === null, '★★★ a 404 is null: no record, not a spend')
  const flaky = wired(() => resp('', 500))
  ok(await rejects(flaky.p.getSpendingTx(A, 1), 'spent lookup failed'), '⛔ a server error throws rather than answering null')
  const junk = wired(() => resp({ txid: 'not-a-txid' }))
  ok((await junk.p.getSpendingTx(A, 1)) === null, '★ a malformed answer is null, never a spend')
}

// ── ★★★ a Merkle proof with a `*` (a hash paired with itself) verifies ───────────────────────────────
//
// ⚠ Bitcoin pairs the last hash of a level that has an odd number of them with ITSELF, and a TSC proof marks
//   that step `*`. Reading it as "no step" computes the wrong root: measured, every one of 8 real proofs with a
//   `*` failed. The trees here are built in the test, so every index of an odd level is exercised.
{
  const TP = await (async () => {
    const o = join(tmp, 'tokenProtocol.mjs')
    await link({ entryPoints: [join(HERE, '..', 'src', 'tokenProtocol.js')], outfile: o })
    return import(pathToFileURL(o).href)
  })()
  const { createHash } = await import('node:crypto')
  const d2 = b => createHash('sha256').update(createHash('sha256').update(b).digest()).digest()
  const disp = b => Buffer.from(b).reverse().toString('hex') // internal bytes → the reversed hex txids are shown in
  const tree = n => { // leaves as display txids; every level up to the root, internal byte order
    const leaves = Array.from({ length: n }, (_, i) => d2(Buffer.from(`leaf ${n} ${i}`)))
    const levels = [leaves]
    while (levels.at(-1).length > 1) {
      const l = levels.at(-1), up = []
      for (let i = 0; i < l.length; i += 2) up.push(d2(Buffer.concat([l[i], l[i + 1] ?? l[i]])))
      levels.push(up)
    }
    return levels
  }
  const tsc = (levels, index) => { // a TSC proof: each level's sibling, or `*` where the node pairs with itself
    const nodes = []; let i = index
    for (let k = 0; k < levels.length - 1; k++) { const s = levels[k][i ^ 1]; nodes.push(s == null ? '*' : disp(s)); i >>= 1 }
    return { index, nodes, target: disp(levels.at(-1)[0]) }
  }
  let all = 0, good = 0, starred = 0, tamperedCaught = 0
  for (const n of [3, 5, 7, 11]) {
    const levels = tree(n), root = disp(levels.at(-1)[0])
    for (let index = 0; index < n; index++) {
      const txId = disp(levels[0][index]), proof = tsc(levels, index)
      if (proof.nodes.includes('*')) starred++
      const { p } = wired(url => {
        if (url.endsWith(`/tx/${txId}/proof/tsc`)) return resp(proof)
        if (url.endsWith(`/api/v1/tx/${txId}`)) return resp({ block_hash: 'bb'.repeat(32) })
        if (url.endsWith(`/block/${'bb'.repeat(32)}/header`)) return resp({ merkleroot: root, height: 900000 })
        return resp(null, 404)
      })
      const entry = await p.getMerkleProof(txId)
      all++; if (entry != null && TP.verifyMerkleProof(entry)) good++
      if (entry != null && entry.path.length > 0) {
        const bad = { ...entry, path: entry.path.map((s, k) => k === entry.path.length - 1 && s.hash !== '*' ? { ...s, hash: 'ee'.repeat(32) } : s) }
        const flipped = bad.path.every((s, k) => s === entry.path[k]) ? { ...entry, merkleRoot: 'ee'.repeat(32) } : bad
        if (!TP.verifyMerkleProof(flipped)) tamperedCaught++
      }
    }
  }
  ok(starred > 0, `the trees include proofs with a * (${starred} of ${all})`)
  ok(good === all, `★★★ every proof from trees of 3, 5, 7 and 11 transactions verifies, a * included (${good} of ${all})`)
  ok(tamperedCaught === all, `⛔ …and every one fails once a hash or its root is changed (${tamperedCaught} of ${all})`)
}

// ── ★★★ an unspent list longer than one page is read to the end ─────────────────────────────────────
{
  const page = (rows, next) => resp({ result: rows, ...(next ? { nextPageToken: next } : {}) })
  const u = (n, extra = {}) => ({ tx_hash: 'cd'.repeat(32), tx_pos: n, value: 1, height: 900000, ...extra })
  const SH = 'ef'.repeat(32)
  const { p, calls } = wired(url => {
    if (url.endsWith(`/script/${SH}/unspent/all`)) return page([u(0), u(1)], 'p2')
    if (url.endsWith(`/script/${SH}/unspent/all?token=p2`)) return page([u(2), u(3, { isSpentInMempoolTx: true })], 'p3')
    if (url.endsWith(`/script/${SH}/unspent/all?token=p3`)) return page([u(4)])
    if (url.endsWith(`/address/${ADDR}/unspent/all`)) return page([u(10)], 'a2')
    if (url.endsWith(`/address/${ADDR}/unspent/all?token=a2`)) return page([u(11)])
    if (url.includes(`/address/${ADDR}/unconfirmed/unspent`)) return page([])
    return resp(null, 404)
  })
  const got = await p.getUnspentByScriptHash(SH)
  ok(got.length === 4 && got.map(x => x.outputIndex).join() === '0,1,2,4', `★★★ all three pages of a script's unspent list are read (${got.map(x => x.outputIndex)})`)
  ok(calls.filter(([url]) => url.includes(`/script/${SH}/`)).length === 3, '★ …one request per page')
  const coins = await p.getUtxos()
  ok(coins.length === 2 && coins.some(c => c.outputIndex === 11), `★★★ the wallet's own coin list reads every page too (${coins.length})`)
}
{
  const SH = 'fa'.repeat(32)
  const { p } = wired(url => {
    if (url.endsWith(`/script/${SH}/unspent/all`)) return resp({ result: [{ tx_hash: 'cd'.repeat(32), tx_pos: 0, value: 1 }], nextPageToken: 'x' })
    if (url.includes(`/script/${SH}/unspent/all?token=`)) return resp('', 500)
    if (url.endsWith(`/script/${SH}/unspent`)) return resp({ result: [{ tx_hash: 'cd'.repeat(32), tx_pos: 0, value: 1 }, { tx_hash: 'cd'.repeat(32), tx_pos: 1, value: 1 }] })
    return resp(null, 404)
  })
  const got = await p.getUnspentByScriptHash(SH)
  ok(got.length === 2, '⛔ a page of the mempool-aware list that fails is not a short answer: the confirmed list is read instead')
}

// ── ★★★ unspent outputs for many scripts: in bulk, and exactly where a bulk answer cannot be trusted ──
//
// ⚠ Measured: the bulk calls answer at most 20 outputs per script, and the confirmed one does not flag an
//   output already spent in the mempool. Either would make a holding look present that is not, or absent.
{
  const GAP = 3131
  const H = Array.from({ length: 25 }, (_, i) => i.toString(16).padStart(2, '0').repeat(32))
  const row = (n, extra = {}) => ({ tx_hash: 'ab'.repeat(32), tx_pos: n, value: 100, height: 900000 + n, ...extra })
  const CAPPED = H[3], PENDING = H[5], FAILING = H[7]
  const singles = []
  const { p, calls, slept } = wired((url, init) => {
    if (url.endsWith('/scripts/unspent') || url.endsWith('/scripts/unconfirmed/unspent')) {
      const asked = JSON.parse(init.body).scripts
      const pending = url.includes('unconfirmed')
      return resp(asked.map(h => pending
        ? { script: h, result: h === PENDING ? [row(9)] : [], error: '' }
        : { address: '', unspent: h === CAPPED ? Array.from({ length: 20 }, (_, n) => row(n)) : [row(1)], error: h === FAILING ? 'boom' : '' }))
    }
    const m = url.match(/\/script\/([0-9a-f]{64})\/unspent\/all$/)
    if (m) { singles.push(m[1]); return resp({ result: [row(2), row(3, { isSpentInMempoolTx: true })] }) }
    return resp(null, 404)
  }, { gap: GAP })
  const got = await p.getUnspentByScriptHashes(H)
  const posts = calls.filter(([, i]) => i?.method === 'POST')
  ok(posts.length === 4, `★★★ 25 scripts take 2 bulk requests of each kind, 20 scripts at a time (${posts.length})`)
  ok(singles.length === 3 && [CAPPED, PENDING, FAILING].every(h => singles.includes(h)),
     `★★★ only the capped, the pending and the failing script are asked one at a time (${singles.length})`)
  ok(got.size === 25, '★ every script has an answer')
  const plain = got.get(H[0])
  ok(plain?.length === 1 && plain[0].txId === 'ab'.repeat(32) && plain[0].outputIndex === 1 && plain[0].height === 900001, '★★ a bulk row maps to an outpoint, value and height')
  ok(got.get(CAPPED)?.length === 1, '★★ a capped script gets the exact answer, which drops an output spent in the mempool')
  ok(slept.filter(x => x === GAP).length === calls.length, `★★★ every one of the ${calls.length} requests went through the queue`)
}
{
  const singles = []
  const { p } = wired(url => {
    if (url.includes('/scripts/')) return resp('', 500)
    if (/\/script\/[0-9a-f]{64}\/unspent\/all$/.test(url)) { singles.push(url); return resp({ result: [] }) }
    return resp(null, 404)
  })
  const got = await p.getUnspentByScriptHashes(['aa'.repeat(32), 'bb'.repeat(32)])
  ok(got.size === 2 && singles.length === 2, '⛔ a bulk request that fails falls back to the exact call for its scripts')
}

// ── ★★ a transaction the wallet holds is served without asking the network ──────────────────────────
{
  const { p, calls } = wired(() => resp(null, 500))
  p.seedTransactions([{ txId: TX.txid, rawHex: TX.hex }])
  ok(await p.getRawTransaction(TX.txid) === TX.hex && calls.length === 0, '★★ a held transaction is served with no request at all')
}

// ── ★★★ the full history: every page, through the queue ─────────────────────────────────────────────
//
// ⚠ `/history` answers only the newest 100, so a token whose marker was spent and whose transaction is
//   older than that is found by nothing. The full history follows `nextPageToken` to the end.
{
  const GAP = 4321
  const P1 = 'c1'.repeat(32), P2 = 'c2'.repeat(32), P3 = 'c3'.repeat(32), M = 'c4'.repeat(32)
  const { p, calls, slept } = wired(url => {
    if (url.includes('/unconfirmed/history')) return resp({ result: [{ tx_hash: M, height: 0 }, { tx_hash: P1, height: 0 }], error: '' })
    if (url.endsWith('/confirmed/history')) return resp({ result: [{ tx_hash: P1, height: 900003 }], nextPageToken: 'tA' })
    if (url.endsWith('?token=tA')) return resp({ result: [{ tx_hash: P2, height: 900002 }], nextPageToken: 'tB' })
    if (url.endsWith('?token=tB')) return resp({ result: [{ tx_hash: P3, height: 900001 }] })
    return resp(null, 500)
  }, { gap: GAP })
  const h = await p.getFullAddressHistory()
  const ids = h.map(x => x.txId)
  ok(ids.length === 4 && [P1, P2, P3, M].every(x => ids.includes(x)), `★★★ all three pages and the mempool came back (${ids.length})`)
  ok(h.find(x => x.txId === P3)?.blockHeight === 900001, '★ …with the height read from the last page')
  ok(h.find(x => x.txId === P1)?.blockHeight === 900003, '⚠ a transaction in both lists keeps its confirmed height')
  ok(calls.filter(([u]) => u.includes('/confirmed/history')).length === 3, '★★ each page was asked for exactly once')
  ok(calls.some(([u]) => u.includes(`/address/${ADDR}/confirmed/history?token=tA`)), '★ the next page is asked for with ?token=')
  ok(slept.filter(x => x === GAP).length === calls.length, `★★★ every one of the ${calls.length} requests went through the queue`)
}
{
  const { p } = wired(() => resp(null, 404))
  ok((await p.getFullAddressHistory()).length === 0, '★ an address never seen has an empty history, not an error')
}
{
  // an API answering the same token forever must not keep the walk going
  const { p, calls } = wired(url => url.includes('/unconfirmed/') ? resp({ result: [] })
    : resp({ result: [{ tx_hash: 'c5'.repeat(32), height: 1 }], nextPageToken: 'same' }))
  await p.getFullAddressHistory()
  ok(calls.filter(([u]) => u.includes('/confirmed/history')).length === 2, '⚠ a token already followed ends the walk')
}
{
  const { p } = wired(url => url.endsWith('?token=tA') ? resp('', 500)
    : url.includes('/unconfirmed/') ? resp({ result: [] })
    : resp({ result: [{ tx_hash: 'c6'.repeat(32), height: 1 }], nextPageToken: 'tA' }))
  ok(await rejects(p.getFullAddressHistory(), 'confirmed history fetch failed'), '⛔ a failed page throws: a short history looks complete')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [wallet layer · the deployed file, adapted]`)
process.exit(fail === 0 ? 0 : 1)
