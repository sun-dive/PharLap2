// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { addressFromPubHex } from './bytes.js'
import { buildMessageScript, parseMessageScript } from './tokenCodec.js'
import { buildEnvelope, openEnvelope } from './messageCodec.js'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, addFunding, signFunding, UNLOCK_P2PKH,
} from './collectionBuilder.js'

const ZERO_REF = '00'.repeat(32)

export async function buildMessageTx(opts) {
  const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS
  const notify = opts.notify ?? true
  const tx = new Tx(1, [], [], 0)
  addFunding(tx, opts.funding)

  const messageVout = tx.outputs.length
  tx.outputs.push({
    value: sats,
    script: buildMessageScript(opts.recipientPubKeyHex, { ref: opts.ref ?? ZERO_REF, envelope: opts.envelope }).toBinary(),
  })

  let notifyVout = null
  if (notify) {
    const recipientAddress = addressFromPubHex(opts.recipientPubKeyHex)
    notifyVout = tx.outputs.length
    tx.outputs.push({ value: 1, script: scriptForAddress(recipientAddress) })
  }

  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: opts.key.lockingScript() })
  applyFee(tx, {
    inputValues: opts.funding.map(f => f.utxo.satoshis),
    unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
    changeVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  signFunding(tx, opts.key, opts.funding)

  const changeSats = tx.outputs[changeVout]?.value ?? 0
  return { tx, txId: tx.txid(), messageVout, notifyVout, changeVout: changeSats > 0 ? changeVout : null, changeSats }
}

async function toFundingInputs(_provider, utxos) {
  return utxos.map(u => ({ utxo: u }))
}

export async function sendMessage(provider, key, params) {
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const envelope = await buildEnvelope({
    senderPriv: key, recipientPubKeyHex: params.toPubKeyHex, parts: params.parts, encrypt: params.encrypt,
    senderAlias: params.senderAlias, sentAt: params.sentAt ?? Date.now(),
  })
  const estFee = Math.ceil(((350 + envelope.length) * feePerKb) / 1000)
  const target = 2 * PHARLAP_OUTPUT_SATS + estFee + 500
  const selected = selectFunding(await getSafeUtxos(provider), target)
  const funding = await toFundingInputs(provider, selected)

  const r = await buildMessageTx({
    key, funding, recipientPubKeyHex: params.toPubKeyHex, ref: params.ref, envelope, feePerKb,
  })
  await provider.broadcast(r.tx.hex())
  provider.registerPendingTx(r.txId, selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    r.changeVout != null ? { outputIndex: r.changeVout, satoshis: r.changeSats } : undefined)
  return { txId: r.txId, messageOutpoint: { txId: r.txId, outputIndex: r.messageVout } }
}

export async function scanIncomingMessages(
  provider, recipientPriv,
  extraTxIds = [],
) {
  const myPub = toHex(recipientPriv.publicKey()).toLowerCase()
  const candidateTxIds = new Set(extraTxIds)
  const heightByTx = new Map()
  try { for (const h of await provider.getFullAddressHistory()) { candidateTxIds.add(h.txId); heightByTx.set(h.txId, h.blockHeight || 0) } } catch { }
  try { for (const u of await provider.getUtxos()) candidateTxIds.add(u.txId) } catch { }

  const found = []
  const seen = new Set()
  for (const txId of candidateTxIds) {
    let tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    for (let i = 0; i < tx.outputs.length; i++) {
      const parsed = parseMessageScript(LockingScript.fromBinary(tx.outputs[i].script))
      if (parsed == null || parsed.recipientPubKeyHex.toLowerCase() !== myPub) continue
      const key = `${txId}:${i}`
      if (seen.has(key)) continue
      seen.add(key)
      const opened = await openEnvelope(parsed.fields.envelope, recipientPriv)
      if (opened == null) continue
      found.push({
        txId, outputIndex: i, ref: parsed.fields.ref,
        senderPubKeyHex: opened.senderPubKeyHex, encrypted: opened.encrypted, parts: opened.parts,
        senderAlias: opened.senderAlias, sentAt: opened.sentAt, height: heightByTx.get(txId) ?? 0,
      })
    }
  }
  const rank = (m) => (m.height != null && m.height > 0 ? m.height : Number.MAX_SAFE_INTEGER)
  return found.sort((a, b) => (rank(b) - rank(a)) || ((b.sentAt ?? 0) - (a.sentAt ?? 0)))
}
