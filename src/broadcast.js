// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { addressFromPubHex } from './bytes.js'
import { addFunding, signFunding, UNLOCK_P2PKH } from './collectionBuilder.js'
import { buildMessageScript, parseMessageScript } from './tokenCodec.js'
import { buildEnvelope, openPublicEnvelope } from './messageCodec.js'
import { PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding } from './collectionBuilder.js'

export const MAX_BROADCAST_BYTES = 480
const MAX_BROADCAST_SCAN = 50

export async function publishBroadcast(
  provider, key, collectionId, text, senderAlias,
) {
  const trimmed = text.trim()
  if (trimmed.length === 0) throw new Error('announcement is empty')
  if (new TextEncoder().encode(trimmed).length > MAX_BROADCAST_BYTES) {
    throw new Error(`announcement exceeds ${MAX_BROADCAST_BYTES} bytes`)
  }
  const pubHex = toHex(key.publicKey())
  const envelope = await buildEnvelope({
    senderPriv: key, recipientPubKeyHex: pubHex, parts: [{ kind: 'text', text: trimmed }], encrypt: false,
    senderAlias, sentAt: Date.now(),
  })

  const selected = selectFunding(await getSafeUtxos(provider), PHARLAP_OUTPUT_SATS + 600)
  const funding = await Promise.all(
    selected.map(u => ({ utxo: u })),
  )
  const tx = new Tx(1, [], [], 0)
  addFunding(tx, funding)
  tx.outputs.push({
    value: PHARLAP_OUTPUT_SATS,
    script: buildMessageScript(pubHex, { ref: collectionId, envelope }).toBinary(),
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

export async function resolveBroadcasts(
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
  if (heightByTx.size === 0) return []

  const ordered = [...heightByTx.entries()]
    .sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12))
    .slice(0, MAX_BROADCAST_SCAN)

  const publisher = publisherPubKeyHex.toLowerCase()
  const want = collectionId.toLowerCase()
  const out = []
  for (const [txId, height] of ordered) {
    let tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    for (const o of tx.outputs) {
      const m = parseMessageScript(LockingScript.fromBinary(o.script))
      if (m == null) continue
      if (m.recipientPubKeyHex.toLowerCase() !== publisher) continue
      if (m.fields.ref.toLowerCase() !== want) continue
      const opened = await openPublicEnvelope(m.fields.envelope)
      if (opened == null || opened.senderPubKeyHex.toLowerCase() !== publisher) continue
      const textPart = opened.parts.find(p => p.kind === 'text')
      if (textPart && textPart.kind === 'text') out.push({ text: textPart.text, txId, height, senderAlias: opened.senderAlias })
    }
  }
  return out
}
