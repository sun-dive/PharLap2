// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { p2pkhAddress } from '../impl/js/address.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { addFunding, signFunding, UNLOCK_P2PKH } from './collectionBuilder.js'
import { buildConfigScript, parseConfigScript } from './tokenCodec.js'
import { buildEnvelope, openEnvelope } from './messageCodec.js'
import { PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding } from './collectionBuilder.js'

const MAX_CONFIG_SCAN = 30
const CONFIG_SCHEMA = 1

export async function publishConfigBackup(
  provider, key,
  cfg,
  savedAt,
) {
  const pubHex = toHex(key.publicKey())
  const blob = { schema: CONFIG_SCHEMA, alias: cfg.alias, aliasAt: cfg.aliasAt, contacts: cfg.contacts, contactsAt: cfg.contactsAt, prefs: cfg.prefs, savedAt }
  const envelope = await buildEnvelope({
    senderPriv: key, recipientPubKeyHex: pubHex, parts: [{ kind: 'text', text: JSON.stringify(blob) }], encrypt: true,
  })
  const estFee = Math.ceil(((350 + envelope.length) * DEFAULT_FEE_PER_KB) / 1000)
  const selected = selectFunding(await getSafeUtxos(provider), PHARLAP_OUTPUT_SATS + estFee + 600)
  const funding = selected.map(u => ({ utxo: u }))
  const tx = new Tx(1, [], [], 0)
  addFunding(tx, funding)
  tx.outputs.push({ value: PHARLAP_OUTPUT_SATS, script: buildConfigScript(pubHex, { envelope }).toBinary() })
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
  const changeSats = tx.outputs[1]?.value ?? 0
  provider.registerPendingTx(txId, selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    changeSats > 0 ? { outputIndex: 1, satoshis: changeSats } : undefined)
  return txId
}

export async function resolveConfigBackup(provider, key) {
  const pubHex = toHex(key.publicKey())
  const address = p2pkhAddress(key.publicKey())
  const heightByTx = new Map()
  try { for (const h of await provider.getAddressHistory(address)) heightByTx.set(h.txId, h.blockHeight || 0) } catch { }
  try { for (const txId of await provider.getRecentTxIdsForAddress(address)) if (!heightByTx.has(txId)) heightByTx.set(txId, 0) } catch { }
  if (heightByTx.size === 0) return null
  const ordered = [...heightByTx.entries()].sort((a, b) => (b[1] || 1e12) - (a[1] || 1e12)).slice(0, MAX_CONFIG_SCAN)
  const mine = pubHex.toLowerCase()
  for (const [txId] of ordered) {
    let tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    for (const o of tx.outputs) {
      const c = parseConfigScript(LockingScript.fromBinary(o.script))
      if (c == null || c.ownerPubKeyHex.toLowerCase() !== mine) continue
      const opened = await openEnvelope(c.fields.envelope, key)
      if (opened == null || opened.senderPubKeyHex.toLowerCase() !== mine) continue
      const textPart = opened.parts.find(p => p.kind === 'text')
      if (textPart == null || textPart.kind !== 'text') continue
      try {
        const blob = JSON.parse(textPart.text)
        if (blob != null && typeof blob === 'object' && blob.contacts != null) return blob
      } catch { }
    }
  }
  return null
}

export function mergeConfig(
  local,
  backup,
) {
  const contacts = { ...local.contacts }
  const contactsAt = { ...local.contactsAt }
  let changed = 0
  for (const [pk, name] of Object.entries(backup.contacts)) {
    const bAt = backup.contactsAt?.[pk] ?? backup.savedAt ?? 0
    const lAt = contactsAt[pk] ?? (contacts[pk] != null ? 0 : -1)
    if (lAt < 0 || bAt > lAt) {
      if (contacts[pk] !== name || contactsAt[pk] !== bAt) changed++
      contacts[pk] = name
      contactsAt[pk] = bAt
    }
  }
  let alias = local.alias, aliasAt = local.aliasAt
  if (backup.alias != null && (backup.aliasAt ?? backup.savedAt ?? 0) > (local.aliasAt ?? -1)) {
    alias = backup.alias; aliasAt = backup.aliasAt ?? backup.savedAt
  }
  return { alias, aliasAt, contacts, contactsAt, changed }
}
