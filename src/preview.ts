// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP preview clip — a publisher's PUBLIC "listen before you buy" audio sample for a collection.
 *
 * Mirrors the seller-note publish/resolve pattern (publish-to-self on the publisher's own address, keyed to a
 * collection, resolved by scanning that address newest-first) but carries a binary audio payload (an mp3 clip)
 * in its own RECORD_PREVIEW output instead of the 3 KB text note. Public/plaintext — any prospective buyer, and
 * the nft.sale curator (which holds no key), plays it with no decryption. The publisher makes the clip in their
 * DAW and uploads the finished mp3; PHAR LAP does not trim or transcode.
 *
 *   PUBLISH  — the publisher broadcasts a tx with a PREVIEW output (locked to their own pubkey, keyed to the
 *              collection) + change. It's a large output, so funding is sized to the clip's fee (unlike a note).
 *   RESOLVE  — given the publisher's pubkey + collection, scan their address history newest-first for the most
 *              recent matching PREVIEW. The sales page + curator use this to surface the sample.
 */
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { addressFromPubHex } from './bytes.ts'
import type { Signer } from '../impl/js/signer.mjs'
import { buildPreviewScript, parsePreviewScript } from './tokenCodec.ts'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, addFunding, signFunding, UNLOCK_P2PKH,
} from './collectionBuilder.ts'
import type { WalletProvider } from './walletProvider.ts'

/** Cap the preview clip. A 30 s mp3 is ~300–500 KB; 1 MB leaves generous headroom while bounding the tx fee
 *  (~100 k sat at the floor rate for a 1 MB payload). The publisher supplies a finished, already-small clip. */
export const MAX_PREVIEW_BYTES = 1_048_576
/** How far back to scan a publisher's history for their latest preview. */
const MAX_HISTORY_SCAN = 30

export interface PreviewClip {
  /** Audio MIME (e.g. 'audio/mpeg' for mp3). */
  mimeType: string
  bytes: number[]
}

/** Publish (or overwrite) the publisher's preview clip for a collection. Returns the tx id. */
export async function publishPreview(
  provider: WalletProvider, key: Signer, collectionId: string, clip: PreviewClip,
): Promise<string> {
  if (clip.bytes.length === 0) throw new Error('preview clip is empty')
  if (clip.bytes.length > MAX_PREVIEW_BYTES) throw new Error(`preview exceeds ${MAX_PREVIEW_BYTES} bytes`)
  const mimeType = clip.mimeType || 'audio/mpeg'
  const publisherPub = toHex(key.publicKey())

  // The PREVIEW output makes this a large tx, so its fee scales with the payload — size the funding target to it
  // (applyFee computes the exact fee afterwards; selection just needs to pick enough UTXOs). Mirrors createCollection.
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

/** The latest preview clip a publisher has posted for a collection, or null. Verifies the PREVIEW was authored
 *  by `publisherPubKeyHex` (the collection's publisher key) — so a stranger can't inject a fake sample. */
export async function resolvePreview(
  provider: WalletProvider, publisherPubKeyHex: string, collectionId: string,
): Promise<(PreviewClip & { txId: string }) | null> {
  const address = addressFromPubHex(publisherPubKeyHex)

  const heightByTx = new Map<string, number>()
  try {
    for (const h of await provider.getAddressHistory(address)) heightByTx.set(h.txId, h.blockHeight || 0)
  } catch { /* best-effort */ }
  try {
    for (const txId of await provider.getRecentTxIdsForAddress(address)) {
      if (!heightByTx.has(txId)) heightByTx.set(txId, 0) // mempool / unconfirmed
    }
  } catch { /* best-effort */ }
  if (heightByTx.size === 0) return null

  // Newest first: unconfirmed (height 0 → +inf), then descending block height.
  const ordered = [...heightByTx.entries()]
    .sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12))
    .slice(0, MAX_HISTORY_SCAN)
    .map(([txId]) => txId)

  const pub = publisherPubKeyHex.toLowerCase()
  const want = collectionId.toLowerCase()
  for (const txId of ordered) {
    let tx: Tx
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
