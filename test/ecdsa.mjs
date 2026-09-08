// © 2026 sun-dive.
/** ECDSA over secp256k1, graded against frozen reference signatures.
 *  ⚠ RFC 6979 is deterministic, so a correct implementation must match BYTE FOR BYTE. */
import { sign, verifyDigest, publicKey, decodeDer, encodeDer } from '../impl/js/ecdsa.mjs'
import { toHex, fromHex } from '../impl/js/bytes.mjs'
import { sha256 } from '@noble/hashes/sha2.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

// ⚠ NOT IN THE REPOSITORY — 237 KB of frozen reference signatures, kept locally and gitignored.
//   ⇒ Without it this suite SKIPS rather than silently passing, because a skipped check that reports
//     success is worse than a missing one.
let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'sdk-signature-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [ECDSA · frozen reference signatures not present locally]')
  process.exit(0)
}
const digestOf = msgHex => sha256(fromHex(msgHex))

for (const [key, label] of [['random', 'random'], ['leading_zero_k', "★ leading-zero k"]]) {
  const rows = V[key].slice(0, key === 'random' ? 150 : undefined)
  let rej = 0, diff = 0, pk = 0
  for (const r of rows) {
    const d = BigInt('0x' + r.priv), z = digestOf(r.msg)
    if (toHex(publicKey(d)) !== r.pub) pk++
    if (!verifyDigest(fromHex(r.der), fromHex(r.pub), z)) rej++
    if (toHex(sign(d, z, { lowS: true })) !== r.der) diff++
  }
  ok(pk === 0, `${label} — public keys (${pk} wrong)`)
  ok(rej === 0, `${label} — all ${rows.length} reference signatures verify (${rej} rejected)`)
  ok(diff === 0, `${label} — all ${rows.length} are BYTE-IDENTICAL (${diff} differed)`)
}
// ⛔ strict DER: the check that a signature is not silently malleable
const m = V.malleability
ok(decodeDer(fromHex(m.canonical)) !== null, 'the canonical form is accepted')
ok(decodeDer(fromHex(m.mutated)) === null,
   "⛔ r without its required 0x00 is REFUSED — two byte strings for one signature is malleability")
ok(decodeDer(fromHex(m.canonical + 'ff')) === null, '⛔ trailing bytes refused')
ok(decodeDer(fromHex('3081' + m.canonical.slice(2))) === null, '⛔ BER long-form length refused')
ok(decodeDer(fromHex(m.canonical + '41'), true) !== null, '★ …but a sighash byte is allowed with allowTrailing')
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [ECDSA · frozen reference signatures]`)
process.exit(fail === 0 ? 0 : 1)
