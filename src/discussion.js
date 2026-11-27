// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { wireToTxid } from '../impl/js/signer.mjs'
import { hexBytes, hexOf, utf8Bytes, sha256Bytes, hash160Bytes } from './bytes.js'
import { parseEditionScript, p2pkhScript } from './covenant.js'
import { buildMessageScript, parseMessageScript } from './tokenCodec.js'
import { buildEnvelope, openPublicEnvelope } from './messageCodec.js'
import { wocScriptHash } from './editionBuilder.js'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, addFunding, signFunding, UNLOCK_P2PKH,
} from './collectionBuilder.js'

const MAX_WALK_HOPS = 600
const MAX_FEED_POSTS = 200
const MAX_POST_BYTES = 1000

function u32le(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff] }

function nodeSeed(tag, collectionId, birthTxId, birthVout) {
  return [...utf8Bytes(tag), ...hexBytes(collectionId), ...hexBytes(birthTxId), ...u32le(birthVout)]
}

export function nodeFeedHash160(collectionId, birthTxId, birthVout) {
  return hash160Bytes(nodeSeed('PHARLAP-DISC-NODE-v1', collectionId, birthTxId, birthVout))
}

export function rootFeedHash160(collectionId) {
  return hash160Bytes([...utf8Bytes('PHARLAP-DISC-ROOT-v1'), ...hexBytes(collectionId)])
}

export function downFeedHash160(collectionId, birthTxId, birthVout) {
  return hash160Bytes(nodeSeed('PHARLAP-DISC-DOWN-v1', collectionId, birthTxId, birthVout))
}

export function rootDownFeedHash160(collectionId) {
  return hash160Bytes([...utf8Bytes('PHARLAP-DISC-DOWNROOT-v1'), ...hexBytes(collectionId)])
}

export function nodeRef(collectionId, birthTxId, birthVout) {
  return hexOf(sha256Bytes(nodeSeed('PHARLAP-DISC-NODE-v1', collectionId, birthTxId, birthVout)))
}

function editionAt(tx, vout) {
  const out = tx.outputs[vout]
  return out == null ? null : parseEditionScript(LockingScript.fromBinary(out.script))
}

export async function walkNodeAncestors(
  provider,
  startTxId, startVout, collectionId, maxHops = MAX_WALK_HOPS,
) {
  const nodes = []
  let txId = startTxId, vout = startVout
  for (let hop = 0; hop < maxHops; hop++) {
    let tx
    try { tx = await provider.getSourceTransaction(txId) } catch { break }
    const ed = editionAt(tx, vout)
    if (ed == null || ed.tx1RefHex !== collectionId) break
    const in0 = tx.inputs[0]
    const pTxId = in0 == null ? undefined : wireToTxid(in0.txid)
    const pVout = in0?.vout
    let parentSameCollection = false
    if (pTxId != null && pVout != null) {
      try {
        const pTx = await provider.getSourceTransaction(pTxId)
        const pEd = editionAt(pTx, pVout)
        parentSameCollection = pEd != null && pEd.tx1RefHex === collectionId
      } catch { }
    }
    if (!parentSameCollection) {
      nodes.unshift({ birthTxId: txId, birthVout: vout, ownerPubKeyHex: ed.ownerPubKeyHex, isGenesis: true })
      break
    }
    if (vout === 1) {
      nodes.unshift({ birthTxId: txId, birthVout: vout, ownerPubKeyHex: ed.ownerPubKeyHex, isGenesis: false })
    }
    txId = pTxId; vout = pVout
  }
  return nodes
}

export async function postToNodeFeed(
  provider, key,
  params,
) {
  const trimmed = params.text.trim()
  if (trimmed.length === 0) throw new Error('post is empty')
  if (new TextEncoder().encode(trimmed).length > MAX_POST_BYTES) throw new Error(`post exceeds ${MAX_POST_BYTES} bytes`)
  const downs = params.downBreadcrumbs ?? []
  const pubHex = toHex(key.publicKey())
  const envelope = await buildEnvelope({
    senderPriv: key, recipientPubKeyHex: pubHex, parts: [{ kind: 'text', text: trimmed }], encrypt: false,
    senderAlias: params.senderAlias, sentAt: Date.now(),
  })
  const selected = selectFunding(await getSafeUtxos(provider), PHARLAP_OUTPUT_SATS + 1 + downs.length + 700)
  const funding = selected.map(u => ({ utxo: u }))
  const tx = new Tx(1, [], [], 0)
  addFunding(tx, funding)
  tx.outputs.push({ value: PHARLAP_OUTPUT_SATS, script: buildMessageScript(pubHex, { ref: params.ref, envelope }).toBinary() })
  tx.outputs.push({ value: 1, script: Uint8Array.from(p2pkhScript(params.feedHash160)) })
  for (const h of downs) tx.outputs.push({ value: 1, script: Uint8Array.from(p2pkhScript(h)) })
  tx.outputs.push({ value: 0, script: key.lockingScript() })
  const changeVout = tx.outputs.length - 1
  applyFee(tx, {
    inputValues: funding.map(f => f.utxo.satoshis),
    unlockingSizes: funding.map(() => UNLOCK_P2PKH),
    changeVout,
    satPerKb: params.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  signFunding(tx, key, funding)
  await provider.broadcast(tx.hex())
  const txId = tx.txid()
  provider.registerPendingTx(txId, selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    (tx.outputs[changeVout]?.value ?? 0) > 0 ? { outputIndex: changeVout, satoshis: tx.outputs[changeVout].value ?? 0 } : undefined)
  return txId
}

export async function scanNodeFeed(provider, feedHash160, wantRef) {
  const sh = wocScriptHash(p2pkhScript(feedHash160))
  let utxos = []
  try { utxos = await provider.getUnspentByScriptHash(sh) } catch { return [] }
  const want = wantRef?.toLowerCase()
  const seenTx = new Set()
  const posts = []
  for (const u of utxos) {
    if (seenTx.has(u.txId)) continue
    seenTx.add(u.txId)
    if (seenTx.size > MAX_FEED_POSTS) break
    let tx
    try { tx = await provider.getSourceTransaction(u.txId) } catch { continue }
    for (const o of tx.outputs) {
      const m = parseMessageScript(LockingScript.fromBinary(o.script))
      if (m == null) continue
      if (want != null && m.fields.ref.toLowerCase() !== want) continue
      const opened = await openPublicEnvelope(m.fields.envelope)
      if (opened == null || opened.senderPubKeyHex.toLowerCase() !== m.recipientPubKeyHex.toLowerCase()) continue
      const textPart = opened.parts.find(p => p.kind === 'text')
      if (textPart && textPart.kind === 'text') {
        posts.push({ text: textPart.text, authorPubKeyHex: opened.senderPubKeyHex, senderAlias: opened.senderAlias, sentAt: opened.sentAt, txId: u.txId, ref: m.fields.ref })
      }
    }
  }
  return posts
}

export async function resolveCorridor(
  provider,
  startTxId, startVout, collectionId,
) {
  const ancestors = await walkNodeAncestors(provider, startTxId, startVout, collectionId)
  const out = [{
    birthTxId: collectionId, birthVout: -1, ownerPubKeyHex: '', isGenesis: false,
    feedHash160: rootFeedHash160(collectionId), downHash160: rootDownFeedHash160(collectionId),
    ref: collectionId, isRoot: true, isSelf: false,
  }]
  ancestors.forEach((n, i) => out.push({
    ...n, feedHash160: nodeFeedHash160(collectionId, n.birthTxId, n.birthVout),
    downHash160: downFeedHash160(collectionId, n.birthTxId, n.birthVout),
    ref: nodeRef(collectionId, n.birthTxId, n.birthVout), isRoot: false, isSelf: i === ancestors.length - 1,
  }))
  return out
}

export async function readCorridor(
  provider, startTxId, startVout, collectionId,
  opts = {},
) {
  const nodes = await resolveCorridor(provider, startTxId, startVout, collectionId)
  const byTx = new Map()
  const add = (p, node) => { if (!byTx.has(p.txId)) byTx.set(p.txId, { ...p, node }) }
  for (const node of nodes) for (const p of await scanNodeFeed(provider, node.feedHash160, node.ref)) add(p, node)
  const selfNode = nodes.find(n => n.isSelf)
  const downChannels = []
  if (selfNode) downChannels.push({ h: selfNode.downHash160, tag: { ...selfNode, isSelf: false, isDownstream: true } })
  if (opts.rootDownstream) { const root = nodes[0]; downChannels.push({ h: root.downHash160, tag: { ...root, isRoot: false, isDownstream: true } }) }
  for (const ch of downChannels) for (const p of await scanNodeFeed(provider, ch.h)) add(p, ch.tag)
  const posts = [...byTx.values()].sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))
  return { nodes, posts }
}
