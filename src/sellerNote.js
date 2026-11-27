// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { addressFromPubHex } from './bytes.js'
import { buildNoteScript, parseNoteScript } from './tokenCodec.js'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding,
  addFunding, signFunding, UNLOCK_P2PKH,
} from './collectionBuilder.js'

export const MAX_NOTE_BYTES = 3072
const MAX_HISTORY_SCAN = 30

function utf8Len(s) {
  return new TextEncoder().encode(s).length
}

const MAX_HEADING_BYTES = 120
const MAX_TAGS_BYTES = 160

export function noteHasContent(n) {
  return (n.text?.trim().length ?? 0) > 0 || (n.bonusValue?.trim().length ?? 0) > 0 ||
    (n.heading?.trim().length ?? 0) > 0 || (n.tags != null && n.tags.length > 0)
}

export async function publishSellerNote(
  provider, key, collectionId, note,
) {
  const trimmed = note.text.trim()
  const heading = note.heading?.trim()
  const tags = note.tags?.map(t => t.replace(/^#+/, '').trim()).filter(Boolean)
  const bonusValue = note.bonusValue?.trim()
  if (trimmed.length === 0 && !bonusValue && !heading && !(tags && tags.length > 0)) throw new Error('note is empty')
  if (utf8Len(trimmed) > MAX_NOTE_BYTES) throw new Error(`note exceeds ${MAX_NOTE_BYTES} bytes`)
  if (heading != null && utf8Len(heading) > MAX_HEADING_BYTES) throw new Error(`heading exceeds ${MAX_HEADING_BYTES} bytes`)
  if (tags != null && utf8Len(tags.join(' ')) > MAX_TAGS_BYTES) throw new Error(`tags exceed ${MAX_TAGS_BYTES} bytes`)
  if (bonusValue && utf8Len(bonusValue) > MAX_NOTE_BYTES) throw new Error(`bonus exceeds ${MAX_NOTE_BYTES} bytes`)
  const authorPub = toHex(key.publicKey())

  const selected = selectFunding(await getSafeUtxos(provider), PHARLAP_OUTPUT_SATS + 500)
  const funding = selected.map(u => ({ utxo: u }))

  const tx = new Tx(1, [], [], 0)
  addFunding(tx, funding)
  tx.outputs.push({
    value: PHARLAP_OUTPUT_SATS,
    script: buildNoteScript(authorPub, {
      collectionRef: collectionId, text: trimmed,
      ...(heading ? { heading } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
      ...(bonusValue ? { bonusKind: note.bonusKind, bonusValue } : {}),
    }).toBinary(),
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

export function readNoteFromTx(tx, collectionId) {
  const want = collectionId.toLowerCase()
  for (const o of tx.outputs) {
    const n = parseNoteScript(LockingScript.fromBinary(o.script))
    if (n && n.fields.collectionRef.toLowerCase() === want) {
      return { text: n.fields.text, heading: n.fields.heading, tags: n.fields.tags, bonusKind: n.fields.bonusKind, bonusValue: n.fields.bonusValue }
    }
  }
  return null
}

export async function resolveSellerNote(
  provider, sellerPubKeyHex, collectionId,
) {
  const sellerAddress = addressFromPubHex(sellerPubKeyHex)

  const heightByTx = new Map()
  try {
    for (const h of await provider.getAddressHistory(sellerAddress)) heightByTx.set(h.txId, h.blockHeight || 0)
  } catch { }
  try {
    for (const txId of await provider.getRecentTxIdsForAddress(sellerAddress)) {
      if (!heightByTx.has(txId)) heightByTx.set(txId, 0)
    }
  } catch { }
  if (heightByTx.size === 0) return null

  const ordered = [...heightByTx.entries()]
    .sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12))
    .slice(0, MAX_HISTORY_SCAN)
    .map(([txId]) => txId)

  const seller = sellerPubKeyHex.toLowerCase()
  const want = collectionId.toLowerCase()
  for (const txId of ordered) {
    let tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    for (const o of tx.outputs) {
      const n = parseNoteScript(LockingScript.fromBinary(o.script))
      if (n && n.authorPubKeyHex.toLowerCase() === seller && n.fields.collectionRef.toLowerCase() === want) {
        return { text: n.fields.text, heading: n.fields.heading, tags: n.fields.tags, bonusKind: n.fields.bonusKind, bonusValue: n.fields.bonusValue, txId }
      }
    }
  }
  return null
}
