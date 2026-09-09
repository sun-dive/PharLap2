// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Bitcoin script — graded against REAL MAINNET SCRIPTS and the protocol's own constants.
 *
 * ★★★ THE ORACLE IS THE CHAIN. No other implementation is consulted, and none is needed: these bytes
 *   are already settled by consensus. A script that round-trips byte for byte proves the parser and
 *   the serializer agree with what is actually deployed.
 *
 * ★★ AND THE OPCODE NUMBERS ARE CHECKED AGAINST THE CHAIN TOO, not against our own table. A real P2PKH
 *   output must decode to exactly `OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG`. If any of
 *   those five numbers were wrong, that decode would not produce that shape.
 */
import { Script, LockingScript, OP, OP_NAME, minimalPush } from '../impl/js/script.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { toHex, fromHex } from '../impl/js/bytes.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'script-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [script · mainnet vectors not present — run tools/gen-script-vectors.mjs]')
  process.exit(0)
}

// ── ⚠⚠ FIRST, THE GATE: the scripts are only trustworthy if the transactions they came from are ──────
// ⚠⚠⚠ Measured 9 Sept 2026: WhatsOnChain's JSON view silently CAPS `scriptPubKey.hex` at exactly
//   50,000 bytes. Five vectors collected that way were truncated prefixes of a 54,299-byte script, and
//   they failed to round-trip because the DATA was wrong, not the parser. ⇒ Scripts now come out of the
//   raw transaction hex, and this check re-proves that here rather than trusting the generator: if the
//   whole transaction does not round-trip, its field boundaries were misread and nothing inside counts.
let rawBad = 0
for (const t of V.rawTxs ?? []) if (Tx.parse(t.hex).hex() !== t.hex) { rawBad++; console.log(`  ✗ raw tx ${t.txid.slice(0, 12)}…`) }
ok((V.rawTxs?.length ?? 0) > 0, 'the source transactions are recorded, so the gate can be re-proved')
ok(rawBad === 0, `★★ all ${V.rawTxs?.length ?? 0} source transactions round-trip — the scripts inside them are real`)

// ── ★★★ every real script round-trips ───────────────────────────────────────────────────────────────
let bad = 0
for (const s of V.scripts) if (Script.fromHex(s.hex).toHex() !== s.hex) { bad++; console.log(`  ✗ ${s.source}`) }
ok(bad === 0, `★★★ all ${V.scripts.length} real mainnet scripts round-trip byte for byte`)
const sizes = V.scripts.map(s => s.bytes)
// ⚠ A vector set that never crossed a PUSHDATA boundary would grade the easy path only.
ok(sizes.some(n => n <= 75) && sizes.some(n => n > 255) && sizes.some(n => n > 0xffff),
   `★ they span ${Math.min(...sizes)}–${Math.max(...sizes)} bytes, crossing BOTH PUSHDATA boundaries`)

// ── ★★ the opcode numbers, confirmed BY THE CHAIN ───────────────────────────────────────────────────
const p2pkh = V.scripts.find(s => s.bytes === 25 && s.hex.startsWith('76a914'))
ok(p2pkh !== undefined, 'a real P2PKH output is present to check against')
if (p2pkh) {
  const c = LockingScript.fromHex(p2pkh.hex).chunks
  ok(c.length === 5, `it decodes to 5 chunks (got ${c.length})`)
  ok(c[0]?.op === OP.OP_DUP && c[1]?.op === OP.OP_HASH160 && c[3]?.op === OP.OP_EQUALVERIFY
     && c[4]?.op === OP.OP_CHECKSIG,
     '★★ OP_DUP · OP_HASH160 · OP_EQUALVERIFY · OP_CHECKSIG all match the chain')
  ok(c[2]?.data?.length === 20, 'the middle chunk is a 20-byte push (the hash160)')
}

// ── ⚠⚠⚠ push boundaries: the EXACT ENCODING, not merely a round trip ────────────────────────────────
// ⚠⚠⚠ MUTATION TESTING FOUND THIS HOLE, 9 Sept 2026. Round-tripping and recovering the right byte count
//   BOTH still pass when the wrong form is chosen: a `PUSHDATA1 0x4b` where a direct `0x4b` belongs
//   parses back to the same 75 bytes and re-serializes to what it was given. It is simply a longer
//   script — which is a different txid, and on a covenant that hashes its own output, a different
//   covenant. ⇒ Moving each ceiling by one byte survived three separate assertions. Nothing short of
//   naming the expected leading bytes catches it.
const FORMS = [
  [0,     '00'],          // OP_0 — the empty push
  [1,     '01'],          // direct, and the opcode IS the length
  [74,    '4a'],
  [75,    '4b'],          // ⚠ THE LAST direct push
  [76,    '4c4c'],        // ⚠ first PUSHDATA1, length 0x4c
  [254,   '4cfe'],
  [255,   '4cff'],        // ⚠ THE LAST PUSHDATA1
  [256,   '4d0001'],      // ⚠ first PUSHDATA2 — length LITTLE-endian
  [4096,  '4d0010'],
  [65535, '4dffff'],      // ⚠ THE LAST PUSHDATA2
  [65536, '4e00000100'],  // ⚠ first PUSHDATA4
  [65537, '4e01000100'],
]
let formOk = 0, tripOk = 0, lenOk = 0
for (const [n, prefix] of FORMS) {
  const built = minimalPush(new Uint8Array(n).fill(0xab))
  const got = toHex(built).slice(0, prefix.length)
  if (got === prefix) formOk++; else console.log(`  ✗ ${n} bytes encoded as ${got}, expected ${prefix}`)
  const back = Script.fromBinary(built)
  if (toHex(back.toBinary()) === toHex(built)) tripOk++
  const recovered = back.chunks.reduce((t, c) => t + (c.data ? c.data.length : 0), 0)
  if (recovered === n) lenOk++; else console.log(`  ✗ push ${n}: recovered ${recovered}`)
}
ok(formOk === FORMS.length, `★★★ the SHORTEST form is chosen at every boundary (${formOk}/${FORMS.length})`)
ok(tripOk === FORMS.length, `and each round-trips (${tripOk}/${FORMS.length})`)
ok(lenOk === FORMS.length, `★★ and the exact byte count is recovered (${lenOk}/${FORMS.length})`)

// ⚠ THE SECOND HOLE MUTATION TESTING FOUND: every case above fills with 0xab, so the single-byte
//   small-integer opcodes were never reached at all. Shifting OP_1..OP_16 by one went unnoticed.
const SMALL = [
  [[0x00], '0100'],  // ⚠ a byte of ZERO is a 1-byte push, NOT OP_0 — OP_0 pushes nothing at all
  [[0x01], '51'],    // OP_1
  [[0x02], '52'],
  [[0x10], '60'],    // ⚠ OP_16 — the last of them
  [[0x11], '0111'],  // 17 is past the end, so back to a direct push
  [[0x81], '4f'],    // OP_1NEGATE
  [[0x82], '0182'],
]
let smallOk = 0
for (const [bytes, want] of SMALL) {
  const got = toHex(minimalPush(Uint8Array.from(bytes)))
  if (got === want) smallOk++
  else console.log(`  ✗ [0x${bytes[0].toString(16)}] encoded as ${got}, expected ${want}`)
}
ok(smallOk === SMALL.length, `★★★ single-byte values map to the right small-int opcode (${smallOk}/${SMALL.length})`)
// ⚠ and they must survive the trip back, or a script built from them re-serializes differently
ok(SMALL.every(([b]) => toHex(Script.fromBinary(minimalPush(Uint8Array.from(b))).toBinary())
                     === toHex(minimalPush(Uint8Array.from(b)))), 'small-int pushes round-trip')

// ── ⛔ a non-minimal push must SURVIVE, not be "corrected" ───────────────────────────────────────────
// ⚠⚠ Rewriting it changes the serialization and therefore the txid — and on a covenant that hashes its
//   own output, the script it is checking against itself.
const nonMin = '4c0501020304050087'
ok(Script.fromHex(nonMin).toHex() === nonMin, '⛔ a non-minimal PUSHDATA1 is preserved, not re-minimised')
ok(toHex(minimalPush(fromHex('0102030405'))) !== nonMin.slice(0, 12), '★ …while minimalPush would have chosen the short form')

// ── ⚠ truncation is where a script ends, not an error ───────────────────────────────────────────────
ok(Script.fromHex('05010203').chunks.length === 1, 'a truncated push yields what is there rather than throwing')
ok(Script.fromHex('4d').chunks.length === 1, 'a PUSHDATA2 with no length byte does not crash')

// ── readable form ───────────────────────────────────────────────────────────────────────────────────
ok(OP_NAME[0x76] === 'OP_DUP' && OP_NAME[0xac] === 'OP_CHECKSIG', 'OP_NAME resolves canonical names')
ok(OP_NAME[0x00] === 'OP_0' && OP_NAME[0x51] === 'OP_1', '⚠ aliases resolve to the first name, not OP_FALSE/OP_TRUE')
if (p2pkh) ok(LockingScript.fromHex(p2pkh.hex).toASM().startsWith('OP_DUP OP_HASH160 '), 'toASM is readable')

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [script · real mainnet scripts]`)
process.exit(fail === 0 ? 0 : 1)
