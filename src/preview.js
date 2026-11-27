// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { addressFromPubHex } from './bytes.js'
import { buildPreviewScript, parsePreviewScript } from './tokenCodec.js'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, addFunding, signFunding, UNLOCK_P2PKH,
} from './collectionBuilder.js'

export const MAX_PREVIEW_BYTES = 1_048_576
const MAX_HISTORY_SCAN = 30

export async function publishPreview(
  provider, key, collectionId, clip,
) {
  if (clip.bytes.length === 0) throw new Error('preview clip is empty')
  if (clip.bytes.length > MAX_PREVIEW_BYTES) throw new Error(`preview exceeds ${MAX_PREVIEW_BYTES} bytes`)
  const mimeType = clip.mimeType || 'audio/mpeg'
  const publisherPub = toHex(key.publicKey())

  const estBytes = 300 + clip.bytes.length
  const estFee = Math.ceil((estBytes * DEFAULT_FEE_PER_KB) / 1000)
  const target = PHARLAP_OUTPUT_SATS + estFee + Math.max(1000, Math.ceil(estFee * 0.1))
  const selected = selectFunding(await getSafeUtxos(provider), target)
  const funding = selected.map(u => ({ utxo: u }))
  const tx = new Tx(1, [], [], 0)
  addFunding(tx, funding)
  tx.outputs.push({
    value: PHARLAP_OUTPUT_SATS,
    script: buildPreviewScript(publisherPub, { collectionRef: collectionId, mimeType, previewBytes: clip.bytes }).toBinary(),
  })
  tx.outputs.push({ value: 0, script: key.lockingScript() })
  applyFee(tx, {
    inputValues: funding.map(f => f.utxo.satoshis),
    unlockingSizes: funding.map(() => UNLOCK_P2PKH),
    changeVout: 1,
    satPerKb: DEFAULT_FEE_PER_KB,
  })
  signFunding(tx, key, funding)
  await provider.broadcast(tx.hex())
  const txId = tx.txid()
  provider.registerPendingTx(txId, selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    (tx.outputs[1]?.value ?? 0) > 0 ? { outputIndex: 1, satoshis: tx.outputs[1].value ?? 0 } : undefined)
  return txId
}

export async function resolvePreview(
  provider, publisherPubKeyHex, collectionId,
) {
  const address = addressFromPubHex(publisherPubKeyHex)

  const heightByTx = new Map()
  try {
    for (const h of await provider.getAddressHistory(address)) heightByTx.set(h.txId, h.blockHeight || 0)
  } catch { }
  try {
    for (const txId of await provider.getRecentTxIdsForAddress(address)) {
      if (!heightByTx.has(txId)) heightByTx.set(txId, 0)
    }
  } catch { }
  if (heightByTx.size === 0) return null

  const ordered = [...heightByTx.entries()]
    .sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12))
    .slice(0, MAX_HISTORY_SCAN)
    .map(([txId]) => txId)

  const pub = publisherPubKeyHex.toLowerCase()
  const want = collectionId.toLowerCase()
  for (const txId of ordered) {
    let tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    for (const o of tx.outputs) {
      const p = parsePreviewScript(LockingScript.fromBinary(o.script))
      if (p && p.publisherPubKeyHex.toLowerCase() === pub && p.fields.collectionRef.toLowerCase() === want) {
        return { mimeType: p.fields.mimeType, bytes: p.fields.previewBytes, txId }
      }
    }
  }
  return null
}
