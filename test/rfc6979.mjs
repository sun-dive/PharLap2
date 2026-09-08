// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/** RFC 6979 §A.2.5 — the published P-256 vectors. An oracle neither implementation wrote.
 *  ★ `k` depends only on the group order, the key and the digest, never on the curve's points —
 *    so P-256's vectors grade the algorithm exactly, and secp256k1 then uses the same function. */
import { rfc6979k } from '../impl/js/rfc6979.mjs'
import { sha256 } from '@noble/hashes/sha2.js'
const q = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n
const x = 0xC9AFA9D845BA75166B5C215767B1D6934E50C3DB36E89B127B8A622B120F6721n
const d = s => sha256(new TextEncoder().encode(s))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }
for (const [msg, want] of [
  ['sample', 0xA6E3C57DD01ABE90086538398355DD4C3B17AA873382B0F24D6129493D8AAD60n],
  ['test',   0xD16B6AE827F17175E040871A1C7EC3500192C4C92677336EC2537ACAEE0008E0n],
]) ok(rfc6979k(q, x, d(msg)) === want, `P-256 "${msg}" — k does not match RFC 6979 §A.2.5`)
// ★ a retry steps the generator FORWARD; a fresh random k would reintroduce the RNG this removes
ok(rfc6979k(q, x, d('sample'), 0) !== rfc6979k(q, x, d('sample'), 1), 'attempt 1 differs from attempt 0')
ok(rfc6979k(q, x, d('test')) === rfc6979k(q, x, d('test')), 'deterministic across calls')
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [RFC 6979 · published P-256 vectors]`)
process.exit(fail === 0 ? 0 : 1)
