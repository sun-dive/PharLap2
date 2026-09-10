// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The collection builders — graded on BYTE-IDENTICAL TRANSACTIONS.
 *
 * ★★★ THIS IS THE TEST FOR THE BUILD-SHAPE CHANGE, and nothing weaker would do. The deployed builders
 *   made a mutable transaction that filled in its own change and signed itself from templates; these
 *   decide everything first and then sign against explicit values. If that substitution is faithful,
 *   the raw transaction hex is the SAME BYTES: same fee, same outputs, same deterministic signatures,
 *   therefore the same txid.
 *
 * ⚠⚠ "It produces a valid transaction" would prove almost nothing. A transaction with a different fee
 *   is valid. One with the change output in a different place is valid. Both would be a different txid,
 *   and a mint's txid is the collection's identity for its whole life.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer, txidToWire } from '../impl/js/signer.mjs'
import { fromHex, toHex } from '../impl/js/bytes.mjs'
import { Tx } from '../impl/js/transaction.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'builder-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [collection builder · deployed-transaction vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'cb-'))
const out = join(tmp, 'collectionBuilder.mjs')
await build({ entryPoints: [join(HERE, '..', 'src', 'collectionBuilder.ts')], bundle: true, outfile: out,
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const CB = await import(pathToFileURL(out).href)

const key = Signer.fromPrivateKey(fromHex(V.key))
const fundingOf = v => v.funding.map(f => ({ utxo: { txId: f.txId, outputIndex: f.outputIndex, satoshis: f.satoshis, script: '' } }))
const byName = n => V.vectors.find(v => v.name === n)

// ── ★★★ the same bytes, for each shape of transaction ───────────────────────────────────────────────
{
  const v = byName('template, no file')
  const r = await CB.buildTemplateTx({ key, funding: fundingOf(v), template: v.template })
  ok(r.tx.hex() === v.hex, '★★★ template with no file: BYTE IDENTICAL to the deployed builder')
  ok(r.tx1Id === v.tx1Id, `…same txid (${r.tx1Id.slice(0, 16)}…)`)
  ok(r.changeSats === v.changeSats, `…same change, to the satoshi (${r.changeSats})`)
  ok(r.changeVout === v.changeVout, '…and the change is at the same output index')
}
{
  const v = byName('template with file')
  const file = { mimeType: v.file.mimeType, fileName: v.file.fileName, fileBytes: Array.from(fromHex(v.file.fileBytesHex)) }
  const r = await CB.buildTemplateTx({ key, funding: fundingOf(v), template: v.template, file })
  ok(r.tx.hex() === v.hex, '★★★ template WITH an embedded file: byte identical')
  ok(r.changeSats === v.changeSats, `…and the larger transaction pays the same fee (change ${r.changeSats})`)
}
{
  const v = byName('genesis, 3 mints')
  const r = await CB.buildGenesisTx({ key, funding: fundingOf(v), tx1Id: v.tx1Id, mintCount: v.mintCount, stateData: v.stateData })
  ok(r.tx.hex() === v.hex, '★★★ genesis minting 3 tokens: byte identical')
  ok(r.tx2Id === v.tx2Id, '…same txid')
  ok(r.tokenVouts.join(',') === v.tokenVouts.join(','), `…tokens at the same outputs (${r.tokenVouts.join(', ')})`)
}

// ── ⚠ non-vacuous: the comparison must be able to FAIL ──────────────────────────────────────────────
// ⚠⚠ Three transactions matching is only meaningful if a difference would show. A fee rate one satoshi
//   off changes the change output and therefore every byte after it.
{
  const v = byName('template, no file')
  const r = await CB.buildTemplateTx({ key, funding: fundingOf(v), template: v.template, feePerKb: 100 })
  ok(r.tx.hex() !== v.hex, '⛔ a fee rate of 100 instead of 101 gives DIFFERENT bytes, as it must')
  ok(r.changeSats !== v.changeSats, `…and a different change (${r.changeSats} vs ${v.changeSats})`)
}

// ── the constants that are policy, not preference ───────────────────────────────────────────────────
ok(CB.DEFAULT_FEE_PER_KB === 101,
   '★ 101 sat/KB: the floor is 100 and the extra satoshi is a hair so rounding can never go under')
ok(CB.PHARLAP_OUTPUT_SATS === 1, '★ a record output is 1 satoshi, never 0 - a 0-value output is refused as dust')

// ── funding selection and the quarantine that protects tokens ───────────────────────────────────────
{
  const u = n => ({ txId: 'aa'.repeat(31) + '01', outputIndex: 0, satoshis: n, script: '' })
  ok(CB.selectFunding([u(10), u(500), u(90)], 500).length === 1, 'selection is greedy, largest first')
  ok(CB.selectFunding([u(10), u(500), u(90)], 550)
       .reduce((t, x) => t + x.satoshis, 0) >= 550, '…and takes more until the target is covered')
  let threw = false
  try { CB.selectFunding([u(10)], 5000) } catch (e) { threw = String(e.message).includes('Insufficient funds') }
  ok(threw, '⛔ not enough funding throws rather than building an underfunded transaction')
}

// ── ⛔ THE QUARANTINE: never spend a token output as fee funding ────────────────────────────────────
// ⚠⚠ MUTATION TESTING FOUND THIS UNTESTED. Every record output is 1 satoshi, so a funding selector that
//   does not exclude them will spend one to pay a fee, and the transaction looks entirely ordinary.
//
// ⚠ SAY WHAT IS ACTUALLY LOST, and say it in this system's own terms - two earlier attempts of mine
//   did not. It is NOT a burn: nothing goes to an unspendable output, and no data disappears. The
//   record stays in a mined transaction and stays readable for ever.
//
//   ⛔ Nor is it the loss of a POINTER, because nothing here holds one. A holder's edition script is
//     DERIVED - `buildHolderEditionScript(templateCovenant, tx1Ref, ownerPub)` - and found by asking
//     for unspent outputs at its script hash. The wallet never records "my token is at txid:vout", so
//     there is no pointer to lose and a tip is REDISCOVERED rather than remembered. Everything needed
//     to derive it again is on chain and stays there.
//
//   ⇒ What a fee spend actually removes is the UNSPENT OUTPUT at that derived script hash. A transfer
//     spends the token output and RECREATES it for the new owner; a fee consumes it and creates no
//     successor, so the lookup that would have found it returns nothing.
//
//   ⇒ And "burn" is the wrong word twice over, because this wallet HAS a deliberate burn operation.
//     Using it for an accident confuses it with a feature.
//
// ⇒ The filter is the only thing standing between a mint and that, and it is worth exactly 1 satoshi
//   of fee saved - which is the whole reason a selector would ever reach for one.
{
  const utxos = [
    { txId: 'aa'.repeat(31) + '01', outputIndex: 0, satoshis: 1, script: '' },      // a token
    { txId: 'bb'.repeat(31) + '02', outputIndex: 1, satoshis: 1, script: '' },      // another token
    { txId: 'cc'.repeat(31) + '03', outputIndex: 0, satoshis: 50000, script: '' },  // real funding
  ]
  const safe = await CB.getSafeUtxos({ getUtxos: async () => utxos })
  ok(safe.length === 1 && safe[0].satoshis === 50000,
     `⛔★ the two 1-satoshi record outputs are QUARANTINED, not offered as funding (${safe.length} of 3 offered)`)
  ok(safe.every(u => u.satoshis > CB.PHARLAP_OUTPUT_SATS), '…the rule is strictly greater than the record value')
  const none = await CB.getSafeUtxos({ getUtxos: async () => utxos.slice(0, 2) })
  ok(none.length === 0, '⚠ a wallet holding only tokens offers NO funding, rather than spending them')
}

// ── ★★ what the shape change bought: the parents are no longer needed ───────────────────────────────
// ⚠ The deployed builder took `sourceTx` per input and read the script and amount back out of it. Here
//   both are stated, so a mint no longer fetches one parent transaction per funding UTXO before it can
//   sign. The vectors above were built with NO sourceTx at all, which is the proof.
{
  const v = byName('template, no file')
  ok(fundingOf(v).every(f => f.sourceTx === undefined),
     '★★ every transaction above was built WITHOUT a parent transaction')
  const r = await CB.buildTemplateTx({ key, funding: fundingOf(v), template: v.template })
  ok(Tx.parse(r.tx.hex()).hex() === v.hex, '…and the result still round-trips through the parser')
}

// ── ⚠⚠ SIGNING FUNDING THAT DOES NOT START AT INPUT 0 ──────────────────────────────────────────────
//
// ⚠⚠⚠ A COVENANT SPEND PUTS THE COVENANT FIRST, so the payer's funding begins at input 1. `signFunding`
//   used to assume index 0 and would then have signed the COVENANT input with a P2PKH unlock and left
//   the real funding input empty.
// ⛔ THE FAILURE IS SILENT LOCALLY. Such a transaction serializes, hashes and broadcasts perfectly well;
//   the network rejects it for a bad script, and nothing on this side says the indexes were off by one.
//   ⇒ Which is exactly why it needs a test rather than a careful reading.
{
  const key = Signer.fromSeed(new Uint8Array(64).fill(77))
  const other = Signer.fromSeed(new Uint8Array(64).fill(78))
  const funding = [{ utxo: { txId: 'ab'.repeat(31) + '01', outputIndex: 0, satoshis: 50000, script: '' } }]

  // input 0 stands in for a covenant being spent; input 1 is the funding
  const tx = new Tx(2,
    [{ txid: txidToWire('cd'.repeat(31) + '09'), vout: 0, script: Uint8Array.of(0x51), sequence: 0xffffffff },
     { txid: txidToWire(funding[0].utxo.txId), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
    [{ value: 1000, script: key.lockingScript() }], 0)

  CB.signFunding(tx, key, funding, 1)
  ok(toHex(tx.inputs[0].script) === '51',
     '★★★ the input BEFORE the funding is left exactly as it was — not overwritten with a P2PKH unlock')
  ok(tx.inputs[1].script.length > 100, `★★★ …and the funding input at index 1 is the one that got signed (${tx.inputs[1].script.length} bytes)`)
  ok(Signer.verifyInput(tx, 1, key.lockingScript(), 50000, key.publicKey(),
       (await import('../impl/js/script.mjs')).Script.fromBinary(tx.inputs[1].script).chunks[0].data),
     '★★ …and that signature verifies against input 1, for input 1’s amount')

  /* ⛔ AN OFFSET PAST THE LAST INPUT MUST SAY SO — and the assertion is on the MESSAGE, not merely that
     something was thrown. ⚠ Without the guard, `tx.inputs[5].script = …` throws a TypeError all by
     itself, so a test that only checks "it threw" passes with the guard deleted. It was written as a
     mutant and it survived exactly that. The guard's whole value is naming the index that was wrong. */
  let threw = ''
  try { CB.signFunding(tx, key, funding, 5) } catch (e) { threw = String(e.message) }
  ok(/signFunding: no input at 5/.test(threw),
     `⛔★ an offset past the last input names the index it could not find (${threw.slice(0, 52)})`)

  // ★ and the default is unchanged, so every existing caller behaves exactly as before
  const tx2 = new Tx(2,
    [{ txid: txidToWire(funding[0].utxo.txId), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
    [{ value: 1000, script: key.lockingScript() }], 0)
  CB.signFunding(tx2, key, funding)
  ok(tx2.inputs[0].script.length > 100, '★ with no offset given, funding still signs from input 0')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [collection builder · byte-identical transactions]`)
process.exit(fail === 0 ? 0 : 1)
