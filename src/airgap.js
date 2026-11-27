// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { hexBytes, hexOf } from './bytes.js'
import { buildEditionTransferTx, buildEditionBurnTx } from './editionBuilder.js'
import { buildPaymentTx } from './payment.js'
import { editionOwnerPubKey } from './covenant.js'

export const AIRGAP_VERSION = 1

export function buildAirgapRequest(
  action,
  edition,
  opts = {},
) {
  return {
    v: AIRGAP_VERSION,
    action,
    edition: {
      txId: edition.txId, outputIndex: edition.outputIndex, satoshis: edition.satoshis,
      lockHex: hexOf(edition.lockBytes), sourceTxHex: edition.sourceTx.hex(),
    },
    newOwnerPubKeyHex: opts.newOwnerPubKeyHex,
    note: opts.note,
    funding: opts.funding?.map(f => ({
      txId: f.utxo.txId, outputIndex: f.utxo.outputIndex, satoshis: f.utxo.satoshis, sourceTxHex: f.sourceTx.hex(),
    })),
    feePerKb: opts.feePerKb,
    summary: opts.summary,
  }
}

export function buildAirgapPaymentRequest(
  opts,
) {
  return {
    v: AIRGAP_VERSION,
    action: 'payment',
    payment: { toAddress: opts.toAddress, amountSats: opts.amountSats, sendMax: opts.sendMax },
    funding: opts.funding.map(f => ({
      txId: f.utxo.txId, outputIndex: f.utxo.outputIndex, satoshis: f.utxo.satoshis, sourceTxHex: f.sourceTx.hex(),
    })),
    feePerKb: opts.feePerKb,
    summary: opts.summary,
  }
}

function fundingFromRequest(req) {
  return (req.funding ?? []).map(f => ({
    utxo: { txId: f.txId, outputIndex: f.outputIndex, satoshis: f.satoshis, script: '' },
    sourceTx: Tx.parse(f.sourceTxHex),
  }))
}

export async function signAirgapRequest(req, key) {
  if (req.v !== AIRGAP_VERSION) throw new Error(`unsupported air-gap request version ${req.v}`)

  if (req.action === 'payment') {
    if (req.payment == null) throw new Error('payment request is missing payment details')
    const funding = fundingFromRequest(req)
    const mine = toHex(key.lockingScript())
    for (const f of funding) {
      const out = f.sourceTx.outputs[f.utxo.outputIndex]
      if (out == null || toHex(out.script) !== mine) {
        throw new Error('this wallet does not own one of the funding inputs — cannot sign')
      }
    }
    const r = await buildPaymentTx({
      key, toAddress: req.payment.toAddress, amountSats: req.payment.amountSats, sendMax: req.payment.sendMax,
      funding, feePerKb: req.feePerKb,
    })
    return { txId: r.txId, rawTx: r.tx.hex() }
  }

  if (req.edition == null) throw new Error('request is missing the edition to spend')
  const edition = {
    txId: req.edition.txId, outputIndex: req.edition.outputIndex, satoshis: req.edition.satoshis,
    lockBytes: hexBytes(req.edition.lockHex),
  }
  const owner = hexOf(editionOwnerPubKey(edition.lockBytes)).toLowerCase()
  if (owner !== toHex(key.publicKey()).toLowerCase()) {
    throw new Error('this wallet does not own that edition — cannot sign')
  }
  if (req.action === 'burn') {
    const r = await buildEditionBurnTx({ edition, ownerKey: key, feePerKb: req.feePerKb })
    return { txId: r.txId, rawTx: r.tx.hex() }
  }
  if (req.action === 'transfer') {
    if (req.newOwnerPubKeyHex == null || req.newOwnerPubKeyHex.length === 0) throw new Error('transfer request is missing the recipient pubkey')
    const funding = fundingFromRequest(req)
    const r = await buildEditionTransferTx({
      edition, ownerKey: key, newOwnerPubKey: hexBytes(req.newOwnerPubKeyHex), funding, note: req.note, feePerKb: req.feePerKb,
    })
    return { txId: r.txId, rawTx: r.tx.hex() }
  }
  throw new Error(`unknown air-gap action: ${String(req.action)}`)
}

export function encodeAirgapRequest(req) { return JSON.stringify(req, null, 2) }

export function decodeAirgapRequest(json) {
  const req = JSON.parse(json)
  if (req == null || typeof req !== 'object') throw new Error('not an air-gap request')
  if (req.v !== AIRGAP_VERSION) throw new Error(`unsupported air-gap request version ${req.v}`)
  if (req.action !== 'transfer' && req.action !== 'burn' && req.action !== 'payment') throw new Error('unknown air-gap action')
  if (req.action === 'payment') {
    if (req.payment?.toAddress == null) throw new Error('malformed air-gap request (missing payment details)')
    if ((req.funding ?? []).length === 0) throw new Error('malformed air-gap request (payment has no funding inputs)')
  } else if (req.edition?.sourceTxHex == null || req.edition.lockHex == null) {
    throw new Error('malformed air-gap request (missing edition data)')
  }
  return req
}
