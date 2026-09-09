// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Two-party encryption — graded against MESSAGES THE DEPLOYED WALLET ALREADY SENT.
 *
 * ★★★ A COMPATIBILITY TEST BEFORE A CORRECTNESS TEST. Messages encrypted by the live wallet exist, and
 *   a message sent last year has to open next year. If this implementation cannot read that format
 *   back, nothing else about it matters. ⇒ The vectors ARE the requirement.
 *
 * ⚠⚠ The format was established by MEASUREMENT rather than from a specification: encrypting known
 *   plaintexts with known keys, then finding which key schedule reproduces the exact ciphertext. That
 *   matters because a plausible reading of a spec that differs in one byte opens nothing.
 */
import { encrypt, decrypt, encryptToSelf, decryptFromSelf, EciesError } from '../impl/js/ecies.mjs'
import { fromHex, toHex } from '../impl/js/bytes.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }
const rejects = async (p, m) => { try { await p; return false } catch (e) { return e instanceof EciesError && String(e.message).includes(m) } }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'ecies-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [two-party encryption · deployed vectors not present]')
  process.exit(0)
}

const senderPriv = BigInt('0x' + V.senderPriv)
const recipPriv = BigInt('0x' + V.recipientPriv)
const thirdPriv = BigInt('0x' + V.thirdPriv)
const senderPub = fromHex(V.senderPub)
const recipPub = fromHex(V.recipientPub)
const thirdPub = fromHex(V.thirdPub)

// ── ★★★ THE REQUIREMENT: open what the deployed wallet sent ─────────────────────────────────────────
let read = 0
for (const v of V.vectors) {
  const got = await decrypt(fromHex(v.cipher), recipPriv, senderPub)
  if (toHex(got) === v.plain) read++
  else console.log(`  ✗ ${v.name}`)
}
ok(V.vectors.length >= 8, `there are ${V.vectors.length} frozen messages to open`)
ok(read === V.vectors.length,
   `★★★ all ${V.vectors.length} messages from the DEPLOYED wallet decrypt correctly (${read})`)
ok(V.vectors.some(v => v.plain === ''), '★ …including an empty one, where padding bugs hide')
ok(V.vectors.some(v => v.plain.length / 2 === 16), '★ …and one on an exact block boundary')
ok(V.vectors.some(v => v.plain.length / 2 > 4000), '★ …and one over 4 KB')

// ── ★★ and we PRODUCE the same bytes, which is the stronger claim ───────────────────────────────────
// ⚠ Reading their format proves we can receive. Producing it byte for byte proves the deployed wallet
//   can receive from US - and it is only checkable because the scheme is deterministic.
let same = 0
for (const v of V.vectors) {
  if (toHex(await encrypt(fromHex(v.plain), recipPub, senderPriv)) === v.cipher) same++
  else console.log(`  ✗ produce ${v.name}`)
}
ok(same === V.vectors.length,
   `★★★ and we PRODUCE byte-identical ciphertext for all ${V.vectors.length} (${same})`)

// ── ⚠ the determinism that makes the above testable is also a property to know about ────────────────
{
  const a = await encrypt(fromHex('01020304'), recipPub, senderPriv)
  const b = await encrypt(fromHex('01020304'), recipPub, senderPriv)
  ok(toHex(a) === toHex(b),
     '⚠⚠ the same message to the same recipient gives IDENTICAL bytes — the IV is derived, so this format leaks plaintext equality')
}

// ── ⛔ authentication: the checks that make this more than obfuscation ───────────────────────────────
{
  const v = V.vectors.find(x => x.plain.length > 20)
  const ct = fromHex(v.cipher)
  ok(await rejects(decrypt(ct, thirdPriv, senderPub), 'authentication failed'),
     '⛔ a THIRD PARTY cannot open it, even holding the sender’s public key')
  ok(await rejects(decrypt(ct, recipPriv, thirdPub), 'authentication failed'),
     '⛔ nor can the right recipient with the WRONG sender — the MAC binds both sides')
  const bent = fromHex(v.cipher); bent[20] ^= 0x01
  ok(await rejects(decrypt(bent, recipPriv, senderPub), 'authentication failed'),
     '⛔ one flipped bit in the ciphertext is refused')
  const bentMac = fromHex(v.cipher); bentMac[bentMac.length - 1] ^= 0x01
  ok(await rejects(decrypt(bentMac, recipPriv, senderPub), 'authentication failed'),
     '⛔ one flipped bit in the MAC is refused')
  const wrongMagic = fromHex(v.cipher); wrongMagic[0] ^= 0x01
  ok(await rejects(decrypt(wrongMagic, recipPriv, senderPub), 'not this message format'),
     '⛔ a wrong magic is refused by name, before any key work')
  ok(await rejects(decrypt(ct.subarray(0, 20), recipPriv, senderPub), 'too short'),
     '⛔ a truncated message is refused with a usable reason')
}

// ── ★ both directions, and to self ──────────────────────────────────────────────────────────────────
{
  // ⚠ ECDH is symmetric: the recipient encrypting back to the sender uses the same shared secret.
  const msg = fromHex('deadbeefcafe')
  const there = await encrypt(msg, recipPub, senderPriv)
  const back = await encrypt(msg, senderPub, recipPriv)
  ok(toHex(there) === toHex(back),
     '★★ A→B and B→A produce the same bytes — the shared secret is the same point from either side')
  ok(toHex(await decrypt(back, senderPriv, recipPub)) === toHex(msg), '…and each can read the other')
}
{
  const got = await decryptFromSelf(fromHex(V.selfCipher), senderPriv, senderPub)
  ok(toHex(got) === V.selfPlain, '★★ a to-SELF message from the deployed wallet opens — what a settings backup is')
  ok(toHex(await encryptToSelf(fromHex(V.selfPlain), senderPriv, senderPub)) === V.selfCipher,
     '…and we produce it byte-identically')
}

// ── ⛔ argument validation ───────────────────────────────────────────────────────────────────────────
ok(await rejects(encrypt(new Uint8Array(4), recipPub, 12345), 'BigInt'), '⛔ a non-BigInt private key is refused')
ok(await rejects(encrypt(new Uint8Array(4), new Uint8Array(5), senderPriv), 'does not decode'),
   '⛔ a malformed public key is refused')
ok(await rejects(decrypt('not bytes', recipPriv, senderPub), 'expected bytes'), '⛔ a non-Uint8Array is refused')

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [two-party encryption · opens what was already sent]`)
process.exit(fail === 0 ? 0 : 1)
