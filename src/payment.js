// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, addFunding, signFunding, UNLOCK_P2PKH } from './collectionBuilder.js'

export function assertValidAddress(addr) {
  try { scriptForAddress(addr) } catch { throw new Error('Invalid BSV address') }
}

export async function buildPaymentTx(opts) {
  assertValidAddress(opts.toAddress)
  if (opts.funding.length === 0) throw new Error('No spendable funds')
  if (!opts.sendMax && (!Number.isFinite(opts.amountSats) || opts.amountSats < 1)) {
    throw new Error('Enter an amount of at least 1 sat')
  }
  const toScript = scriptForAddress(opts.toAddress)
  const tx = new Tx(1, [], [], 0)
  addFunding(tx, opts.funding)

  let changeVout = null
  let absorbVout
  if (opts.sendMax) {
    absorbVout = 0
    tx.outputs.push({ value: 0, script: toScript })
  } else {
    tx.outputs.push({ value: opts.amountSats, script: toScript })
    changeVout = tx.outputs.length
    absorbVout = changeVout
    tx.outputs.push({ value: 0, script: opts.key.lockingScript() })
  }

  applyFee(tx, {
    inputValues: opts.funding.map(f => f.utxo.satoshis),
    unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
    changeVout: absorbVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  signFunding(tx, opts.key, opts.funding)

  const sentSats = opts.sendMax ? (tx.outputs[0]?.value ?? 0) : opts.amountSats
  if (sentSats < 1) throw new Error('Funds too small to cover the network fee')
  const changeSats = changeVout != null ? (tx.outputs[changeVout]?.value ?? 0) : 0
  return { tx, txId: tx.txid(), sentSats, changeVout: changeSats > 0 ? changeVout : null, changeSats }
}

export async function gatherPaymentFunding(
  provider,
  opts,
) {
  const safe = await getSafeUtxos(provider)
  const feeHeadroom = Math.ceil((400 * (opts.feePerKb ?? DEFAULT_FEE_PER_KB)) / 1000) + 200
  const selected = opts.sendMax ? safe : selectFunding(safe, opts.amountSats + feeHeadroom)
  return selected.map(u => ({ utxo: u }))
}

export async function sendPayment(
  provider,
  key,
  opts,
) {
  const funding = await gatherPaymentFunding(provider, opts)
  const result = await buildPaymentTx({ key, funding, ...opts })
  await provider.broadcast(result.tx.hex())
  provider.registerPendingTx(
    result.txId,
    funding.map(f => ({ txId: f.utxo.txId, outputIndex: f.utxo.outputIndex })),
    result.changeVout != null ? { outputIndex: result.changeVout, satoshis: result.changeSats } : undefined,
  )
  return result
}
