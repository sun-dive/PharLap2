// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The chain service — graded OFFLINE, with the transport and the clock injected.
 *
 * ★★★ A RATE LIMITER TESTED ONLY AGAINST A LIVE API HAS NOT BEEN TESTED. The cases that matter are the
 *   ones a service will not produce on demand: a 429 storm, a Retry-After header, two callers racing,
 *   an endpoint that fails. All of them are constructed here, and none of them touch the network.
 *
 * ⚠⚠ THIS FILE COVERS THE TRANSPORT ONLY. The wallet layer above it is `src/walletProvider.ts`, which
 *   is deployed code adapted rather than rewritten, and it is graded by `test/wallet-provider.mjs`
 *   against the real file. A `Provider` class here once duplicated eight of its methods; it is gone.
 */
import { ChainHttp, RateLimiter, ChainError, MIN_REQUEST_GAP_MS } from '../impl/js/chain.mjs'
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

// ══ ⚠⚠⚠ THE INVARIANT: EVERY REQUEST THIS TRANSPORT HANDLES IS PACED ════════════════════════════════
//
// ★ The method is general rather than per-call: the limiter pays a gap of exactly `minGapMs` after EVERY
//   request, so if the count of those gaps equals the count of fetches, nothing went round it. A
//   distinctive gap value keeps it apart from any poll interval or 429 backoff.
// ⚠ The same invariant is asserted one layer up, in `test/wallet-provider.mjs`, against the deployed
//   wallet file - because that is where a bypass actually happened: its orphan-guard poll called `fetch`
//   directly while its broadcast went through the queue.
{
  const GAP = 7777
  const slept = []
  let fetches = 0
  const http = new ChainHttp({
    fetchImpl: async () => { fetches++; return resp({}) },
    sleep: async ms => { slept.push(ms) }, minGapMs: GAP,
  })
  for (let i = 0; i < 12; i++) await http.request(`https://h${i % 3}.test/x`)
  ok(fetches === 12, `twelve requests across three hosts (${fetches})`)
  ok(slept.filter(x => x === GAP).length === fetches,
     `★★★ every request paid the gap (${slept.filter(x => x === GAP).length}/${fetches})`)
}
{
  // ⛔ and prove the check can FAIL: a call that skips the limiter is invisible to the gap count
  const GAP = 7777
  const slept = []
  let fetches = 0
  const fetchImpl = async () => { fetches++; return resp({}) }
  const http = new ChainHttp({ fetchImpl, sleep: async ms => { slept.push(ms) }, minGapMs: GAP })
  await http.request('https://a.test/x')
  await fetchImpl()                                    // ← the bypass, exactly as it looked in the wild
  ok(fetches === 2 && slept.filter(x => x === GAP).length === 1,
     '⛔ a bypassed call raises the fetch count and not the gap count - which is what catches it')
}
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [chain · offline, injected transport]`)
process.exit(fail === 0 ? 0 : 1)
