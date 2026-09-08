// © 2026 sun-dive.
/**
 * Generate ECDSA vectors using **openssl** as the oracle — replacing the ones taken from the wallet
 * SDK this project removed.
 *
 * ★★★ WHY THIS EXISTS. Agreeing with an implementation you do not trust proves COMPATIBILITY, not
 *   CORRECTNESS. The SDK-derived set told us we produce what it produces; it could not tell us either
 *   of us was right. ⇒ openssl is an independent implementation with no relationship to this project,
 *   and it is what the sibling PHP wallet is already graded against.
 *
 * ⚠⚠ OPENSSL SIGNS WITH A RANDOM `k`, NOT RFC 6979. So its signatures are **not comparable byte for
 *   byte** with ours and never will be. That rules out one kind of check and leaves three better ones,
 *   each proving something different:
 *
 *   | 1 · we sign → **openssl verifies**  | our signatures are valid ECDSA, judged by someone else |
 *   | 2 · openssl signs → **we verify**   | our verifier accepts genuine foreign signatures, including the random-`k` shapes ours never produces |
 *   | 3 · our `k` values                  | graded separately by **RFC 6979 §A.2.5's own published vectors** — see `test/rfc6979.mjs` |
 *
 *   ⇒ Between them: valid, interoperable, and deterministic — with nothing from the SDK.
 *
 *   node tools/gen-openssl-vectors.mjs [count]
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sign, publicKey, verifyDigest } from '../impl/js/ecdsa.mjs'
import { toHex, fromHex } from '../impl/js/bytes.mjs'
import { sha256 } from '@noble/hashes/sha2.js'

const COUNT = Number(process.argv[2] ?? 100)
const tmp = mkdtempSync(join(tmpdir(), 'osslvec-'))
const ossl = (...a) => execFileSync('openssl', a, { cwd: tmp, encoding: 'buffer' })

/** ⚠ Pull the scalar and the point out of openssl's own key, so both sides use the SAME key. */
function keyFromOpenssl(file) {
  const text = ossl('ec', '-in', file, '-text', '-noout').toString()
  const priv = (text.match(/priv:\s*([0-9a-f:\s]+?)pub:/s) ?? [])[1]?.replace(/[^0-9a-f]/g, '')
  const pub = (text.match(/pub:\s*([0-9a-f:\s]+?)(ASN1|NIST|$)/s) ?? [])[1]?.replace(/[^0-9a-f]/g, '')
  return { priv: priv.padStart(64, '0').slice(-64), pub }
}

const vectors = []
let osslVerifiedOurs = 0, weVerifiedOssl = 0
for (let i = 0; i < COUNT; i++) {
  ossl('ecparam', '-name', 'secp256k1', '-genkey', '-noout', '-out', 'k.pem')
  ossl('ec', '-in', 'k.pem', '-pubout', '-out', 'pub.pem')
  const { priv, pub } = keyFromOpenssl('k.pem')
  const d = BigInt('0x' + priv)

  // ★ the digest is arbitrary — it is what gets signed, and both sides must use the identical bytes
  const digest = sha256(new TextEncoder().encode('vector-' + i))
  writeFileSync(join(tmp, 'digest.bin'), digest)

  // ── 1 · we sign, openssl verifies ────────────────────────────────────────────────────────────────
  const ours = sign(d, digest, { lowS: true })
  writeFileSync(join(tmp, 'ours.der'), ours)
  let ok = false
  try {
    ok = ossl('pkeyutl', '-verify', '-pubin', '-inkey', 'pub.pem', '-in', 'digest.bin',
              '-sigfile', 'ours.der', '-pkeyopt', 'digest:sha256').toString().includes('Verified Successfully')
  } catch { ok = false }
  if (ok) osslVerifiedOurs++
  else console.error(`  ⛔ openssl REJECTED our signature at ${i}`)

  // ── 2 · openssl signs, we verify ─────────────────────────────────────────────────────────────────
  ossl('pkeyutl', '-sign', '-inkey', 'k.pem', '-in', 'digest.bin', '-out', 'theirs.der',
       '-pkeyopt', 'digest:sha256')
  const theirs = new Uint8Array(readFileSync(join(tmp, 'theirs.der')))
  // ⚠ openssl does NOT normalise s, so roughly half of these are high-s. Our verifier must accept
  //   them: low-s is a broadcast policy, never a validity rule.
  const weOk = verifyDigest(theirs, fromHex(pub), digest)
  if (weOk) weVerifiedOssl++
  else console.error(`  ⛔ WE rejected openssl's signature at ${i}`)

  vectors.push({
    priv, pub, pubCompressed: toHex(publicKey(d)), digest: toHex(digest),
    ours: toHex(ours), openssl: toHex(theirs),
  })
}

const out = {
  _: 'ECDSA vectors generated with OPENSSL as the oracle. ★ Replaces a set derived from a wallet SDK '
   + 'this project removed: agreeing with an implementation you do not trust proves compatibility, not '
   + 'correctness. openssl is independent of this project and of that library.',
  _method: '1. every `ours` signature was VERIFIED BY OPENSSL at generation. 2. every `openssl` '
   + 'signature is verified by us when the suite runs. 3. our k values are graded separately by '
   + "RFC 6979 §A.2.5's own published vectors. ⚠ openssl signs with a RANDOM k, so `ours` and "
   + '`openssl` are NOT byte-comparable and never will be — that is why there are three checks and '
   + 'not one.',
  _lowS: 'ours are low-s; openssl does not normalise, so about half of `openssl` are high-s. Our '
   + 'verifier must accept both: low-s is a broadcast policy, never a validity rule.',
  openssl: execFileSync('openssl', ['version'], { encoding: 'utf8' }).trim(),
  generated: new Date().toISOString().slice(0, 10),
  vectors,
}
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'openssl-vectors.json')
writeFileSync(dest, JSON.stringify(out))
rmSync(tmp, { recursive: true, force: true })
console.log(`  openssl verified ${osslVerifiedOurs}/${COUNT} of ours`)
console.log(`  we verified ${weVerifiedOssl}/${COUNT} of openssl's`)
console.log(`  → ${dest} (${vectors.length} vectors)`)
process.exit(osslVerifiedOurs === COUNT && weVerifiedOssl === COUNT ? 0 : 1)
