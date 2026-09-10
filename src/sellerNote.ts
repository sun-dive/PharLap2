// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP seller-note — a seller's MUTABLE promo note for a collection (review, bonuses, redemption
 * instructions). PLAN.md Step 2 (D3): the note lives OUTSIDE the frozen edition covenant, so a reseller
 * can overwrite it freely; the latest one a seller publishes wins.
 *
 *   PUBLISH  — the seller broadcasts a tiny tx with a NOTE output (locked to their own pubkey, keyed to
 *              the collection) + change. Because the funding/change touch the seller's address, the note
 *              is discoverable via that address's history (no indexer).
 *   RESOLVE  — given a seller's pubkey + collection, scan their address history newest-first and return
 *              the most recent matching NOTE. This runs in the same place the sales page resolves the
 *              seller's edition tip, so the storefront can show the current note to buyers.
 *
 * Delivery to the buyer at purchase (riding on the replicate notification output) is handled by the
 * edition builder; this module owns the standalone publish + resolve.
 *
 * ⚠⚠ "MUTABLE" IS A PROPERTY OF THE RESOLVER, NOT OF THE CHAIN. Nothing is ever overwritten — every note
 *   a seller has published is still there, and `resolveSellerNote` simply returns the newest. ⇒ A seller
 *   who publishes a correction has not removed the original; the wallet must never imply otherwise.
 */
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { addressFromPubHex } from './bytes.ts'
import type { Signer } from '../impl/js/signer.mjs'
import { buildNoteScript, parseNoteScript, type BonusKind } from './tokenCodec.ts'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding,
  addFunding, signFunding, UNLOCK_P2PKH,
} from './collectionBuilder.ts'
import type { WalletProvider } from './walletProvider.ts'

/** Cap the note so it stays cheap and rides comfortably on the notification/propagation output. Raised
 *  280→560 (2026-06-26), 560→2048 (2026-07-05), then 2048→3072 (2026-07-08) to fit a full listing "story" +
 *  terms with room to spare: the extra bytes per resale are negligible on BSV, and the full text is on-chain +
 *  search-engine-indexable even when the UI truncates the visible portion. (Pre-written notes are kept ≤2 KB
 *  so the seller has ~1 KB of headroom to edit before hitting the cap.) */
export const MAX_NOTE_BYTES = 3072
/** Bound how far back we scan a seller's history looking for their latest note. */
const MAX_HISTORY_SCAN = 30

function utf8Len(s: string): number {
  return new TextEncoder().encode(s).length
}

/** A resolved seller note: a listing heading + description (text) + tags + optional buyer bonus. */
export interface SellerNote {
  text: string
  /** Seller-authored listing heading (updatable; distinct from the immutable collection title). */
  heading?: string
  /** Category tags (slug-like, no leading '#'). */
  tags?: string[]
  bonusKind?: BonusKind
  bonusValue?: string
}

/** Bound the heading / joined tags so the note stays small enough to ride on a notification output. */
const MAX_HEADING_BYTES = 120
const MAX_TAGS_BYTES = 160

/** True if a note carries anything worth recording/propagating (description, heading, tags, or a bonus). */
export function noteHasContent(n: SellerNote): boolean {
  return (n.text?.trim().length ?? 0) > 0 || (n.bonusValue?.trim().length ?? 0) > 0 ||
    (n.heading?.trim().length ?? 0) > 0 || (n.tags != null && n.tags.length > 0)
}

/** Publish (or overwrite) the seller's note for a collection, with an optional bonus. Returns the note tx id. */
export async function publishSellerNote(
  provider: WalletProvider, key: Signer, collectionId: string, note: SellerNote,
): Promise<string> {
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

  // ⚠ THE +500 IS THE DEPLOYED HEADROOM AND IS DELIBERATELY NOT THE +600 `broadcast.ts` USES. Each was
  //   sized against its own record, and a note is capped far larger. Left alone rather than harmonised:
  //   the fee is computed from the real signed size below, so the only thing this figure decides is how
  //   many UTXOs get pulled in.
  const selected = selectFunding(await getSafeUtxos(provider), PHARLAP_OUTPUT_SATS + 500)
  // ⚠ The deployed version also fetched each funding input's SOURCE TRANSACTION here, because the removed
  //   library's unlocking template needed the parent to find the amount. We sign BIP-143, which commits
  //   the amount directly, so the parent is never needed — one network round trip per input, gone.
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

/**
 * Read a note that rode IN on a transaction (the on-chain echo carried by a sale/transfer), for a given
 * collection — used for hands-off propagation: when a holder resells, the note attached to the tx that
 * gave them their edition is re-attached to the new sale unless they've published their own.
 */
export function readNoteFromTx(tx: Tx, collectionId: string): SellerNote | null {
  const want = collectionId.toLowerCase()
  for (const o of tx.outputs) {
    const n = parseNoteScript(LockingScript.fromBinary(o.script))
    if (n && n.fields.collectionRef.toLowerCase() === want) {
      return { text: n.fields.text, heading: n.fields.heading, tags: n.fields.tags, bonusKind: n.fields.bonusKind, bonusValue: n.fields.bonusValue }
    }
  }
  return null
}

/** The latest note a seller has published for a collection, or null. */
export async function resolveSellerNote(
  provider: WalletProvider, sellerPubKeyHex: string, collectionId: string,
): Promise<(SellerNote & { txId: string }) | null> {
  // ⚠ NORMALISED: an uncompressed key must resolve to the COMPRESSED key's address, or the scan looks
  //   somewhere the seller has never posted and finds nothing — a silent empty result, not an error.
  const sellerAddress = addressFromPubHex(sellerPubKeyHex)

  // Candidates: confirmed history (with heights) UNIONed with mempool-aware txids (the just-published
  // note's change output surfaces here before `/history` indexes it). Unconfirmed → height 0 → ranked newest.
  const heightByTx = new Map<string, number>()
  try {
    for (const h of await provider.getAddressHistory(sellerAddress)) heightByTx.set(h.txId, h.blockHeight || 0)
  } catch { /* best-effort */ }
  try {
    for (const txId of await provider.getRecentTxIdsForAddress(sellerAddress)) {
      if (!heightByTx.has(txId)) heightByTx.set(txId, 0) // mempool / unconfirmed
    }
  } catch { /* best-effort */ }
  if (heightByTx.size === 0) return null

  // Newest first: unconfirmed (height 0 → +inf), then descending block height.
  const ordered = [...heightByTx.entries()]
    .sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12))
    .slice(0, MAX_HISTORY_SCAN)
    .map(([txId]) => txId)

  // ⚠⚠ MATCHED BY RAW HEX, WHICH IS NOT WHAT THE ADDRESS ABOVE WAS DERIVED FROM. The same inconsistency
  //   is pinned in `broadcast.ts`: an uncompressed caller scans exactly the right address and then
  //   matches no record. ⛔ Preserved rather than fixed — normalising this would change which records the
  //   application considers its own, and that is a decision, not a tidy-up.
  const seller = sellerPubKeyHex.toLowerCase()
  const want = collectionId.toLowerCase()
  for (const txId of ordered) {
    let tx: Tx
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
