// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * UTXO selection.
 *
 * ⚖ THE POLICY BELOW WAS READ FROM A DESKTOP WALLET'S COIN SELECTOR; NOTHING WAS IMPORTED. What crossed
 * is **facts about behaviour** — that the fee is circular, that change below a floor is better given to
 * the miner, that a script's coins should be spent together — none of which is anyone's expression.
 *
 * ⛔⛔⛔ AND THE NUMBER THAT WAS REFUSED. Desktop wallets hard-code `dust_threshold = 546`. **Every covenant
 * in this project uses 1-satoshi outputs** — the breadcrumbs, the notify output, the racer payees. A
 * selector imposing 546 would refuse or mangle every transaction this repo builds.
 * ★ Read closely, such a selector never second-guesses the CALLER's outputs either: 546 only decides whether
 * CHANGE is worth creating. ⇒ That separation is preserved exactly. `BTC_LEGACY_DUST` names its provenance;
 * `MIN_OUTPUT = 1` is the floor; and the floor applies to CHANGE ONLY.
 *
 * ⚠⚠ THE SILENT FAILURE: **fee estimated from the UNSIGNED size.** An unsigned input carries an empty
 * script; the signed one carries ~107 bytes. ⇒ The transaction is well-formed, under-paid, and simply
 * never confirms, with nothing in it to say why.
 */
import { varint, Tx } from './transaction.mjs'
import { toHex } from './bytes.mjs'

/**
 * ⛔⛔⛔ BTC's NUMBER, AND IT DOES NOT APPLY TO BSV. Named for its PROVENANCE, not any authority here.
 * ★ Bitcoin Core's dust threshold, correct where it comes from. **BSV REMOVED THE DUST LIMIT AT GENESIS.**
 * ✅ MEASURED against this project's own mainnet history: nine 1-satoshi outputs across three CONFIRMED
 * transactions (2,927–5,932 confirmations). ⇒ **The real floor is 1.** Kept only so a reader recognises
 * the number and does not re-import it as a rule.
 */
export const BTC_LEGACY_DUST = 546
export const MIN_OUTPUT = 1          // ★★ THE ACTUAL FLOOR — 1 satoshi, and never 0
export const SAT_PER_KB = 100
/**
 * 32 txid + 4 vout + 1 varint + 107 scriptSig + 4 sequence.
 *
 * ⚠⚠ DO NOT DERIVE AN UNLOCKING-SCRIPT SIZE FROM THIS, and do not "correct" one against the other. The
 *   107 here assumes a LOW-S signature, where `s` never needs a DER padding byte, so it is the true
 *   maximum for a signature this wallet produces. The application's `UNLOCK_P2PKH` is 108 instead,
 *   because that is what the deployed wallet estimates and matching it keeps every fee identical.
 *   ⇒ They disagree by one byte ON PURPOSE. I once wrote `P2PKH_INPUT - 41` to get the other, and a
 *     three-input payment then came out one satoshi cheaper than the deployed one - invisible at one or
 *     two inputs, because 107x2 and 108x2 round to the same fee.
 */
export const P2PKH_INPUT = 148
export const P2PKH_OUTPUT = 34

/** ⚠ `unlockingSize` is the caller's business for anything not P2PKH — a covenant's can be hundreds
 *  of bytes, and guessing P2PKH for one under-pays the fee silently. */
export function inputSize(u) {
  if (u.unlockingSize === undefined) return P2PKH_INPUT
  const n = u.unlockingSize
  if (n < 0) throw new Error('an unlocking script cannot have negative size')
  return 32 + 4 + varint(n).length + n + 4
}
export const outputSize = script => 8 + varint(script.length).length + script.length
/** ⚠ Rounded UP. A fee below the floor is a transaction that never confirms. */
export const fee = (size, satPerKb = SAT_PER_KB) => Math.ceil(size * satPerKb / 1000)

export function select(utxos, outputs, changeScript = null, satPerKb = SAT_PER_KB, dustThreshold = MIN_OUTPUT) {
  let target = 0
  for (const o of outputs) {
    if (o.value < 0) throw new Error('an output value cannot be negative')
    if (o.value === 0) throw new Error('a 0-value output is refused as dust before the script is evaluated at all — use 1 satoshi')
    target += o.value
  }
  let base = 8 + varint(outputs.length).length
  for (const o of outputs) base += outputSize(o.script)

  // ★ THE PRIVACY RULE, read rather than invented: a script's coins are spent TOGETHER. Partially spending
  //   one publishes that the remainder is yours, so splitting buys nothing.
  const buckets = new Map()
  for (const u of utxos) {
    if (!(u.value > 0)) throw new Error('a UTXO must carry a positive value')
    // ⚠ a map KEY, not display. `Uint8Array.toString('hex')` returns comma-separated decimals
    //   and would still have grouped correctly — wrong, and invisible to every test.
    const k = toHex(u.script)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(u)
  }
  const sum = a => a.reduce((t, x) => t + x.value, 0)
  // ⚖ largest first: fewer inputs ⇒ smaller tx ⇒ smaller fee. A CHOICE, pinned by a test.
  const ordered = [...buckets.values()].sort((a, b) => sum(b) - sum(a))

  const chosen = []; let have = 0, size = base + 1
  for (const bucket of ordered) {
    for (const u of bucket) { chosen.push(u); have += u.value }
    // ⚠⚠ THE CIRCULARITY, resolved by re-asking after every bucket: the fee we must cover depends on
    //   the size we have only just changed.
    size = base + varint(chosen.length).length + chosen.reduce((t, c) => t + inputSize(c), 0)
    if (have >= target + fee(size, satPerKb)) break
  }

  let f = fee(size, satPerKb)
  if (have < target + f)
    throw new Error(`insufficient funds: ${have} satoshis available, ${target + f} needed (${target} to spend + ${f} fee at ${satPerKb} sat/KB)`)

  let change = null
  if (changeScript) {
    const withChange = size + outputSize(changeScript)
      + varint(outputs.length + 1).length - varint(outputs.length).length
    const feeWith = fee(withChange, satPerKb)
    const left = have - target - feeWith
    if (left >= dustThreshold && left >= MIN_OUTPUT) { change = left; f = feeWith; size = withChange }
    // ⛔ else it becomes fee: an output nobody will ever profitably spend is worse than paying the miner
    else f = have - target
  } else f = have - target

  return { inputs: chosen, change, fee: f, size, selected: have, target }
}

/** ⚠ Change is appended LAST, and inputs are UNSIGNED — signing is a separate, later step. */
export function build(sel, outputs, changeScript = null, locktime = 0) {
  const tx = new Tx(1, [], [], locktime)
  for (const u of sel.inputs) tx.inputs.push({ txid: u.txid, vout: u.vout, script: new Uint8Array(0), sequence: 0xffffffff })
  for (const o of outputs) tx.outputs.push({ value: o.value, script: o.script })
  if (sel.change !== null) tx.outputs.push({ value: sel.change, script: changeScript })
  return tx
}

/**
 * Settle the change on a transaction whose inputs are ALREADY chosen.
 *
 * ★★ THE COMPANION TO `select`, NOT A DUPLICATE OF IT. `select` decides WHICH coins to spend; this takes
 *   coins someone else picked and works out what is left after the fee. The application picks its own
 *   funding (largest-first, with its own quarantine rules), so it needs this half and not the other.
 *
 * ⚠⚠ THE INPUTS ARE UNSIGNED WHEN THIS RUNS, so the size has to be ESTIMATED - a signature that does not
 *   exist yet still has to be paid for. `unlockingSizes` says how big each one will be: 107 for P2PKH
 *   (1 + 72 sig + 1 + 33 key), 73 for a bare signature. ⛔ Guessing P2PKH for something else under-pays
 *   the fee silently, and the transaction simply never confirms.
 *
 * ⚠ The change output is KEPT even when small, and is not dropped as dust. That matches the deployed
 *   behaviour exactly - measured - and this chain has no dust floor to drop it for. A caller that wants
 *   to fold a tiny change into the fee can look at the returned value and decide.
 *
 * @param tx            mutated in place: `tx.outputs[changeVout].value` is set
 * @param inputValues   the satoshis of each input, in input order
 * @param changeVout    which output is the change
 * @returns `{ fee, change, size }`
 */
export function applyFee(tx, { inputValues, unlockingSizes = [], changeVout, satPerKb = SAT_PER_KB }) {
  if (inputValues.length !== tx.inputs.length)
    throw new Error(`${inputValues.length} input values for ${tx.inputs.length} inputs`)
  if (tx.outputs[changeVout] === undefined) throw new Error(`no output at changeVout ${changeVout}`)

  let size = 8 + varint(tx.inputs.length).length + varint(tx.outputs.length).length
  tx.inputs.forEach((_, i) => { size += inputSize({ unlockingSize: unlockingSizes[i] ?? P2PKH_INPUT - 41 }) })
  for (const o of tx.outputs) size += outputSize(o.script)

  const f = fee(size, satPerKb)
  let totalIn = 0
  for (const v of inputValues) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`an input value must be a whole number, got ${v}`)
    totalIn += v
  }
  let spent = 0
  tx.outputs.forEach((o, i) => { if (i !== changeVout) spent += o.value })

  const change = totalIn - spent - f
  if (change < 0)
    throw new Error(`insufficient funds: ${totalIn} in, ${spent} out, ${f} fee - short by ${-change} satoshis`)
  tx.outputs[changeVout].value = change
  return { fee: f, change, size }
}
