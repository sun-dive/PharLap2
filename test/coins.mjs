// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/** UTXO selection — graded on INVARIANTS, because selection is policy and no oracle can exist.
 *  ★★★ Chief among them: selected == target + fee + change, EXACTLY. Any satoshi neither spent, paid
 *    nor returned has been invented or lost. */
import * as c from '../impl/js/coins.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { sha256 } from '@noble/hashes/sha2.js'
let pass = 0, fail = 0
const ok = (x, w) => { x ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }
const enc = new TextEncoder()
const lock = s => { const h = sha256(enc.encode('s' + s)).subarray(0, 20)
  const out = new Uint8Array(25); out.set([0x76, 0xa9, 0x14]); out.set(h, 3); out.set([0x88, 0xac], 23); return out }
const utxo = (s, v) => ({ txid: sha256(enc.encode('u' + s + v)), vout: 0, value: v, script: lock(s) })

// ★★★ conservation, swept across floors so BOTH branches are reached
let seed = 12345
const rnd = m => (seed = (seed * 1103515245 + 12345) % 2147483648) % m
let bad = 0, withC = 0, without = 0, n = 0
for (let t = 0; t < 400; t++) {
  const us = []; for (let i = 0, k = 1 + rnd(8); i < k; i++) us.push(utxo(i, 1 + rnd(500000)))
  const outs = [{ value: 1 + rnd(200000), script: lock(500) }]
  let s; try { s = c.select(us, outs, lock(999), 100, [1, 546, 20000][t % 3]) } catch { continue }
  n++; s.change === null ? without++ : withC++
  if (s.selected !== s.target + s.fee + (s.change ?? 0)) bad++
}
ok(bad === 0, `★★★ conservation held over ${n} wallets (${bad} broke it)`)
ok(withC > 0 && without > 0, `★ both branches reached — ${withC} with change, ${without} without`)

// ⚠ the fee must cover the SIGNED size
const o = [{ value: 50000, script: lock(2) }]
const s1 = c.select([utxo(1, 100000)], o, lock(999))
const t1 = c.build(s1, o, lock(999))
ok(s1.size > t1.serialize().length, `⚠ charged for the SIGNED size (${s1.size} > unsigned ${t1.serialize().length})`)
ok(Tx.parse(t1.hex()).hex() === t1.hex(), 'the built transaction round-trips')
ok(t1.inputs[0].script.length === 0, '⚠ inputs are UNSIGNED — signing is a later step')

// ⛔ 1-satoshi outputs are honoured; 0 is refused
ok(c.select([utxo(3, 100000)], [{ value: 1, script: lock(4) }], lock(999)).target === 1,
   '★ a 1-satoshi covenant output is accepted, not "corrected"')
let z = false; try { c.select([utxo(6, 1000)], [{ value: 0, script: lock(7) }]) } catch { z = true }
ok(z, '⛔ a 0-value output is refused')
ok(c.BTC_LEGACY_DUST === 546 && c.MIN_OUTPUT === 1 && c.RELAY_DUST === undefined,
   '⚖ 546 is named for provenance only; the floor is 1')

// ★ the privacy rule — and the bucketing KEY is where the silent toString bug lived
const shared = [utxo(20, 30000), utxo(20, 1000), utxo(20, 1000), utxo(21, 5000)]
const sel = c.select(shared, [{ value: 25000, script: lock(22) }], lock(999))
const keys = [...new Set(sel.inputs.map(x => toHex(x.script)))]
const partial = keys.some(k =>
  shared.filter(x => toHex(x.script) === k).length !== sel.inputs.filter(x => toHex(x.script) === k).length)
ok(!partial, '★ no chosen script is PARTIALLY spent')
ok(Math.max(...keys.map(k => sel.inputs.filter(x => toHex(x.script) === k).length)) > 1,
   '★★ …and a multi-coin script really was chosen, so that check is not vacuous')
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [UTXO selection · invariants]`)
process.exit(fail === 0 ? 0 : 1)
