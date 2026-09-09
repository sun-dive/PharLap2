// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Plain BSV payments — graded on BYTE-IDENTICAL TRANSACTIONS.
 *
 * ★★★ THE SIMPLEST THING THAT SPENDS REAL COINS, and the last file in the closure a payment needs. Four
 *   transactions the deployed builder produces are frozen and ours must match the raw hex exactly.
 *
 * ★★ `sendMax` is the case worth watching. There the RECIPIENT is the output that absorbs whatever is
 *   left after the fee, so the same mechanism that pays our own change sweeps the wallet instead. One
 *   call covers both because "the output that takes the remainder" is the only idea involved.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { Script } from '../impl/js/script.mjs'
import { fromHex, toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'payment-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [payment · deployed-transaction vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'pay-'))
const out = join(tmp, 'payment.mjs')
await build({ entryPoints: [join(HERE, '..', 'src', 'payment.ts')], bundle: true, outfile: out,
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const P = await import(pathToFileURL(out).href)

const key = Signer.fromPrivateKey(fromHex(V.key))
const fundingOf = v => v.funding.map(f => ({ utxo: { txId: f.txId, outputIndex: f.outputIndex, satoshis: f.satoshis, script: '' } }))
const byName = n => V.vectors.find(v => v.name === n)
const buildFrom = v => P.buildPaymentTx({
  key, toAddress: v.toAddress, amountSats: v.amountSats, sendMax: v.sendMax, funding: fundingOf(v),
})

// ── ★★★ byte identity, across every shape a payment takes ───────────────────────────────────────────
let same = 0
for (const v of V.vectors) {
  const r = await buildFrom(v)
  const okAll = r.tx.hex() === v.hex && r.txId === v.txId && r.sentSats === v.sentSats
    && r.changeSats === v.changeSats && r.changeVout === v.changeVout
  if (okAll) same++
  else console.log(`  ✗ ${v.name}: hex ${r.tx.hex() === v.hex}, sent ${r.sentSats}/${v.sentSats}, change ${r.changeSats}/${v.changeSats}`)
}
ok(V.vectors.length >= 4, `there are ${V.vectors.length} deployed payments to match`)
ok(same === V.vectors.length, `★★★ all ${V.vectors.length} are BYTE IDENTICAL to the deployed builder (${same})`)

// ── ★★ sendMax: the recipient absorbs the remainder ─────────────────────────────────────────────────
{
  const v = byName('sendMax sweep')
  const r = await buildFrom(v)
  ok(r.tx.outputs.length === 1, '★★ a sweep has ONE output - no change, because nothing is kept back')
  ok(r.changeVout === null && r.changeSats === 0, '…and reports no change')
  ok(r.sentSats === v.funding[0].satoshis - (v.funding[0].satoshis - r.sentSats),
     `…sending ${r.sentSats} of ${v.funding[0].satoshis}, the difference being the fee (${v.funding[0].satoshis - r.sentSats})`)
  const ordinary = await buildFrom(byName('payment with change'))
  ok(ordinary.tx.outputs.length === 2, '⚠ an ordinary payment has two - recipient and change')
  ok(ordinary.changeVout === 1, '…with change second, where the deployed builder puts it')
}

// ── ⚠ non-vacuous: a difference must show ───────────────────────────────────────────────────────────
{
  const v = byName('payment with change')
  const r = await P.buildPaymentTx({ key, toAddress: v.toAddress, amountSats: v.amountSats + 1, funding: fundingOf(v) })
  ok(r.tx.hex() !== v.hex, '⛔ one satoshi more to the recipient gives different bytes')
  ok(r.changeSats === v.changeSats - 1, '…and exactly one satoshi less change')
}

// ── ⛔ the guards, which are the difference between a refusal and a lost coin ────────────────────────
const rejects = async (fn, m) => { try { await fn(); return false } catch (e) { return String(e.message).includes(m) } }
{
  const v = byName('payment with change')
  ok(await rejects(() => P.buildPaymentTx({ key, toAddress: '1NotAValidAddressAtAll', amountSats: 1, funding: fundingOf(v) }),
     'Invalid BSV address'), '⛔ a bad address is refused BEFORE anything is built')
  ok(await rejects(() => P.buildPaymentTx({ key, toAddress: v.toAddress, amountSats: 1, funding: [] }),
     'No spendable funds'), '⛔ no funding is refused')
  ok(await rejects(() => P.buildPaymentTx({ key, toAddress: v.toAddress, amountSats: 0, funding: fundingOf(v) }),
     'at least 1 sat'), '⛔ a zero amount is refused - a 0-value output is dust before the script is read')
  // ⚠ a mainnet P2SH address decodes cleanly and is still not payable by this path
  ok(await rejects(() => P.buildPaymentTx({ key, toAddress: '37jMtwxS6iNvfbdPL4mxaxJWnwvLXWeRRp', amountSats: 1, funding: fundingOf(v) }),
     'Invalid BSV address'), '⛔ a valid P2SH address is refused for its VERSION, not merely for parsing')
}
{
  // ⛔ sweeping less than the fee: refused, rather than paying out a negative or zero amount
  const tiny = [{ utxo: { txId: 'ab'.repeat(31) + '01', outputIndex: 0, satoshis: 5, script: '' } }]
  ok(await rejects(() => P.buildPaymentTx({ key, toAddress: byName('sendMax sweep').toAddress, amountSats: 0, sendMax: true, funding: tiny }),
     'insufficient funds'), '⛔ sweeping less than the fee is refused')
}
{
  // ⚠⚠ MUTATION TESTING FOUND BOTH OF THESE, and both are EXACT boundaries. My "too small to sweep"
  //   case used 5 satoshis, which `applyFee` rejects for insufficient funds before the delivered-amount
  //   check is ever reached - so removing that check survived. The case that reaches it is funding equal
  //   to the fee EXACTLY: the arithmetic succeeds and delivers zero.
  const sweepFee = 20   // 192 bytes at 101 sat/KB, for a one-input single-output sweep
  const exact = [{ utxo: { txId: 'cd'.repeat(31) + '01', outputIndex: 0, satoshis: sweepFee, script: '' } }]
  ok(await rejects(() => P.buildPaymentTx({ key, toAddress: byName('sendMax sweep').toAddress, amountSats: 0, sendMax: true, funding: exact }),
     'too small to cover'),
     '⛔★ funding EQUAL to the fee delivers zero, and is refused with the reason - not broadcast')
  const oneMore = [{ utxo: { ...exact[0].utxo, satoshis: sweepFee + 1 } }]
  const r = await P.buildPaymentTx({ key, toAddress: byName('sendMax sweep').toAddress, amountSats: 0, sendMax: true, funding: oneMore })
  ok(r.sentSats === 1, '★ …and one satoshi more delivers exactly 1, so the boundary is where it says')
}
{
  // ⚠ the other boundary: change that lands on EXACTLY zero must be reported as no change, or the
  //   caller registers a pending UTXO worth nothing and then tries to spend it.
  const v = byName('payment with change')
  const fee1 = 23      // 226 bytes at 101 sat/KB, one input, two outputs
  const amount = 1000
  const funding = [{ utxo: { txId: 'ef'.repeat(31) + '02', outputIndex: 0, satoshis: amount + fee1, script: '' } }]
  const r = await P.buildPaymentTx({ key, toAddress: v.toAddress, amountSats: amount, funding })
  ok(r.changeSats === 0, `funding of exactly amount + fee leaves no change (${r.changeSats})`)
  ok(r.changeVout === null,
     '⛔★ …and changeVout is NULL, so nothing registers a pending UTXO worth zero satoshis')
}
{
  // ★ and the boundary that still works: a sweep of 200 sats delivers 180
  const v = byName('sendMax, barely enough')
  const r = await buildFrom(v)
  ok(r.sentSats === v.sentSats && r.sentSats > 0,
     `★ a 200-satoshi sweep still delivers ${r.sentSats} - small, but not refused`)
}

// ── the recipient really is paid ────────────────────────────────────────────────────────────────────
{
  const v = byName('payment with change')
  const r = await buildFrom(v)
  const toKey = Signer.fromPrivateKey(fromHex(V.toKey))
  ok(toHex(r.tx.outputs[0].script) === toHex(toKey.lockingScript()),
     '★★ output 0 pays the RECIPIENT’s script, derived independently from their key')
  ok(toHex(r.tx.outputs[1].script) === toHex(key.lockingScript()), '…and the change comes back to us')
  ok(r.tx.outputs[0].value === v.amountSats, `…the exact amount asked for (${v.amountSats})`)
  // ⚠ every input is signed, and against the right amount
  let verified = 0
  r.tx.inputs.forEach((inp, i) => {
    const sig = Script.fromBinary(inp.script).chunks[0]
    if (Signer.verifyInput(r.tx, i, key.lockingScript(), v.funding[i].satoshis, key.publicKey(), sig.data)) verified++
  })
  ok(verified === r.tx.inputs.length, `★★★ every input verifies (${verified}/${r.tx.inputs.length})`)
}
{
  const v = byName('three inputs')
  const r = await buildFrom(v)
  let verified = 0
  r.tx.inputs.forEach((inp, i) => {
    const sig = Script.fromBinary(inp.script).chunks[0]
    if (Signer.verifyInput(r.tx, i, key.lockingScript(), v.funding[i].satoshis, key.publicKey(), sig.data)) verified++
  })
  ok(verified === 3, `★★ all three inputs verify, each against its OWN amount (${verified}/3)`)
  ok(Tx.parse(r.tx.hex()).hex() === v.hex, '…and the whole transaction round-trips')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [payment · byte-identical transactions]`)
process.exit(fail === 0 ? 0 : 1)
