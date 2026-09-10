// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP self-published profile (display alias + small avatar).
 *
 * A key publishes ONE `RECORD_PROFILE` PushDrop output locked to its own pubkey, on its own address — the
 * same publish-to-self / resolve-by-scan pattern as broadcasts and seller notes. Anyone can resolve a key's
 * profile by deriving its address and scanning for the newest RECORD_PROFILE (latest-by-height wins), so a
 * reader sees a key's @name + face even without a prior message. Self-gated: only that key funds txs on its
 * address, so an impostor can't plant a profile there.
 *
 * The avatar is a SMALL pre-downscaled image (see thumbs.downscaleToAvatar) — published once, never per
 * message, so it doesn't bloat ordinary messaging.
 */
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { addressFromPubHex } from './bytes.ts'
import type { Signer } from '../impl/js/signer.mjs'
import { buildProfileScript, parseProfileScript, type ProfileFields } from './tokenCodec.ts'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, addFunding, signFunding, UNLOCK_P2PKH,
} from './collectionBuilder.ts'
import type { WalletProvider } from './walletProvider.ts'

/** Bound how far back we scan a key's history for its latest profile. */
const MAX_PROFILE_SCAN = 30

/** Publish (or update) your profile: a RECORD_PROFILE output locked to your pubkey, on your address. */
export async function publishProfile(
  provider: WalletProvider, key: Signer,
  profile: { alias?: string; avatar?: { mimeType: string; bytes: number[] } },
): Promise<string> {
  const pubHex = toHex(key.publicKey())
  const fields: ProfileFields = {
    alias: profile.alias, avatarMimeType: profile.avatar?.mimeType, avatarBytes: profile.avatar?.bytes,
  }
  const avatarLen = profile.avatar?.bytes.length ?? 0
  const estFee = Math.ceil(((350 + avatarLen) * DEFAULT_FEE_PER_KB) / 1000)
  const selected = selectFunding(await getSafeUtxos(provider), PHARLAP_OUTPUT_SATS + estFee + 600)
  const funding = selected.map(u => ({ utxo: u }))
  const tx = new Tx(1, [], [], 0)
  addFunding(tx, funding)
  tx.outputs.push({ value: PHARLAP_OUTPUT_SATS, script: buildProfileScript(pubHex, fields).toBinary() })
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

/** Resolve a key's latest published profile by scanning its address, or null if it has none. */
export async function resolveProfile(provider: WalletProvider, ownerPubKeyHex: string): Promise<ProfileFields | null> {
  const address = addressFromPubHex(ownerPubKeyHex)
  const heightByTx = new Map<string, number>()
  try { for (const h of await provider.getAddressHistory(address)) heightByTx.set(h.txId, h.blockHeight || 0) } catch { return null }
  try { for (const txId of await provider.getRecentTxIdsForAddress(address)) if (!heightByTx.has(txId)) heightByTx.set(txId, 0) } catch { /* best-effort */ }
  if (heightByTx.size === 0) return null

  const owner = ownerPubKeyHex.toLowerCase()
  const ordered = [...heightByTx.entries()]
    .sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12)) // newest first; unconfirmed → top
    .slice(0, MAX_PROFILE_SCAN)
  for (const [txId] of ordered) {
    let tx: Tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    for (const o of tx.outputs) {
      const p = parseProfileScript(LockingScript.fromBinary(o.script))
      if (p != null && p.ownerPubKeyHex.toLowerCase() === owner) return p.fields // newest-first → first hit is latest
    }
  }
  return null
}
