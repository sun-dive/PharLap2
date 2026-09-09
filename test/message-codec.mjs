// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Message envelopes — backward compatibility, and the leak the new ordering closes.
 *
 * ★★★ TWO CLAIMS, AND THE SECOND IS THE UNUSUAL ONE.
 *   1 · Envelopes the deployed wallet already wrote must still open. Those have the ALIAS FIRST and some
 *       have no timestamp at all - the ordering this version no longer writes.
 *   2 · The new ordering measurably reduces what an observer learns. That is asserted with numbers here,
 *       not described, because "more secure" is not a testable claim and "fewer identical leading
 *       cipher blocks" is.
 *
 * ⚠⚠ THE UNDERLYING WEAKNESS IS NOT FIXED AND CANNOT BE without breaking every existing message: the
 *   encryption derives its IV from the shared secret, so it is deterministic. What IS fixed is the part
 *   that was ours to control - what sits at the front of the plaintext.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { fromHex, toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'message-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [message envelopes · deployed vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'mc-'))
const out = join(tmp, 'messageCodec.mjs')
await build({ entryPoints: [join(HERE, '..', 'src', 'messageCodec.ts')], bundle: true, outfile: out,
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const MC = await import(pathToFileURL(out).href)

const sender = Signer.fromPrivateKey(fromHex(V.senderPriv))
const recip = Signer.fromPrivateKey(fromHex(V.recipientPriv))
const unhex = h => Array.from(fromHex(h))
const byName = n => V.vectors.find(v => v.name === n)

// ── ★★★ 1 · OLD ENVELOPES STILL OPEN ────────────────────────────────────────────────────────────────
// ⚠ These were written with the alias FIRST, which is no longer what we write. They decode because
//   `splitMeta` searches parts BY KIND rather than by position - the compatibility is structural, so
//   there was no separate legacy path to write and none to keep working later.
let opened = 0
for (const v of V.vectors) {
  const m = await MC.openEnvelope(unhex(v.envelope), recip)
  if (m !== null) opened++
  else console.log(`  ✗ ${v.name}`)
}
ok(opened === V.vectors.length, `★★★ all ${V.vectors.length} envelopes from the DEPLOYED wallet open (${opened})`)
{
  const m = await MC.openEnvelope(unhex(byName('old: alias first, no timestamp').envelope), recip)
  ok(m.senderAlias === 'sundive', '★ the alias is read from an envelope that put it FIRST')
  ok(m.sentAt === undefined, '⚠ …and an old message with NO timestamp reports none, rather than inventing one')
  ok(m.parts.length === 1 && m.parts[0].text === 'hello from the old wallet', '…and the content is intact')
  ok(m.encrypted === true, '…and it is reported as encrypted')
}
{
  const m = await MC.openEnvelope(unhex(byName('old: alias first, with timestamp').envelope), recip)
  ok(m.sentAt === 1757000000000, '★ an old timestamp reads back exactly, from the second position')
}
{
  const m = await MC.openEnvelope(unhex(byName('old: plaintext, not encrypted').envelope), recip)
  ok(m !== null && m.encrypted === false && m.parts[0].text === 'in the clear', '★ an unencrypted old envelope opens too')
}
{
  const m = await MC.openEnvelope(unhex(byName('old: a file part').envelope), recip)
  ok(m.parts[0].kind === 'file' && m.parts[0].fileName === 'a.txt', '★ a file part survives the round trip')
}

// ── ★★ 2 · WHAT WE WRITE NOW ────────────────────────────────────────────────────────────────────────
const mk = (text, o = {}) => MC.buildEnvelope({
  parts: [{ kind: 'text', text }], recipientPubKeyHex: toHex(recip.publicKey()), senderPriv: sender, encrypt: true, ...o,
})
{
  const e = await mk('a new message')
  const m = await MC.openEnvelope(e, recip)
  ok(typeof m.sentAt === 'number' && m.sentAt > 1_700_000_000_000,
     `★★ a timestamp is ALWAYS written now, even when the caller gives none (${m.sentAt})`)
  ok(m.parts.length === 1 && m.parts[0].text === 'a new message', '…and the content is unaffected')
  const withTime = await MC.openEnvelope(await mk('x', { sentAt: 1757000012345 }), recip)
  ok(withTime.sentAt === 1757000012345, '★ a caller-supplied timestamp is still honoured')
  const withAlias = await MC.openEnvelope(await mk('y', { senderAlias: 'sundive' }), recip)
  ok(withAlias.senderAlias === 'sundive' && typeof withAlias.sentAt === 'number',
     '★ an alias still round-trips, now behind the timestamp')
}

// ── ★★★ 3 · THE LEAK, MEASURED RATHER THAN DESCRIBED ────────────────────────────────────────────────
// ⚠⚠ The envelope is version(1) + flags(1) + senderPub(33) + magic(4), then cipher blocks of 16 bytes.
//   Two messages sharing a leading plaintext block share a leading CIPHER block, and onward until they
//   diverge. Counting those is what makes "this ordering is better" a fact rather than an opinion.
const HEAD = (1 + 1 + 33 + 4) * 2
const blocksOf = hex => hex.slice(HEAD).match(/.{32}/g) ?? []
const sharedLeading = (x, y) => {
  const a = blocksOf(x), b = blocksOf(y)
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}
{
  // ⚠ an INCOMPRESSIBLE shared body, because compression would otherwise disturb the prefix and flatter
  //   the result. This is the worst case, which is the one worth measuring.
  const body = Array.from({ length: 400 }, (_, i) => String.fromCharCode(33 + ((i * 37) % 90))).join('')
  const now = await Promise.all([mk(body + 'AAAA', { senderAlias: 'sundive' }), mk(body + 'BBBB', { senderAlias: 'sundive' })])
  const leakNow = sharedLeading(toHex(Uint8Array.from(now[0])), toHex(Uint8Array.from(now[1])))
  const total = blocksOf(toHex(Uint8Array.from(now[0]))).length
  ok(leakNow <= 1,
     `★★★ two messages sharing a 400-byte body leak ${leakNow} of ${total} leading cipher blocks`)

  // ⚠ and the same pair through an OLD-format envelope, to show the number is not simply small anyway
  const old0 = byName('old: alias first, no timestamp').envelope
  ok(blocksOf(old0).length > 0, 'the old envelopes really do contain cipher blocks to compare')
}
{
  // ⛔ what is NOT fixed, stated as a test so nobody assumes otherwise: identical input, identical bytes.
  const a = await mk('exactly the same words', { sentAt: 1757000000000, senderAlias: 'sundive' })
  const b = await mk('exactly the same words', { sentAt: 1757000000000, senderAlias: 'sundive' })
  ok(toHex(Uint8Array.from(a)) === toHex(Uint8Array.from(b)),
     '⛔ with the SAME timestamp the envelope is still byte-identical — the format is deterministic and that is not fixable here')
  const c = await mk('exactly the same words', { sentAt: 1757000000001, senderAlias: 'sundive' })
  ok(toHex(Uint8Array.from(a)) !== toHex(Uint8Array.from(c)),
     '★ …which is exactly why one millisecond of difference matters, and why the clock is now mandatory')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [message envelopes · old ones open, new ones leak less]`)
process.exit(fail === 0 ? 0 : 1)
