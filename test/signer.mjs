// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The signer — graded against REAL MAINNET SPENDS.
 *
 * ★★★ THE ORACLE IS THE NETWORK'S OWN ACCEPTANCE. Signing with our code and verifying with our code
 *   proves only that we agree with ourselves. These signatures were validated by miners and buried
 *   under thousands of blocks, so accepting them grades our BIP-143 preimage, our DER decoding and our
 *   verifier against consensus.
 *
 * ⚠⚠ AND THE ACCEPTANCE IS PROVED NON-VACUOUS. A verifier that returns `true` unconditionally would pass
 *   the check above. So every vector is also re-checked with the amount, the script and the transaction
 *   each perturbed in turn, and all three MUST fail.
 */
import { Signer, SignerError, txidToWire, wireToTxid, DEFAULT_PATH } from '../impl/js/signer.mjs'
import { Tx, SIGHASH, sighash } from '../impl/js/transaction.mjs'
import { Script } from '../impl/js/script.mjs'
import { decodeDer } from '../impl/js/ecdsa.mjs'
import { N } from '../impl/js/secp256k1.mjs'
import { fromHex, toHex, concat, equals } from '../impl/js/bytes.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }
const threw = (fn, match) => {
  try { fn(); return false } catch (e) { return e instanceof SignerError && String(e.message).includes(match) }
}

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'spend-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [signer · mainnet spend vectors not present — run tools/gen-spend-vectors.mjs]')
  process.exit(0)
}

// ── ★★★ signatures consensus already accepted ───────────────────────────────────────────────────────
let good = 0
for (const v of V.vectors) {
  const tx = Tx.parse(v.spendingTx)
  if (Signer.verifyInput(tx, v.inputIndex, fromHex(v.prevScript), v.prevValue, fromHex(v.pubkey), fromHex(v.sig)))
    good++
  else console.log(`  ✗ ${v.source}`)
}
ok(V.vectors.length > 0, 'there are spends to check')
ok(good === V.vectors.length, `★★★ all ${V.vectors.length} REAL MAINNET signatures verify (${good} of them)`)

// ── ⚠⚠ …and the check is not vacuous: each perturbation MUST break it ────────────────────────────────
let byAmount = 0, byScript = 0, byTx = 0
for (const v of V.vectors) {
  const tx = Tx.parse(v.spendingTx)
  const sig = fromHex(v.sig), pub = fromHex(v.pubkey), sc = fromHex(v.prevScript)
  // ⚠ ONE satoshi. The amount is committed by the signature and by nothing else in the transaction.
  if (!Signer.verifyInput(tx, v.inputIndex, sc, v.prevValue + 1, pub, sig)) byAmount++
  // ⚠ the scriptCode likewise comes from the funding output, not from here
  if (!Signer.verifyInput(tx, v.inputIndex, concat(sc, Uint8Array.of(0x51)), v.prevValue, pub, sig)) byScript++
  // ⚠ and the transaction itself: move one satoshi between the outputs
  const t2 = Tx.parse(v.spendingTx)
  if (t2.outputs.length) t2.outputs[0].value += 1
  if (!Signer.verifyInput(t2, v.inputIndex, sc, v.prevValue, pub, sig)) byTx++
}
const n = V.vectors.length
ok(byAmount === n, `★★ a ONE satoshi change to the amount breaks every one (${byAmount}/${n})`)
ok(byScript === n, `★★ a changed scriptCode breaks every one (${byScript}/${n})`)
ok(byTx === n, `★★ a changed output value breaks every one (${byTx}/${n})`)

// ── ⚠ what the real spends actually look like ───────────────────────────────────────────────────────
const types = new Set(V.vectors.map(v => fromHex(v.sig).slice(-1)[0]))
ok([...types].every(t => t === SIGHASH.ALL_FORKID),
   `⚠ every real spend uses ALL|FORKID (0x41) — FORKID is REQUIRED on this chain, not optional`)
ok(V.vectors.every(v => decodeDer(fromHex(v.sig), true) !== null),
   '★ each signature parses as strict DER once the trailing sighash byte is allowed for')
ok(V.vectors.every(v => decodeDer(fromHex(v.sig)) === null),
   '⛔ …and is REFUSED without allowTrailing, so the trailing byte is genuinely being handled')

// ── our own signing, round trip ─────────────────────────────────────────────────────────────────────
const me = Signer.fromSeed(new Uint8Array(64).fill(7))
// ⚠⚠ MUTATION TESTING FOUND THIS: the outputs must pay a DIFFERENT script from the one being spent.
//   With both set to `me.lockingScript()`, taking the scriptCode from `tx.outputs[0]` instead of from
//   the UTXO changed nothing at all, and a mutation doing exactly that survived the whole suite.
const other = Signer.fromSeed(new Uint8Array(64).fill(9))
const prev = txidToWire('11'.repeat(32))
const mkTx = () => new Tx(1,
  [{ txid: prev, vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
  [{ value: 900, script: other.lockingScript() }], 0)
const utxo = { txid: prev, vout: 0, value: 1000, script: me.lockingScript() }

const t = mkTx(); me.signP2PKH(t, [utxo])
const chunks = Script.fromBinary(t.inputs[0].script).chunks
ok(chunks.length === 2, `the unlocking script is exactly two pushes (got ${chunks.length})`)
ok(chunks[1] && equals(chunks[1].data, me.publicKey()), 'the second push is the public key')
ok(Signer.verifyInput(t, 0, utxo.script, utxo.value, me.publicKey(), chunks[0].data), 'our own signature verifies')
ok(chunks[0].data.slice(-1)[0] === SIGHASH.ALL_FORKID, 'the sighash type byte is appended to the DER')
// ⚠ the direct-push form, since both are under 76 bytes — a PUSHDATA1 here is valid and a different script
ok(t.inputs[0].script[0] === chunks[0].data.length, 'the signature uses a DIRECT push, not PUSHDATA1')
ok(t.inputs[0].script.length === 1 + chunks[0].data.length + 1 + 33,
   `★ 107 bytes for a compressed key, which is what coins.P2PKH_INPUT budgets`)

// ── ★ low-s: normalised by default, because a broadcaster may refuse otherwise ───────────────────────
const sOf = sig => decodeDer(sig, true)[1]   // ⚠ decodeDer returns [r, s], not { r, s }
// ⚠⚠⚠ ONE SIGNATURE CANNOT TEST THIS, and mutation testing caught me doing exactly that. RFC 6979 is
//   deterministic, so for a given key and digest the signature is EITHER naturally low-s or not. Mine
//   happened to be low, so turning normalisation off changed nothing and the mutation survived.
//   ⇒ Sweep until a digest is found whose RAW signature is high-s, then require the default to
//     normalise that same one. The sweep is the test; a single sample was a coin flip.
let rawHigh = 0, normalised = 0, probes = 0
for (let v = 1; v <= 40; v++) {
  const tx = new Tx(1, [{ txid: prev, vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                       [{ value: v, script: other.lockingScript() }], 0)
  probes++
  const raw = me.signInput(tx, 0, utxo.script, utxo.value, SIGHASH.ALL_FORKID, { lowS: false })
  const def = me.signInput(tx, 0, utxo.script, utxo.value)
  if (sOf(raw) > N / 2n) { rawHigh++; if (sOf(def) <= N / 2n) normalised++ }
}
ok(rawHigh > 0, `⚠ the sweep found ${rawHigh} naturally HIGH-s cases in ${probes} — without one, this proves nothing`)
ok(rawHigh > 0 && normalised === rawHigh,
   `★★ every one of those ${rawHigh} is normalised low by default (ARC refuses high-s, error 461)`)
const hi = me.signInput(mkTx(), 0, utxo.script, utxo.value, SIGHASH.ALL_FORKID, { lowS: false })
ok(Signer.verifyInput(mkTx(), 0, utxo.script, utxo.value, me.publicKey(), hi),
   '⚠ …but a high-s signature is still VALID and must verify — low-s is policy, never a consensus rule')

// ── ★ BIP-143: signing order cannot matter ──────────────────────────────────────────────────────────
// ⚠ A preimage commits to the other inputs only through hashPrevouts and hashSequence, never through
//   their unlocking scripts. Under the LEGACY algorithm it could, which is one of the things BIP-143
//   fixed. Proved here rather than trusted.
const two = [utxo, { txid: txidToWire('22'.repeat(32)), vout: 1, value: 2000, script: me.lockingScript() }]
const mk2 = () => new Tx(1, two.map(u => ({ txid: u.txid, vout: u.vout, script: new Uint8Array(0), sequence: 0xffffffff })),
                            [{ value: 2500, script: other.lockingScript() }], 0)
const fwd = mk2(); me.signP2PKH(fwd, two)
const rev = mk2()
// sign input 1 first, then input 0 — the same operation in the opposite order
rev.inputs[1].script = me.unlockP2PKH(rev, 1, two[1].script, two[1].value)
rev.inputs[0].script = me.unlockP2PKH(rev, 0, two[0].script, two[0].value)
ok(toHex(fwd.serialize()) === toHex(rev.serialize()),
   '★★ signing the inputs in the opposite order gives a byte-identical transaction')
// ⚠⚠ AND EACH INPUT MUST VERIFY AT ITS OWN INDEX. Mutation testing found that hard-coding index 0 in
//   the digest survived everything above: both transactions were built the same wrong way, so they
//   still matched each other. Comparing two things produced by the same bug proves nothing.
let perInput = 0
fwd.inputs.forEach((inp, i) => {
  const sigChunk = Script.fromBinary(inp.script).chunks[0]
  if (Signer.verifyInput(fwd, i, two[i].script, two[i].value, me.publicKey(), sigChunk.data)) perInput++
})
ok(perInput === 2, `★★ each input verifies AT ITS OWN INDEX (${perInput}/2)`)
// ⛔ and input 1's signature must NOT verify as input 0 — otherwise the index is not committed at all
const sig1 = Script.fromBinary(fwd.inputs[1].script).chunks[0].data
ok(!Signer.verifyInput(fwd, 0, two[0].script, two[0].value, me.publicKey(), sig1),
   "⛔ input 1's signature is REFUSED at index 0 — the input index is genuinely committed")

// ── ⛔ THE ALIGNMENT GUARD ───────────────────────────────────────────────────────────────────────────
// ⚠⚠⚠ Out-of-order UTXOs sign each input against another output's script and amount ⇒ every signature
//   is well formed and every one is invalid, with nothing in the transaction to say so.
ok(threw(() => me.signP2PKH(mk2(), [two[1], two[0]]), 'outpoints differ'),
   '⛔ UTXOs in the WRONG ORDER are refused, not signed')
// ⚠⚠ MUTATION TESTING FOUND THIS TOO: the swap above differs in txid AND vout, so comparing the vout
//   alone still caught it and dropping the txid comparison survived. ⇒ This pair differs ONLY by txid.
const sameVout = [{ txid: txidToWire('33'.repeat(32)), vout: 0, value: 1000, script: me.lockingScript() },
                  { txid: txidToWire('44'.repeat(32)), vout: 0, value: 2000, script: me.lockingScript() }]
const mkSame = () => new Tx(1, sameVout.map(u => ({ txid: u.txid, vout: u.vout, script: new Uint8Array(0), sequence: 0xffffffff })),
                               [{ value: 2500, script: other.lockingScript() }], 0)
ok(threw(() => me.signP2PKH(mkSame(), [sameVout[1], sameVout[0]]), 'outpoints differ'),
   '⛔★ UTXOs differing ONLY by txid are refused — the txid is genuinely compared, not just the vout')
ok(threw(() => me.signP2PKH(mk2(), [utxo]), 'for 2 inputs'), '⛔ too few UTXOs is refused')
ok(threw(() => me.signP2PKH(mkTx(), [{ ...utxo, vout: 9 }]), 'outpoints differ'), '⛔ a wrong vout is refused')

// ── ⛔ a display txid is refused rather than silently zeroed ─────────────────────────────────────────
// ⚠⚠ MEASURED: a hex-string txid passed through coins.build() yields a transaction with a ZEROED txid
//   that serializes without error and reports a confident, wrong txid. This is the last cheap catch.
ok(threw(() => me.signP2PKH(mkTx(), [{ ...utxo, txid: '11'.repeat(32) }]), 'WIRE order'),
   '⛔ a txid given as display hex is REFUSED, with the conversion named in the message')
ok(wireToTxid(txidToWire('ab'.repeat(32))) === 'ab'.repeat(32), 'txidToWire and wireToTxid are inverses')
ok(toHex(txidToWire('00'.repeat(31) + 'ff')) === 'ff' + '00'.repeat(31), '⚠ …and they genuinely reverse')

// ── keys ────────────────────────────────────────────────────────────────────────────────────────────
ok(Signer.fromWif(me.toWif()).address() === me.address(), 'a WIF round-trips to the same address')
ok(Signer.fromSeed(new Uint8Array(64).fill(7)).address() === me.address(), '★ the same seed gives the same key')
ok(Signer.fromSeed(new Uint8Array(64).fill(8)).address() !== me.address(), '…and a different seed does not')
ok(DEFAULT_PATH === "m/44'/236'/0'/0/0", '★ the derivation path matches the sibling wallet, so one phrase restores both')
// ⚠ compressed travels WITH the key: the same scalar spends a different address either way
const un = Signer.fromPrivateKey(fromHex('01'.repeat(32)), false)
ok(un.publicKey().length === 65 && un.address() !== Signer.fromPrivateKey(fromHex('01'.repeat(32))).address(),
   '⚠ an uncompressed key gives a DIFFERENT address for the same scalar')
ok(threw(() => Signer.fromPrivateKey(new Uint8Array(31)), '32 bytes'), '⛔ a short private key is refused')
// ⚠ the constructor is public, so ITS default matters too — every named path passes `compressed`
//   explicitly, which is why a flipped default here survived the suite until now.
ok(new Signer(123456789n).compressed === true, '⚠ the constructor defaults to COMPRESSED')
ok(new Signer(123456789n).publicKey().length === 33, '…and that default really yields a 33-byte key')
ok(threw(() => me.signInput(mkTx(), 0, utxo.script, -1), 'whole number'), '⛔ a negative amount is refused')
ok(threw(() => me.signInput(mkTx(), 0, utxo.script, 1.5), 'whole number'), '⛔ a fractional amount is refused')

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [signer · real mainnet spends]`)
process.exit(fail === 0 ? 0 : 1)
