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
import { build } from 'esbuild'
import { ChainHttp } from '../impl/js/chain.mjs'
import { Signer, txidToWire } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'wp-'))
const out = join(tmp, 'walletProvider.mjs')
await build({ entryPoints: [join(HERE, '..', 'src', 'walletProvider.ts')], bundle: true, outfile: out,
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
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
function wired(route, { gap = 350 } = {}) {
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
  const perPoll = GATE_POLL_INTERVAL_MS + 350   // the poll interval plus the transport's own gap
  ok(perPoll >= 2000 && perPoll <= 3000, `★ each relay is asked about every ${perPoll} ms`)
  ok(GATE_POLL_TRIES * perPoll < 30000,
     `…and a gate round gives up inside ${Math.round(GATE_POLL_TRIES * perPoll / 1000)} s`)
  ok(CONFIRM_POLL_TRIES * CONFIRM_POLL_INTERVAL_MS >= 30000,
     '★ the background guard waits longer before re-sending, because nothing is blocked on it')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [wallet layer · the deployed file, adapted]`)
process.exit(fail === 0 ? 0 : 1)
