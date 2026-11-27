// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { txidToWire } from '../impl/js/signer.mjs'
import { addressFromPubHex } from './bytes.js'
import { unlockScript as pushDropUnlock, UNLOCK_SIZE as PUSHDROP_UNLOCK } from './pushDrop.js'
import { buildTokenScript, parseTokenScript } from './tokenCodec.js'
import {
  PHARLAP_OUTPUT_SATS,
  DEFAULT_FEE_PER_KB,
  getSafeUtxos,
  selectFunding,
  addFunding,
  signFunding,
  UNLOCK_P2PKH,
} from './collectionBuilder.js'

export async function buildTransferTx(opts) {
  const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS
  const notify = opts.notify ?? true

  const tokenOut = opts.tokenSourceTx.outputs[opts.tokenOutputIndex]
  const parsed = tokenOut ? parseTokenScript(LockingScript.fromBinary(tokenOut.script)) : null
  if (!parsed || !tokenOut) throw new Error('buildTransferTx: source output is not a PHAR LAP token')
  const tokenFields = {
    tx1Ref: parsed.fields.tx1Ref,
    stateData: opts.newStateData ?? parsed.fields.stateData,
  }

  const tx = new Tx(1, [], [], 0)
  tx.inputs.push({
    txid: txidToWire(opts.tokenSourceTx.txid()), vout: opts.tokenOutputIndex,
    script: new Uint8Array(0), sequence: 0xffffffff,
  })
  addFunding(tx, opts.funding)

  tx.outputs.push({ value: sats, script: buildTokenScript(opts.recipientPubKeyHex, tokenFields).toBinary() })
  const recipientVout = 0

  let notifyVout = null
  if (notify) {
    const recipientAddress = addressFromPubHex(opts.recipientPubKeyHex)
    notifyVout = tx.outputs.length
    tx.outputs.push({ value: 1, script: scriptForAddress(recipientAddress) })
  }

  let publisherNotifyVout = null
  if (opts.notifyPublisher) {
    if (opts.publisherPubKeyHex == null) {
      throw new Error('buildTransferTx: notifyPublisher requires publisherPubKeyHex')
    }
    const publisherAddress = addressFromPubHex(opts.publisherPubKeyHex)
    publisherNotifyVout = tx.outputs.length
    tx.outputs.push({ value: 1, script: scriptForAddress(publisherAddress) })
  }

  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: opts.key.lockingScript() })

  applyFee(tx, {
    inputValues: [tokenOut.value, ...opts.funding.map(f => f.utxo.satoshis)],
    unlockingSizes: [PUSHDROP_UNLOCK, ...opts.funding.map(() => UNLOCK_P2PKH)],
    changeVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  tx.inputs[0].script = pushDropUnlock(opts.key.d, tx, 0, tokenOut.script, tokenOut.value).toBinary()
  signFunding(tx, opts.key, opts.funding, 1)

  const changeSats = tx.outputs[changeVout]?.value ?? 0
  return {
    tx,
    txId: tx.txid(),
    recipientVout,
    notifyVout,
    publisherNotifyVout,
    changeVout: changeSats > 0 ? changeVout : null,
    changeSats,
    tokenFields,
  }
}

export async function createTransfer(
  provider,
  key,
  opts,
) {
  const tokenSourceTx = await provider.getSourceTransaction(opts.tokenTxId)
  const feeHeadroom = Math.ceil((500 * (opts.feePerKb ?? DEFAULT_FEE_PER_KB)) / 1000) + 200
  const selected = selectFunding(await getSafeUtxos(provider), feeHeadroom)
  const funding = selected.map(u => ({ utxo: u }))

  const result = await buildTransferTx({
    key,
    tokenOutputIndex: opts.tokenOutputIndex,
    tokenSourceTx,
    recipientPubKeyHex: opts.recipientPubKeyHex,
    funding,
    newStateData: opts.newStateData,
    notify: opts.notify,
    notifyPublisher: opts.notifyPublisher,
    publisherPubKeyHex: opts.publisherPubKeyHex,
    outputSats: opts.outputSats,
    feePerKb: opts.feePerKb,
  })

  await provider.broadcast(result.tx.hex())
  provider.registerPendingTx(
    result.txId,
    [
      { txId: opts.tokenTxId, outputIndex: opts.tokenOutputIndex },
      ...selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    ],
    result.changeVout != null ? { outputIndex: result.changeVout, satoshis: result.changeSats } : undefined,
  )
  return result
}

export function findOwnedTokenOutputs(
  tx,
  ownerPubKeyHex,
) {
  const found = []
  tx.outputs.forEach((o, i) => {
    const parsed = parseTokenScript(LockingScript.fromBinary(o.script))
    if (parsed != null && parsed.ownerPubKeyHex === ownerPubKeyHex) {
      found.push({ outputIndex: i, fields: parsed.fields })
    }
  })
  return found
}

export async function scanIncoming(
  provider,
  myPubKeyHex,
  extraTxIds = [],
  opts = {},
) {
  const since = opts.sinceHeight ?? -1
  const readBefore = (h) => since >= 0 && h != null && h > 0 && h <= since
  const candidateTxIds = new Set(extraTxIds)
  const heightOf = new Map()
  try {
    for (const { txId, blockHeight } of await provider.getFullAddressHistory()) {
      if (blockHeight > 0) heightOf.set(txId, blockHeight)
      if (!readBefore(blockHeight)) candidateTxIds.add(txId)
    }
  } catch { }
  try {
    for (const u of await provider.getUtxos()) if (!readBefore(u.height)) candidateTxIds.add(u.txId)
  } catch { }

  const found = []
  for (const txId of candidateTxIds) {
    let tx
    try {
      tx = await provider.getSourceTransaction(txId)
    } catch {
      continue
    }
    for (const { outputIndex, fields } of findOwnedTokenOutputs(tx, myPubKeyHex)) {
      found.push({ txId, outputIndex, fields, height: heightOf.get(txId) })
    }
  }
  return found
}
