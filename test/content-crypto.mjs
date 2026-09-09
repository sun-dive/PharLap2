// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Content encryption — graded against CIPHERTEXT THAT ALREADY EXISTS.
 *
 * ★★★ THIS IS A COMPATIBILITY TEST BEFORE IT IS A CORRECTNESS TEST. 21 encrypted editions were minted
 *   with the old framing and sit on mainnet. If this implementation cannot read that framing back, those
 *   coins are unreadable and nothing else about it matters. ⇒ The vectors are ciphertexts the deployed
 *   wallet produced, frozen, and the requirement is that we decrypt them.
 *
 * ⚠⚠ THE IV IS 32 BYTES, not GCM's usual 12. That is not a choice to revisit: it is what the chain
 *   holds, there is no version marker to tell old from new, and "fixing" it would strand real coins.
 *   ★ WebCrypto accepts it - measured in Node and in Chromium over `file://`, which is what the
 *     air-gapped wallet runs on.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
const unhex = h => Array.from(h.match(/../g) ?? [], x => parseInt(x, 16))

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'aesgcm-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [content crypto · compatibility vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'cc-'))
const out = join(tmp, 'contentCrypto.mjs')
await build({ entryPoints: [join(HERE, '..', 'src', 'contentCrypto.ts')], bundle: true, outfile: out,
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const CC = await import(pathToFileURL(out).href)

// ── ★★★ THE REQUIREMENT: read back what is already on chain ─────────────────────────────────────────
let read = 0
for (const v of V.vectors) {
  const got = await CC.decryptContent(unhex(v.cipher), unhex(v.key))
  if (hex(got) === v.plain) read++
  else console.log(`  ✗ ${v.name}`)
}
ok(V.vectors.length >= 5, `there are ${V.vectors.length} frozen ciphertexts to read`)
ok(read === V.vectors.length,
   `★★★ all ${V.vectors.length} ciphertexts from the DEPLOYED wallet decrypt correctly (${read})`)
ok(V.vectors.some(v => v.plain.length / 2 > 60000), '★ …including one over 64 KB, not just toy inputs')
ok(V.vectors.some(v => v.plain === ''), '★ …and an empty payload, which is where framing bugs hide')

// ── ⛔⛔ WRAPPED KEYS FROM THE CHAIN, which a round trip could never have checked ────────────────────
// ⚠⚠⚠ MUTATION TESTING FOUND THIS. `wrappedK` is stored in the TX1 template ON CHAIN, and it is
//   unwrapped with a key derived from a constant salt. Changing that salt survived the whole suite,
//   because every round-trip test wraps and unwraps within one run and is therefore self-consistent
//   with any salt at all. ⇒ The only thing that catches it is a wrapping made BEFORE the change.
{
  let unwrapped = 0
  for (const w of V.wrapped ?? []) {
    const got = await CC.unwrapContentKey(unhex(w.wrapped), unhex(w.salt))
    if (got !== null && hex(got) === w.K) unwrapped++
  }
  ok((V.wrapped?.length ?? 0) >= 3, `there are ${V.wrapped?.length ?? 0} wrapped keys from the deployed wallet`)
  ok(unwrapped === (V.wrapped?.length ?? 0),
     `★★★ all ${V.wrapped?.length ?? 0} wrapped keys unwrap - the obfuscation salt is a COMPATIBILITY CONSTANT (${unwrapped})`)
}

// ── ⚠ non-vacuous: a wrong key must FAIL, not return rubbish ────────────────────────────────────────
// ⚠⚠ GCM authenticates, so a wrong key throws rather than yielding plausible garbage. A test that only
//   checked "it decrypted" would pass on an implementation that ignored the tag entirely.
{
  const v = V.vectors.find(x => x.plain.length > 20)
  const wrong = unhex(v.key).map((b, i) => (i === 0 ? b ^ 0xff : b))
  let threw = false
  try { await CC.decryptContent(unhex(v.cipher), wrong) } catch { threw = true }
  ok(threw, '⛔ a wrong key THROWS - the auth tag is being checked')
  let tampered = false
  const bad = unhex(v.cipher); bad[40] ^= 0x01                    // flip a bit inside the ciphertext
  try { await CC.decryptContent(bad, unhex(v.key)) } catch { tampered = true }
  ok(tampered, '⛔ a single flipped bit in the ciphertext is REFUSED')
  // ⚠ WebCrypto would throw here anyway, so asserting "it threw" proved nothing and a mutation removing
  //   the guard survived. The guard's VALUE is the message: "OperationError" tells a user nothing.
  let cutMsg = ''
  try { await CC.decryptContent(unhex(v.cipher).slice(0, 20), unhex(v.key)) } catch (e) { cutMsg = String(e.message) }
  ok(cutMsg.includes('too short'),
     `⛔ a truncated ciphertext is refused WITH A USABLE MESSAGE (got ${JSON.stringify(cutMsg)})`)
}

// ── the framing, asserted explicitly ────────────────────────────────────────────────────────────────
{
  const K = CC.newContentKey()
  ok(K.length === 32, 'a content key is 32 bytes')
  ok(CC.newKeySalt().length === 16, 'a key salt is 16 bytes')
  ok(hex(CC.newContentKey()) !== hex(CC.newContentKey()), '⚠ …and two keys differ, so it is really random')

  const plain = Array.from({ length: 100 }, (_, i) => i & 0xff)
  const ct = await CC.encryptContent(plain, K)
  ok(ct.length === 32 + plain.length + 16,
     `★★ our ciphertext is [32-byte IV][${plain.length}][16-byte tag] = ${ct.length} bytes`)
  ok(hex(await CC.decryptContent(ct, K)) === hex(plain), 'and it round-trips')
  const ct2 = await CC.encryptContent(plain, K)
  ok(hex(ct.slice(0, 32)) !== hex(ct2.slice(0, 32)),
     '⛔ the IV is fresh every time - a repeated IV under one key breaks GCM completely')
  ok(hex(ct) !== hex(ct2), '…so two encryptions of the same bytes differ')
}

// ── the wrapped key, which is obfuscation and says so ───────────────────────────────────────────────
{
  const K = CC.newContentKey(), salt = CC.newKeySalt()
  const wrapped = await CC.wrapContentKey(K, salt)
  ok(hex(await CC.unwrapContentKey(wrapped, salt)) === hex(K), 'a wrapped key unwraps with its salt')
  ok(await CC.unwrapContentKey(wrapped, CC.newKeySalt()) === null,
     '⛔ …and returns NULL for the wrong salt, rather than throwing - the deployed contract, unchanged')
  // ⚠ every holder derives the same obfuscation key from the PUBLIC salt. This is not a secret, and the
  //   file says so; the test pins the property rather than implying secrecy.
  const other = await CC.wrapContentKey(K, salt)
  ok(hex(await CC.unwrapContentKey(other, salt)) === hex(K), '★ any wrapping of K unwraps to K with that salt')
}

// ── the content hash binds the ciphertext ───────────────────────────────────────────────────────────
{
  const v = V.vectors.find(x => x.plain.length > 20)
  const h = CC.contentHash(unhex(v.cipher))
  ok(/^[0-9a-f]{64}$/.test(h), 'contentHash is 32 bytes of hex')
  const bad = unhex(v.cipher); bad[5] ^= 0x01
  ok(CC.contentHash(bad) !== h, '⚠ …and it changes when the ciphertext does')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [content crypto · reads what is on chain]`)
process.exit(fail === 0 ? 0 : 1)
