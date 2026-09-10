// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP publisher broadcast ("Updates") — the pull/announcement channel (PLAN.md Addendum E).
 *
 * A publisher posts ONE public message anchored to a collection, locked to their OWN pubkey (the TX1
 * template lock key). Holders PULL it: they scan the publisher's address for `RECORD_MESSAGE` records
 * referencing a collection they hold, and read them. One flat-cost tx reaches every current holder, the
 * publisher needs no holder list, and free transfers don't break delivery (holders pull by collection).
 *
 * Public-only by design: a single broadcast can't be ECIES-encrypted to all holders at once. Private
 * 1:1 messages remain the (encrypted) job of messageCodec + the Messages tab.
 *
 * Mirrors sellerNote.ts (publish a collection-keyed record to your address; others resolve by scanning
 * it) — but uses RECORD_MESSAGE from the publisher and returns the full history, newest-first.
 */
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { addressFromPubHex } from './bytes.ts'
import type { Signer } from '../impl/js/signer.mjs'
import { addFunding, signFunding, UNLOCK_P2PKH } from './collectionBuilder.ts'
import { buildMessageScript, parseMessageScript } from './tokenCodec.ts'
import { buildEnvelope, openPublicEnvelope } from './messageCodec.ts'
import { PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding } from './collectionBuilder.ts'
import type { WalletProvider } from './walletProvider.ts'

/** Cap an announcement so it stays cheap and comfortably on one output. */
export const MAX_BROADCAST_BYTES = 480
/** Bound how far back we scan a publisher's history for their announcements. */
const MAX_BROADCAST_SCAN = 50

/** A resolved publisher announcement. */
export interface Broadcast {
  text: string
  txId: string
  /** Block height of the announcement tx (0 = unconfirmed/newest) — orders the feed. */
  height: number
  /** Publisher's self-asserted alias (if attached) — display + capture as a contact. */
  senderAlias?: string
}

/**
 * Publish a PUBLIC announcement to all holders of a collection: a single `RECORD_MESSAGE` keyed to the
 * collection, locked to the publisher's own pubkey. Returns the tx id. Only the real publisher's address
 * is ever scanned by holders, so this self-gates (an impostor's "broadcast" is never pulled).
 */
export async function publishBroadcast(
  provider: WalletProvider, key: Signer, collectionId: string, text: string, senderAlias?: string,
): Promise<string> {
  const trimmed = text.trim()
  if (trimmed.length === 0) throw new Error('announcement is empty')
  if (new TextEncoder().encode(trimmed).length > MAX_BROADCAST_BYTES) {
    throw new Error(`announcement exceeds ${MAX_BROADCAST_BYTES} bytes`)
  }
  const pubHex = toHex(key.publicKey())
  // Public envelope (encrypt:false → recipientPubKeyHex is unused; anyone can read it).
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
  // Locked to the publisher's own pubkey + keyed to the collection → discoverable on the publisher's address.
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

/**
 * Pull every public announcement a publisher has posted for a collection, newest-first. A broadcast is a
 * RECORD_MESSAGE that is locked to the publisher AND sent by the publisher (self-locked) AND keyed to the
 * collection — which cleanly distinguishes it from DMs the publisher may have received.
 */
export async function resolveBroadcasts(
  provider: WalletProvider, publisherPubKeyHex: string, collectionId: string,
): Promise<Broadcast[]> {
  // ⚠ NORMALISED: an uncompressed key must resolve to the COMPRESSED key's address, or the scan looks
  //   somewhere the publisher has never posted and simply finds nothing.
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
  if (heightByTx.size === 0) return []

  // Newest first (unconfirmed → top), capped so a busy publisher address stays cheap to scan.
  const ordered = [...heightByTx.entries()]
    .sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12))
    .slice(0, MAX_BROADCAST_SCAN)

  const publisher = publisherPubKeyHex.toLowerCase()
  const want = collectionId.toLowerCase()
  const out: Broadcast[] = []
  for (const [txId, height] of ordered) {
    let tx: Tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    for (const o of tx.outputs) {
      const m = parseMessageScript(LockingScript.fromBinary(o.script))
      if (m == null) continue
      if (m.recipientPubKeyHex.toLowerCase() !== publisher) continue   // locked to the publisher
      if (m.fields.ref.toLowerCase() !== want) continue                // for this collection
      const opened = await openPublicEnvelope(m.fields.envelope)
      if (opened == null || opened.senderPubKeyHex.toLowerCase() !== publisher) continue // sent by the publisher
      const textPart = opened.parts.find(p => p.kind === 'text')
      if (textPart && textPart.kind === 'text') out.push({ text: textPart.text, txId, height, senderAlias: opened.senderAlias })
    }
  }
  return out
}
