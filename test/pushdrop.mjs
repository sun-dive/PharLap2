// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PushDrop scripts — graded against SCRIPTS THE DEPLOYED WALLET PRODUCES.
 *
 * ★★★ THE CLAIM IS BYTE IDENTITY, NOT EQUIVALENCE. A PushDrop lock is what a token IS: the script goes
 *   in an output, the output fixes the txid, and the txid is the token's identity. A script that differs
 *   by one byte is a different token, so "it decodes the same" is not the test - "it is the same bytes"
 *   is.
 *
 * ⚠⚠ WHICH IS WHY `minimalPushChunk` MUST NOT BE UNIFIED WITH THE WALLET CORE'S `minimalPush`. They
 *   disagree on one input: a single ZERO byte encodes to OP_0 here and to a one-byte push there. Both
 *   are legal; only one matches what already exists. The vectors below include that case precisely so
 *   the day someone tidies it away, this fails.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer, txidToWire } from '../impl/js/signer.mjs'
import { Tx, SIGHASH, preimage, dsha256 } from '../impl/js/transaction.mjs'
import { Script } from '../impl/js/script.mjs'
import { verifyDigest, decodeDer, sign as ecdsaSign } from '../impl/js/ecdsa.mjs'
import { toHex, fromHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'pushdrop-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [pushDrop · deployed-script vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'pd-'))
const out = join(tmp, 'pushDrop.mjs')
await build({ entryPoints: [join(HERE, '..', 'src', 'pushDrop.ts')], bundle: true, outfile: out,
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const PD = await import(pathToFileURL(out).href)
const unhex = h => Array.from(fromHex(h))

// ── ★★★ byte identity with what the deployed wallet builds ──────────────────────────────────────────
let same = 0
for (const v of V.vectors) {
  const got = PD.lock(v.pub, v.fields.map(unhex)).toHex()
  if (got === v.script) same++
  else console.log(`  ✗ ${v.name}\n      want ${v.script.slice(0, 60)}\n      got  ${got.slice(0, 60)}`)
}
ok(V.vectors.length >= 8, `there are ${V.vectors.length} deployed scripts to match`)
ok(same === V.vectors.length,
   `★★★ all ${V.vectors.length} scripts are BYTE IDENTICAL to the deployed wallet's (${same})`)

// ── the encoding boundaries the vectors deliberately include ────────────────────────────────────────
const byName = n => V.vectors.find(v => v.name === n)
ok(byName('single zero byte') !== undefined, '⚠ the single-zero-byte case is present - the one that differs from the core rule')
{
  const v = byName('single zero byte')
  const s = PD.lock(v.pub, [[0]]).toHex()
  ok(s === v.script, '⛔ a single zero byte still encodes to OP_0, as the chain holds it')
  ok(s.endsWith('0075'), `…which is OP_0 then OP_DROP (tail ${s.slice(-4)})`)
}
// ⚠⚠ MUTATION TESTING FOUND THE GAP: the largest field was 256 bytes, so moving the PUSHDATA2 ceiling
//   by one survived untouched. A token can embed a file, so a field above 64 KB is not a synthetic case.
ok(byName('75 / 76 boundary') !== undefined && byName('255 / 256 boundary') !== undefined
   && byName('65535 / 65536 boundary') !== undefined,
   '★ ALL THREE PUSHDATA boundaries are covered, including 64 KB where a token embeds a file')

// ── decode: round trip, and the normalisation that must NOT be "fixed" ──────────────────────────────
let round = 0
for (const v of V.vectors) {
  const d = PD.decode(PD.lock(v.pub, v.fields.map(unhex)))
  const fieldsMatch = d !== null && d.fields.map(f => toHex(Uint8Array.from(f))).join(',') === v.decodedFields.join(',')
  if (fieldsMatch && d.pubKeyHex === v.decodedPub) round++
  else console.log(`  ✗ decode ${v.name}`)
}
ok(round === V.vectors.length, `★★ decode reproduces the deployed result for all ${V.vectors.length} (${round})`)
{
  const v = byName('uncompressed key')
  ok(v.pub.length === 130, 'the uncompressed-key case really is 65 bytes')
  ok(v.decodedPub.length === 66,
     '⚠⚠ …and decode NORMALISES it to 33 bytes - preserved deliberately, because matching relies on it')
  ok(PD.decode(PD.lock(v.pub, [[0x78]])).pubKeyHex === v.decodedPub, '…and we reproduce that')
}
ok(PD.decode(Script.fromHex('00')) === null, '⛔ a script that is not PushDrop decodes to null, not a throw')
ok(PD.decode(Script.fromHex('0114ac')) === null, '⛔ …including a wrong-length pubkey push')

// ── ★ the unlocking script, which is where the build shape changed ──────────────────────────────────
{
  const me = Signer.fromSeed(new Uint8Array(64).fill(5))
  const lockScript = PD.lock(toHex(me.publicKey()), [Array.from(new TextEncoder().encode('RECORD_TOKEN'))])
  const prev = txidToWire('cc'.repeat(31) + '07')
  const tx = new Tx(1, [{ txid: prev, vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                       [{ value: 900, script: me.lockingScript() }], 0)
  const us = PD.unlockScript(me.d, tx, 0, lockScript.toBinary(), 1000)
  const chunks = Script.fromBinary(us.toBinary()).chunks
  ok(chunks.length === 1, '★ the unlocking script is a single push - P2PK style, the key is in the lock')
  const sig = chunks[0].data
  ok(sig[sig.length - 1] === SIGHASH.ALL_FORKID, '⚠ FORKID is set, which this chain requires')
  // ★★ verified against the LOCKING script and the amount, which is what BIP-143 commits to
  ok(Signer.verifyInput(tx, 0, lockScript.toBinary(), 1000, me.publicKey(), sig),
     '★★★ the signature verifies against the script and amount being spent')
  ok(!Signer.verifyInput(tx, 0, lockScript.toBinary(), 999, me.publicKey(), sig),
     '⛔ …and fails on a one-satoshi difference, so the amount is genuinely committed')
  ok(us.toBinary().length <= PD.UNLOCK_SIZE,
     `★ the real unlocking script (${us.toBinary().length} B) fits the ${PD.UNLOCK_SIZE} B fee estimate`)

  // ⚠⚠⚠ ONE SIGNATURE CANNOT TEST low-s. RFC 6979 is deterministic, so a given key and digest give a
  //   signature that is either naturally low or not, and mine was low - so turning normalisation off
  //   changed nothing and the mutation survived. ⇒ Sweep until a naturally HIGH-s case appears, then
  //   require the default to normalise it. The sweep is the test; one sample was a coin flip.
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
  const sOf = d => decodeDer(d, true)[1]
  let high = 0, normalised = 0
  for (let v = 1; v <= 40; v++) {
    const t = new Tx(1, [{ txid: prev, vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                        [{ value: v, script: me.lockingScript() }], 0)
    const raw = ecdsaSign(me.d, dsha256(preimage(t, 0, lockScript.toBinary(), 1000, SIGHASH.ALL_FORKID)), { lowS: false })
    if (sOf(raw) > N / 2n) {
      high++
      const got = Script.fromBinary(PD.unlockScript(me.d, t, 0, lockScript.toBinary(), 1000).toBinary()).chunks[0].data
      if (sOf(got.subarray(0, got.length - 1)) <= N / 2n) normalised++
    }
  }
  ok(high > 0, `⚠ the sweep found ${high} naturally HIGH-s cases in 40 - without one this proves nothing`)
  ok(high > 0 && normalised === high,
     `★★ every one of those ${high} is normalised low (ARC refuses high-s, error 461)`)
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [pushDrop · byte-identical to the deployed wallet]`)
process.exit(fail === 0 ? 0 : 1)
