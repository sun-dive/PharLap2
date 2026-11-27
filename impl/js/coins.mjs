// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { varint, Tx } from './transaction.mjs'
import { toHex } from './bytes.mjs'

export const BTC_LEGACY_DUST = 546
export const MIN_OUTPUT = 1
export const SAT_PER_KB = 100
export const P2PKH_INPUT = 148
export const P2PKH_OUTPUT = 34

export function inputSize(u) {
  if (u.unlockingSize === undefined) return P2PKH_INPUT
  const n = u.unlockingSize
  if (n < 0) throw new Error('an unlocking script cannot have negative size')
  return 32 + 4 + varint(n).length + n + 4
}
export const outputSize = script => 8 + varint(script.length).length + script.length
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

  const buckets = new Map()
  for (const u of utxos) {
    if (!(u.value > 0)) throw new Error('a UTXO must carry a positive value')
    const k = toHex(u.script)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(u)
  }
  const sum = a => a.reduce((t, x) => t + x.value, 0)
  const ordered = [...buckets.values()].sort((a, b) => sum(b) - sum(a))

  const chosen = []; let have = 0, size = base + 1
  for (const bucket of ordered) {
    for (const u of bucket) { chosen.push(u); have += u.value }
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
    else f = have - target
  } else f = have - target

  return { inputs: chosen, change, fee: f, size, selected: have, target }
}

export function build(sel, outputs, changeScript = null, locktime = 0) {
  const tx = new Tx(1, [], [], locktime)
  for (const u of sel.inputs) tx.inputs.push({ txid: u.txid, vout: u.vout, script: new Uint8Array(0), sequence: 0xffffffff })
  for (const o of outputs) tx.outputs.push({ value: o.value, script: o.script })
  if (sel.change !== null) tx.outputs.push({ value: sel.change, script: changeScript })
  return tx
}

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
