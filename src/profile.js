// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { addressFromPubHex } from './bytes.js'
import { buildProfileScript, parseProfileScript } from './tokenCodec.js'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, addFunding, signFunding, UNLOCK_P2PKH,
} from './collectionBuilder.js'

const MAX_PROFILE_SCAN = 30

export async function publishProfile(
  provider, key,
  profile,
) {
  const pubHex = toHex(key.publicKey())
  const fields = {
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

export async function resolveProfile(provider, ownerPubKeyHex) {
  const address = addressFromPubHex(ownerPubKeyHex)
  const heightByTx = new Map()
  try { for (const h of await provider.getAddressHistory(address)) heightByTx.set(h.txId, h.blockHeight || 0) } catch { return null }
  try { for (const txId of await provider.getRecentTxIdsForAddress(address)) if (!heightByTx.has(txId)) heightByTx.set(txId, 0) } catch { }
  if (heightByTx.size === 0) return null

  const owner = ownerPubKeyHex.toLowerCase()
  const ordered = [...heightByTx.entries()]
    .sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12))
    .slice(0, MAX_PROFILE_SCAN)
  for (const [txId] of ordered) {
    let tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    for (const o of tx.outputs) {
      const p = parseProfileScript(LockingScript.fromBinary(o.script))
      if (p != null && p.ownerPubKeyHex.toLowerCase() === owner) return p.fields
    }
  }
  return null
}
