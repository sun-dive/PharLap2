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
import { hash160 } from '../impl/js/bip32.mjs'
import { sha256 } from '@noble/hashes/sha2.js'
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
  const chunks = Script.fromBinary(after.inputs[0].script).chunks
  const sig = chunks[0]
  ok(sig?.data != null && Signer.verifyInput(after, 0, me.lockingScript(), 5000, me.publicKey(), sig.data),
     '★★★ and the signature in the RETURNED bytes verifies — not merely assigned somewhere and lost')

  /* ⚠⚠ A P2PKH INPUT IS TWO CLAIMS, AND CHECKING ONE IS NOT CHECKING BOTH. The script asks: does the
     pushed key HASH to the hash in the lock, and does its signature verify. A signature can be perfectly
     valid under a key that the locking script never authorised.
     ⛔ THIS IS ALSO AN HONEST GAP AGAINST THE DEPLOYED TEST, which ran the input through a script
       INTERPRETER and so checked both plus the opcodes. This repository has no interpreter, so the two
       claims are asserted directly instead. That is most of the distance, not all of it, and the
       shortfall is written here rather than left for someone to assume away. */
  const pushedKey = chunks[1]?.data
  const lockHash = me.lockingScript().slice(3, 23)
  ok(pushedKey != null && toHex(pushedKey) === toHex(me.publicKey()),
     '★★ the unlocking script pushes a public key as well as a signature')
  ok(pushedKey != null && toHex(hash160(pushedKey)) === toHex(lockHash),
     '★★★ …and that key HASHES to the hash the locking script names — the other half of a P2PKH')
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

// ── ★★★ 8 · WHAT IS BEING FUNDED, AND HOW MUCH ─────────────────────────────────────────────────────
//
// ★★★ THIS IS WHY THE MODULE EXISTS AT ALL: to fund a covenant it cannot rebuild, including ones not
//   written yet. ⚠ Without the check below the signer sees "105,000 sat · script · 61 bytes" and has no
//   way to tell one script from another.
//
// ★★ THE DERIVATION NEEDS NO COVENANT CODE, WHICH IS THE POINT. A covenant top-up SPENDS the covenant
//   and RE-CREATES it holding more — it has to, since a covenant that could be topped up without being
//   spent would not be a covenant. ⇒ The same locked script therefore appears twice: as an input's
//   source script and as an output. Matching those says "this adds N satoshis to THAT", and nothing
//   here has to change when the next covenant arrives.
const COVENANT = Uint8Array.of(0x51, 0x75, 0x51, 0x76, 0xa9, 0x14, ...new Array(20).fill(0xbe), 0x88, 0xac)
const covHash = toHex(sha256(COVENANT).reverse())

/** a transaction that tops up a covenant: it SPENDS the covenant and re-creates it, larger */
function topUp({ was = 5000, becomes = 105000, myCoin = 120000, changeSats = 14000, covScript = COVENANT } = {}) {
  const covParent = new Tx(1,
    [{ txid: txidToWire('22'.repeat(31) + '02'), vout: 0, script: Uint8Array.of(0x51), sequence: 0xffffffff }],
    [{ value: was, script: covScript }], 0)
  const mine = fundingTx(me, myCoin)
  const tx = new Tx(1, [
    { txid: txidToWire(mine.txid()), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff },
    { txid: txidToWire(covParent.txid()), vout: 0, script: Uint8Array.of(0x51), sequence: 0xffffffff },
  ], [
    { value: becomes, script: covScript },
    { value: changeSats, script: me.lockingScript() },
  ], 0)
  return {
    rawTx: tx.hex(),
    sources: [
      { txId: mine.txid(), sourceTxHex: mine.hex() },
      { txId: covParent.txid(), sourceTxHex: covParent.hex() },
    ],
  }
}

{
  const t = topUp()
  const a = CS.analyseCosign(t.rawTx, t.sources, me.address())
  ok(a.outputs[0].kind === 'continues',
     '★★★ the covenant output is recognised as CONTINUING an input — not an opaque script')
  ok(a.outputs[0].continuesInput === 1, '★★ …and it names which input it re-creates')
  ok(a.funding.length === 1 && a.funding[0].added === 100000,
     `★★★ the amount being sent as funding is derived: ${a.funding[0]?.added?.toLocaleString()} sat`)
  ok(a.funding[0].from === 5000 && a.funding[0].to === 105000,
     '★★ …stated as what it was and what it becomes, not just a delta')
  ok(a.funding[0].scriptHash === covHash,
     '★★★ …under the same script hash this wallet uses to FIND covenants — so it can be compared to the one intended')
  ok(!a.warnings.some(w => /does not otherwise touch/.test(w)),
     '★ a continuation raises no "where is this going" warning, because it is answered')
}

// ── ⛔ 9 · AN EXPECTATION IS A REFUSAL ───────────────────────────────────────────────────────────────
// ⚠⚠ EVERYTHING ABOVE DERIVES WHAT A TRANSACTION DOES. It cannot know what the signer MEANT. A caller
//   that knows which covenant it is funding says so, and a mismatch stops the signing.
{
  const t = topUp()
  ok(CS.analyseCosign(t.rawTx, t.sources, me.address(), { scriptHash: covHash }).blockers.length === 0,
     '★★ naming the right script hash passes')
  const wrong = CS.analyseCosign(t.rawTx, t.sources, me.address(), { scriptHash: 'ab'.repeat(32) })
  ok(wrong.blockers.some(b => /does not add anything to/.test(b)),
     '⛔★★★ naming a DIFFERENT covenant is refused — a correct signature on the wrong thing is the whole threat')
  const tooMuch = CS.analyseCosign(t.rawTx, t.sources, me.address(), { scriptHash: covHash, maxFunding: 50000 })
  ok(tooMuch.blockers.some(b => /more than the/.test(b)),
     '⛔★★★ …and funding MORE than expected is refused, however right the destination')
  let threw = ''
  try { await CS.cosignTransaction(t.rawTx, t.sources, me, { scriptHash: 'ab'.repeat(32) }) } catch (e) { threw = String(e.message) }
  ok(threw !== '', '⛔ signing honours the expectation rather than merely reporting it')
}

// ── ⚠⚠ 10 · A FALLING VALUE IS NORMAL — UNTIL IT IS NOT ─────────────────────────────────────────────
//
// ⚠⚠⚠ THIS IS WHERE THE OBVIOUS RULE IS WRONG. A covenant may pay its own running costs out of the
//   value it carries, so an ordinary spend can come out SMALLER and a top-up is simply one that came out
//   larger. ⇒ Warning on any decrease fires in capitals on the normal case, which trains the signer to
//   click through the warning that matters. The first version of this did exactly that.
//
// ★★★ THE FEE IS THE LINE, and it is arithmetic on this transaction alone. Value that went to the MINER
//   is accounted for; value that left BEYOND the fee went to another output. ⚠ Nothing here claims what
//   any particular covenant permits — that is the covenant's business, not the signer's.
{
  // an ordinary tick: the covenant shrinks by exactly what the transaction pays the miner
  const tick = topUp({ was: 105000, becomes: 104800, myCoin: 0, changeSats: 0 })
  const a = CS.analyseCosign(tick.rawTx, tick.sources, me.address())
  ok(a.funding[0].added === -200, '★★ a tick’s value falls, and the fall is derived')
  ok(a.fee === 200, '…and it is exactly the fee')
  ok(!a.warnings.some(w => /LESS than input/.test(w)),
     '★★★ a covenant paying its OWN fee raises no alarm — this is what normal operation looks like')

  // value leaving beyond the fee: it went to an output, not to a miner
  const drained = topUp({ was: 105000, becomes: 5000, myCoin: 2000, changeSats: 101000 })
  const b = CS.analyseCosign(drained.rawTx, drained.sources, me.address())
  ok(b.funding[0].added === -100000, '★★ the direction is derived, not assumed')
  ok(b.warnings.some(w => /LESS than input/.test(w)),
     '⚠⚠★★★ …and value leaving BEYOND the fee is called out — somebody took it')

  /* ★★★ THE BOUNDARY IS WHERE THIS HAS TO BE EXACT, and a large drain does not test it. Here the
     covenant falls by 300 while the transaction pays 200, so exactly 100 sat went to an output rather
     than to a miner.
     ⚠ Written because a mutation that double-counted the fee SURVIVED the large-drain case above — the
       drain was so far past the threshold that getting the threshold wrong changed nothing.
     ⚠⚠ AND THIS IS A TEST OF THE CHECK, NOT A CLAIM ABOUT ANY DEPLOYED SCRIPT. A first draft of this
       comment described it as a realistic attack and reasoned about a live covenant's fee arithmetic to
       do so. That was wrong twice over: wrong on the facts, and not this module's business either way.
       ⇒ What is being tested is that the THRESHOLD is the fee and not zero. Whether a given covenant
         would permit such a spend is for that covenant to enforce. */
  const siphon = topUp({ was: 105000, becomes: 104700, myCoin: 1000, changeSats: 1100 })
  const c = CS.analyseCosign(siphon.rawTx, siphon.sources, me.address())
  ok(c.fee === 200 && c.funding[0].added === -300,
     `★★ the covenant falls 300 while the transaction pays 200 (fee ${c.fee}, delta ${c.funding[0].added})`)
  ok(c.warnings.some(w => /100 sat LESS than input/.test(w)),
     '⚠★★★ …and exactly the 100 sat that went somewhere other than the miner is named')
}

// ── ⚠ 11 · MONEY GOING SOMEWHERE WITH NO PRECEDENT ──────────────────────────────────────────────────
// ⚠⚠ AN OUTPUT PAYING A SCRIPT THE TRANSACTION DOES NOT ALSO SPEND cannot be explained by anything in
//   the document. That is not necessarily an attack — but it is the one case where the signer is being
//   asked to take something on trust, so it is said out loud.
{
  const t = assembled({ mySats: 100000, changeSats: 5800, extraOutputs: [{ value: 90000, script: COVENANT }] })
  const a = CS.analyseCosign(t.rawTx, t.sources, me.address())
  ok(a.outputs[2].kind === 'script' && a.outputs[2].continuesInput === undefined,
     'an output matching no input stays an opaque script')
  ok(a.warnings.some(w => /does not otherwise touch/.test(w)),
     '⚠★★ …and the signer is told that 90,000 sat is going somewhere nothing here explains')
  ok(a.outputs[2].scriptHash === covHash, '★ its identity is still shown, so it can be looked up')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [co-signing · every fact derived, never believed]`)
process.exit(fail === 0 ? 0 : 1)
