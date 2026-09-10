// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Bundle covenant — graded on BYTE IDENTITY with the deployed script assembly.
 *
 * ★★★ THIS REPOSITORY HAS NO SCRIPT INTERPRETER, so it cannot run a resale. What it can prove is that it
 *   assembles the SAME locking script, the SAME introspection preimage and the SAME unlocking script the
 *   deployed code did. The vectors also record the verdict an interpreter gave each resale when they were
 *   frozen: the honest one accepted, and every tampered one refused.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { Tx, preimage, SIGHASH } from '../impl/js/transaction.mjs'
import { Script } from '../impl/js/script.mjs'
import { hash160 } from '../impl/js/bip32.mjs'
import { fromHex, toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'bundle-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [bundle covenant · deployed vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'bundle-'))
const load = async m => {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
  return import(pathToFileURL(join(tmp, `${m}.mjs`)).href)
}
const BC = await load('bundleCovenant')
const CV = await load('covenant')

const holder = Signer.fromPrivateKey(fromHex(V.holderKey))
const newOwner = Signer.fromPrivateKey(fromHex(V.newOwnerKey))
const payees = n => V.payeeKeys.slice(0, n).map((k, i) => ({ pubKeyHash: Array.from(hash160(Signer.fromPrivateKey(fromHex(k)).publicKey())), feeSats: 1000 * (i + 1) }))
const lockFor = n => BC.buildBundleLock({ manifestRef: V.manifestRef, ownerPubKey: Array.from(holder.publicKey()), payees: payees(n), tokenSats: V.bond })

// ── ★★★ 1 · the locking script, for one, three and five payees ──────────────────────────────────────
ok(payees(3).every((p, i) => toHex(Uint8Array.from(p.pubKeyHash)) === V.payees[i].pubKeyHash), '★ the payee hashes derive as recorded')
for (const n of [1, 3, 5]) {
  ok(lockFor(n).toHex() === V.locks[n], `★★★ the bundle lock for ${n} payee(s) is byte-identical to the deployed script`)
}
ok(BC.BUNDLE_OWNER_OFFSET === V.ownerOffset, '★ the holder sits at the deployed offset')
{
  const bytes = Array.from(lockFor(2).toBinary())
  ok(toHex(Uint8Array.from(bytes.slice(V.ownerOffset, V.ownerOffset + 33))) === toHex(holder.publicKey()), '★★ …and the 33 bytes there are the holder\'s key')
  const swapped = BC.swapBundleOwner(bytes, Array.from(newOwner.publicKey()))
  ok(toHex(Uint8Array.from(swapped.slice(V.ownerOffset, V.ownerOffset + 33))) === toHex(newOwner.publicKey()) && swapped.length === bytes.length,
     '★★ swapping the owner changes exactly that slot')
}

// ── ★★★ 2 · the resale: preimage, signature, unlock — byte for byte ─────────────────────────────────
{
  const lock = lockFor(3)
  const lockBytes = lock.toBinary()
  const sp = Tx.parse(V.valid.spendHex)
  ok(toHex(sp.outputs[0].script) === toHex(Uint8Array.from(BC.swapBundleOwner(Array.from(lockBytes), Array.from(newOwner.publicKey())))) && sp.outputs[0].value === V.bond,
     '★★ out0 of the deployed resale is the same script re-locked to the new holder, at the bond')
  const introspection = preimage(sp, 0, lockBytes, V.bond, CV.EDITION_SCOPE)
  ok(toHex(introspection) === V.valid.introspectionHex, '★★★ the introspection preimage is byte-identical')
  const ownerSig = holder.signInput(sp, 0, lockBytes, V.bond, SIGHASH.ALL_FORKID)
  ok(toHex(ownerSig) === V.valid.ownerSigHex, '★★★ the owner signature is byte-identical (deterministic nonce, low S)')
  const changeScript = Array.from(sp.outputs[sp.outputs.length - 1].script)
  const unlock = Script.toBinary(BC.bundleTransferUnlockChunks({
    newOwnerPubKey: Array.from(newOwner.publicKey()), ownerSig: Array.from(ownerSig),
    change: CV.serializeOutput(500, changeScript), preimage: Array.from(introspection),
  }).map(c => ({ op: c.op, data: c.data === undefined ? undefined : Uint8Array.from(c.data) })))
  ok(toHex(unlock) === V.valid.unlockHex, '★★★ the unlocking script is byte-identical')
  ok(toHex(sp.inputs[0].script) === V.valid.unlockHex, '★ …and it is what the deployed resale carried at input 0')
}

// ── ★ 3 · the verdicts recorded when the vectors were frozen ────────────────────────────────────────
ok(V.valid.accepted === true && V.validN1.accepted === true && V.validN5.accepted === true, '★ an honest resale was accepted, for 1, 3 and 5 payees')
ok(V.dropped.accepted === false, '⛔ skipping a creator payout was refused')
ok(V.underpaid.accepted === false, '⛔ underpaying a creator was refused')
ok(V.redirected.accepted === false, '⛔ redirecting a creator fee was refused')

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [bundle covenant · byte-identical scripts]`)
process.exit(fail === 0 ? 0 : 1)
