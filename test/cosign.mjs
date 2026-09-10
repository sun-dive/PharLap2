// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Co-signing — completing a transaction somebody else assembled.
 *
 * ★★★ THE THREAT IS NOT A WRONG SIGNATURE, IT IS A CORRECT SIGNATURE ON THE WRONG THING. Whoever built
 *   the transaction chose its outputs. The fee is simply whatever the inputs exceed them by — so naming
 *   a large coin of yours and a small change output donates the surplus to the miner, and NOTHING on the
 *   face of the document says so. Deriving the fee and showing it is the only defence, which makes the
 *   warning the feature and the signing the easy part.
 *
 * ⚠⚠ EVERY FACT HERE IS DERIVED FROM BYTES, NEVER READ FROM THE REQUEST. A source transaction is how we
 *   learn an input's value, so a forged one would let an assembler understate what is being spent and
 *   the fee we computed would be a lie we told ourselves. Hence: every source must hash to the txid its
 *   input names, and a missing one is a refusal rather than a display gap.
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer, txidToWire } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { Script } from '../impl/js/script.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { toHex, fromUtf8, concat } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'cs-'))
const out = join(tmp, 'cosign.mjs')
await build({ entryPoints: [join(HERE, '..', 'src', 'cosign.ts')], bundle: true, outfile: out,
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const CS = await import(pathToFileURL(out).href)

const me = Signer.fromSeed(new Uint8Array(64).fill(71))
const them = Signer.fromSeed(new Uint8Array(64).fill(72))

/** a funding transaction paying `who` a given amount at vout 0 */
const fundingTx = (who, sats) => new Tx(1,
  [{ txid: txidToWire('11'.repeat(31) + '01'), vout: 0, script: Uint8Array.of(0x51), sequence: 0xffffffff }],
  [{ value: sats, script: who.lockingScript() }], 0)

/** an OP_FALSE OP_RETURN data output */
const dataOut = text => {
  const b = fromUtf8(text)
  return { value: 0, script: concat(Uint8Array.of(0x00, 0x6a, b.length), b) }
}

/**
 * A transaction somebody else assembled: input 0 is ours and BLANK, input 1 is theirs and already
 * signed. `mySats` is the size of the coin of ours they chose to name — which is the whole point.
 */
function assembled({ mySats, changeSats, extraOutputs = [] }) {
  const mine = fundingTx(me, mySats)
  const theirs = fundingTx(them, 3000)
  const tx = new Tx(1, [
    { txid: txidToWire(mine.txid()), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff },
    { txid: txidToWire(theirs.txid()), vout: 0, script: Uint8Array.of(0x51, 0x51), sequence: 0xffffffff },
  ], [
    { value: 2000, script: them.lockingScript() },
    { value: changeSats, script: me.lockingScript() },
    ...extraOutputs,
  ], 0)
  const sources = [
    { txId: mine.txid(), sourceTxHex: mine.hex() },
    { txId: theirs.txid(), sourceTxHex: theirs.hex() },
  ]
  return { rawTx: tx.hex(), sources, mine, theirs }
}

// ── ★★★ 1 · THE FEE WARNING, WHICH IS WHY THIS MODULE EXISTS ────────────────────────────────────────
// ⚠⚠ THE TWO CASES BELOW DIFFER IN ONE THING ONLY: the size of the coin of yours that was named. The
//   outputs are identical. ⇒ That is exactly the attack — nothing in the document changed, and the
//   surplus went to the miner.
{
  const ordinary = assembled({ mySats: 5000, changeSats: 5800 })
  const a = CS.analyseCosign(ordinary.rawTx, ordinary.sources, me.address())
  ok(a.blockers.length === 0, `an ordinary co-sign is signable (${a.blockers[0] ?? 'no blockers'})`)
  ok(a.fee === 200, `★ the fee is derived, not declared (${a.fee} sat)`)
  ok(!a.warnings.some(w => /FEE IS/.test(w)), '★ …and an ordinary fee raises no alarm')

  // the SAME outputs, a coin twenty times larger
  const robbed = assembled({ mySats: 100000, changeSats: 5800 })
  const b = CS.analyseCosign(robbed.rawTx, robbed.sources, me.address())
  ok(b.totalOut === a.totalOut, '★★ the outputs are IDENTICAL between the two — nothing visible changed')
  ok(b.fee === 95200, `★★★ …yet the fee is now ${b.fee.toLocaleString()} sat, all of it surplus to the miner`)
  ok(b.warnings.some(w => /THE FEE IS/.test(w)),
     '★★★ and it is stated in capitals before anything is signed — the whole purpose of this module')
  ok(b.youPay > a.youPay, `★★ "what you pay" reflects it too (${a.youPay} → ${b.youPay})`)
}

// ── ★★★ 2 · A FORGED SOURCE IS REFUSED ──────────────────────────────────────────────────────────────
// ⚠⚠⚠ A SOURCE TRANSACTION IS HOW WE LEARN AN INPUT'S VALUE. Accept one that does not hash to the txid
//   its input names and an assembler can understate what is being spent — the fee we then "derive" is a
//   number we made up from their bytes. Recomputing the id is the only check that catches it.
{
  const t = assembled({ mySats: 100000, changeSats: 5800 })
  const lie = fundingTx(me, 1000)                       // a real transaction, filed under someone else's id
  const forged = [{ txId: t.sources[0].txId, sourceTxHex: lie.hex() }, t.sources[1]]
  const a = CS.analyseCosign(t.rawTx, forged, me.address())
  ok(a.blockers.some(b => /does not hash to the txid/.test(b)),
     '⛔★★★ a source that does not hash to its claimed txid is refused')

  let threw = ''
  try { await CS.cosignTransaction(t.rawTx, forged, me) } catch (e) { threw = String(e.message) }
  ok(/does not hash/.test(threw), `⛔ …and signing refuses outright rather than warning (${threw.slice(0, 40)}…)`)
}

// ── ★★★ 3 · A MISSING SOURCE IS A REFUSAL, NOT A GAP ────────────────────────────────────────────────
{
  const t = assembled({ mySats: 5000, changeSats: 5800 })
  const a = CS.analyseCosign(t.rawTx, [t.sources[0]], me.address())   // theirs withheld
  ok(a.inputs[1].satoshis === null, 'an input with no source has no known value')
  ok(a.blockers.some(b => /fee cannot be worked out/.test(b)),
     '⛔★★★ …so signing is refused: an unknowable fee is exactly how a co-signer is robbed')
  let threw = ''
  try { await CS.cosignTransaction(t.rawTx, [t.sources[0]], me) } catch (e) { threw = String(e.message) }
  ok(threw !== '', '⛔ and it throws rather than signing a transaction whose cost is unknown')
}

// ── ★★★ 4 · SIGNING TOUCHES ONLY OUR OWN INPUT ──────────────────────────────────────────────────────
//
// ★ Why it can: a sighash preimage commits to the outpoints, the values, the outputs and the scriptCode
//   of the input BEING signed — never to another input's unlocking script. A covenant input authorised
//   by OP_PUSH_TX, or a partner's signature from yesterday, both survive.
{
  const t = assembled({ mySats: 5000, changeSats: 5800 })
  const r = await CS.cosignTransaction(t.rawTx, t.sources, me)
  const before = Tx.parse(t.rawTx), after = Tx.parse(r.rawTx)

  ok(toHex(after.inputs[1].script) === toHex(before.inputs[1].script),
     '★★★ the other party’s input is byte-for-byte untouched')
  ok(after.outputs.every((o, i) => toHex(o.script) === toHex(before.outputs[i].script) && o.value === before.outputs[i].value),
     '★★★ every output is untouched — we complete a transaction, we never edit one')
  ok(after.inputs[0].script.length > 100, `★★ our input is filled in (${after.inputs[0].script.length} bytes)`)

  /* ⚠⚠⚠ THAT THE SIGNATURE IS ACTUALLY IN THE RETURNED BYTES IS THE CHECK THAT MATTERS, and it is worth
     saying why. The removed library cached the bytes it parsed and served them back from serialization,
     so assigning an unlocking script could appear to succeed, return a txid, and hand on the UNSIGNED
     transaction. Our transaction has no such cache — but this asserts the outcome rather than the
     absence, because that is the property, and the next implementation might cache again. */
  const sig = Script.fromBinary(after.inputs[0].script).chunks[0]
  ok(sig?.data != null && Signer.verifyInput(after, 0, me.lockingScript(), 5000, me.publicKey(), sig.data),
     '★★★ and the signature in the RETURNED bytes verifies — not merely assigned somewhere and lost')
  ok(r.txId === after.txid() && r.txId !== before.txid(),
     '★★ the returned txid is the SIGNED transaction’s, and it differs from the unsigned one')
}

// ── ★★ 5 · READING THE OUTPUTS FOR A HUMAN ──────────────────────────────────────────────────────────
{
  const t = assembled({ mySats: 5000, changeSats: 5000, extraOutputs: [dataOut('hello from a stranger')] })
  const a = CS.analyseCosign(t.rawTx, t.sources, me.address())
  ok(a.outputs[0].kind === 'address' && a.outputs[0].address === them.address(),
     '★★ a plain payment names the address it pays')
  ok(a.outputs[1].kind === 'yours', '★★ …and one paying this wallet is marked as yours')
  ok(a.outputs[2].kind === 'data' && a.outputs[2].text === 'hello from a stranger',
     '★ an OP_RETURN is decoded as text — ⚠ to be DISPLAYED as text, never linkified')
  ok(a.youReceive === 5000, '★ what comes back to this wallet is totalled')
}

// ── ⛔ 6 · NOTHING HERE FOR US TO SIGN ───────────────────────────────────────────────────────────────
{
  const theirs = fundingTx(them, 9000)
  const tx = new Tx(1, [{ txid: txidToWire(theirs.txid()), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                       [{ value: 8000, script: them.lockingScript() }], 0)
  const a = CS.analyseCosign(tx.hex(), [{ txId: theirs.txid(), sourceTxHex: theirs.hex() }], me.address())
  ok(a.blockers.some(b => /nothing here for it to sign/.test(b)),
     '⛔ a transaction with no input of ours is refused, not signed vacuously')
}

// ── ★★ 7 · THE FEE IS RATED AGAINST THE SIGNED SIZE ─────────────────────────────────────────────────
// ⚠ Rating it against the unsigned bytes overstates it — every blank we fill grows the transaction by
//   ~107 bytes. A warning that cries wolf on every co-sign is worse than none: it trains the signer to
//   click through the one that matters.
{
  const t = assembled({ mySats: 5000, changeSats: 5800 })
  const a = CS.analyseCosign(t.rawTx, t.sources, me.address())
  ok(a.signedSize === a.size + 107 * a.toSign.length,
     `★★ the signed size allows 107 bytes per blank (${a.size} → ${a.signedSize})`)
  const naive = Math.round((a.fee * 1000) / a.size)
  ok(a.feePerKb < naive,
     `★★★ …so the rate reads ${a.feePerKb} sat/KB rather than the alarmist ${naive} — the warning stays worth reading`)
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [co-signing · every fact derived, never believed]`)
process.exit(fail === 0 ? 0 : 1)
