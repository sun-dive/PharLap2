// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP lineage "corridor" discussions.
 *
 * Discussions are anchored to a NODE — a fixed position in a collection's replication/lineage tree — not to a
 * holder (a holder anchor would move as they replicate; a node anchor keeps the math clean). A node's stable
 * identity is its BIRTH outpoint: where the copy first appeared — `out[1]` of the replication that minted it,
 * or its `TX2` genesis vout. A copy then *moves* (transfer / being cloned-from returns it on `out[0]`), but its
 * birth outpoint never changes.
 *
 * Visibility (symmetric): you see & may post in a discussion iff you and its anchor are on the same vertical
 * line (one is an ancestor of the other). So your scope = your vertical corridor: the collection root, your
 * ancestors back to mint, and your own node. We serve this using ONLY the cheap upward direction (one parent
 * per hop — the same walk verification uses): read your corridor by walking UP and scanning each ancestor
 * node's feed. (Downstream discovery via push-up breadcrumbs is a later phase.)
 *
 * Mechanics reuse what already exists — no new covenant:
 *   - a post = a public `RECORD_MESSAGE` (self-locked to the author, so the envelope sender == lock key proves
 *     authorship) keyed by `ref` to the node, plus a 1-sat P2PKH breadcrumb to the node's derived FEED address.
 *   - reading = scan a node's feed address (by script hash, mempool-aware) → parse the post records.
 * The feed address is derived deterministically from the node identity, so exactly the corridor members who can
 * walk to a node can compute its feed; cousins never encounter it (no lateral leak).
 */
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { wireToTxid } from '../impl/js/signer.mjs'
import type { Signer } from '../impl/js/signer.mjs'
import { hexBytes, hexOf, utf8Bytes, sha256Bytes, hash160Bytes } from './bytes.ts'
import { parseEditionScript, p2pkhScript } from './covenant.ts'
import { buildMessageScript, parseMessageScript } from './tokenCodec.ts'
import { buildEnvelope, openPublicEnvelope } from './messageCodec.ts'
import { wocScriptHash } from './editionBuilder.ts'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, addFunding, signFunding, UNLOCK_P2PKH,
} from './collectionBuilder.ts'
import type { WalletProvider } from './walletProvider.ts'

/** Cap a corridor walk so a hot-token spine can't run away (logged when hit). */
const MAX_WALK_HOPS = 600
/** Cap a feed scan so a busy node stays cheap. */
const MAX_FEED_POSTS = 200
const MAX_POST_BYTES = 1000

function u32le(n: number): number[] { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff] }

function nodeSeed(tag: string, collectionId: string, birthTxId: string, birthVout: number): number[] {
  return [...utf8Bytes(tag), ...hexBytes(collectionId), ...hexBytes(birthTxId), ...u32le(birthVout)]
}

/** Derive a node feed's hash160 (the "topic key" of its P2PKH feed address) from the node identity. */
export function nodeFeedHash160(collectionId: string, birthTxId: string, birthVout: number): number[] {
  return hash160Bytes(nodeSeed('PHARLAP-DISC-NODE-v1', collectionId, birthTxId, birthVout))
}

/** Derive the collection ROOT feed's hash160 — the common ancestor every holder's corridor includes
 *  (so the creator can reach all holders). */
export function rootFeedHash160(collectionId: string): number[] {
  return hash160Bytes([...utf8Bytes('PHARLAP-DISC-ROOT-v1'), ...hexBytes(collectionId)])
}

/** Derive a node's DOWNSTREAM channel hash160 — where the node's descendants drop breadcrumbs so the node (and
 *  only the node) discovers downstream posts. Separate from the post feed so an ancestor's POST feed (read by
 *  its whole subtree) never leaks cousins' downstream pointers. */
export function downFeedHash160(collectionId: string, birthTxId: string, birthVout: number): number[] {
  return hash160Bytes(nodeSeed('PHARLAP-DISC-DOWN-v1', collectionId, birthTxId, birthVout))
}

/** Root's downstream channel — aggregates the whole tree (the creator's view). */
export function rootDownFeedHash160(collectionId: string): number[] {
  return hash160Bytes([...utf8Bytes('PHARLAP-DISC-DOWNROOT-v1'), ...hexBytes(collectionId)])
}

/** The post `ref` for a node — a 32-byte hex value (RECORD_MESSAGE requires a 32-byte ref). Derived from the
 *  node identity so it's stable + verifiable. The collection ROOT uses the collectionId directly (already 32B). */
export function nodeRef(collectionId: string, birthTxId: string, birthVout: number): string {
  return hexOf(sha256Bytes(nodeSeed('PHARLAP-DISC-NODE-v1', collectionId, birthTxId, birthVout)))
}

export interface DiscNode {
  /** Node identity = birth outpoint. */
  birthTxId: string
  birthVout: number
  /** Pubkey of the copy's birth owner (the buyer who minted it / the genesis owner) — display "who". */
  ownerPubKeyHex: string
  /** A root of the collection (a TX2 genesis copy). */
  isGenesis: boolean
}

/** The edition record at an output, or null when the output is missing or is not an edition. */
function editionAt(tx: Tx, vout: number): ReturnType<typeof parseEditionScript> {
  const out = tx.outputs[vout]
  return out == null ? null : parseEditionScript(LockingScript.fromBinary(out.script))
}

/**
 * Walk a copy's NODE ancestors, root→…→self (Phase 1 primitive). Each entry is a distinct node (copy) on the
 * vertical line from the genesis copy down to the given edition. Follows `input[0]` per hop; a copy seen at
 * `out[1]` was BORN there (step to its parent node), a copy at `out[0]` is the same node moved (keep walking
 * to its birth). Stops at a genesis copy (whose `input[0]` parent isn't a same-collection edition).
 */
export async function walkNodeAncestors(
  provider: Pick<WalletProvider, 'getSourceTransaction'>,
  startTxId: string, startVout: number, collectionId: string, maxHops = MAX_WALK_HOPS,
): Promise<DiscNode[]> {
  const nodes: DiscNode[] = []
  let txId = startTxId, vout = startVout
  for (let hop = 0; hop < maxHops; hop++) {
    let tx: Tx
    try { tx = await provider.getSourceTransaction(txId) } catch { break }
    const ed = editionAt(tx, vout)
    if (ed == null || ed.tx1RefHex !== collectionId) break // not a copy of this collection — stop
    const in0 = tx.inputs[0]
    const pTxId = in0 == null ? undefined : wireToTxid(in0.txid)
    const pVout = in0?.vout
    let parentSameCollection = false
    if (pTxId != null && pVout != null) {
      try {
        const pTx = await provider.getSourceTransaction(pTxId)
        const pEd = editionAt(pTx, pVout)
        parentSameCollection = pEd != null && pEd.tx1RefHex === collectionId
      } catch { /* treat as genesis on fetch failure */ }
    }
    if (!parentSameCollection) { // genesis copy: born here
      nodes.unshift({ birthTxId: txId, birthVout: vout, ownerPubKeyHex: ed.ownerPubKeyHex, isGenesis: true })
      break
    }
    if (vout === 1) { // replica birth: this node was minted here; its parent (input 0) is a different node
      nodes.unshift({ birthTxId: txId, birthVout: vout, ownerPubKeyHex: ed.ownerPubKeyHex, isGenesis: false })
    }
    txId = pTxId!; vout = pVout! // step up (continuation if out[0]; to the parent node if out[1])
  }
  return nodes
}

export interface DiscPost {
  text: string
  authorPubKeyHex: string
  senderAlias?: string
  sentAt?: number
  txId: string
  /** The node this post is anchored to (its ref). */
  ref: string
}

/** Post to a node's feed: a public, self-locked RECORD_MESSAGE keyed by `ref`, plus a 1-sat breadcrumb to the
 *  node's derived feed address (the discovery anchor). Returns the tx id. */
export async function postToNodeFeed(
  provider: WalletProvider, key: Signer,
  params: { feedHash160: number[]; ref: string; text: string; senderAlias?: string; feePerKb?: number;
    /** Each ancestor's DOWNSTREAM channel hash160 — a 1-sat breadcrumb is dropped on each so they discover this
     *  post (its record sits in this same tx's out[0]); push-up enables downline visibility without traversal. */
    downBreadcrumbs?: number[][] },
): Promise<string> {
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
  tx.outputs.push({ value: PHARLAP_OUTPUT_SATS, script: buildMessageScript(pubHex, { ref: params.ref, envelope }).toBinary() }) // [0] post record (self-locked)
  tx.outputs.push({ value: 1, script: Uint8Array.from(p2pkhScript(params.feedHash160)) })                                     // [1] feed breadcrumb (downstream readers)
  for (const h of downs) tx.outputs.push({ value: 1, script: Uint8Array.from(p2pkhScript(h)) })                               // [2..] ancestor downstream breadcrumbs
  tx.outputs.push({ value: 0, script: key.lockingScript() })                                                                  // [last] change
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

/** Scan a feed address and return its posts. A post is authentic iff its RECORD_MESSAGE is self-locked
 *  (envelope sender == lock key). Pass `wantRef` to require posts keyed to a specific node (post feeds);
 *  omit it on a downstream channel, where descendant posts carry their own (varying) node refs. */
export async function scanNodeFeed(provider: WalletProvider, feedHash160: number[], wantRef?: string): Promise<DiscPost[]> {
  const sh = wocScriptHash(p2pkhScript(feedHash160))
  let utxos: Array<{ txId: string }> = []
  try { utxos = await provider.getUnspentByScriptHash(sh) } catch { return [] }
  const want = wantRef?.toLowerCase()
  const seenTx = new Set<string>()
  const posts: DiscPost[] = []
  for (const u of utxos) {
    if (seenTx.has(u.txId)) continue
    seenTx.add(u.txId)
    if (seenTx.size > MAX_FEED_POSTS) break
    let tx: Tx
    try { tx = await provider.getSourceTransaction(u.txId) } catch { continue }
    for (const o of tx.outputs) {
      const m = parseMessageScript(LockingScript.fromBinary(o.script))
      if (m == null) continue
      if (want != null && m.fields.ref.toLowerCase() !== want) continue
      const opened = await openPublicEnvelope(m.fields.envelope)
      if (opened == null || opened.senderPubKeyHex.toLowerCase() !== m.recipientPubKeyHex.toLowerCase()) continue // self-locked = authentic
      const textPart = opened.parts.find(p => p.kind === 'text')
      if (textPart && textPart.kind === 'text') {
        posts.push({ text: textPart.text, authorPubKeyHex: opened.senderPubKeyHex, senderAlias: opened.senderAlias, sentAt: opened.sentAt, txId: u.txId, ref: m.fields.ref })
      }
    }
  }
  return posts
}

/** A node in a holder's corridor, with its feed identities resolved (for read + post). */
export interface CorridorNode extends DiscNode {
  feedHash160: number[]; downHash160: number[]; ref: string; isRoot: boolean; isSelf: boolean
  /** Marker on the synthetic node attached to posts discovered via the downstream channel. */
  isDownstream?: boolean
}

/** Resolve a holder's full corridor for a collection: the collection root + node ancestors (root→self). */
export async function resolveCorridor(
  provider: Pick<WalletProvider, 'getSourceTransaction'>,
  startTxId: string, startVout: number, collectionId: string,
): Promise<CorridorNode[]> {
  const ancestors = await walkNodeAncestors(provider, startTxId, startVout, collectionId)
  const out: CorridorNode[] = [{
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

/** Read a holder's whole corridor feed for a collection: upstream + own (each node's post feed) PLUS downstream
 *  (your own downstream channel, where your subtree's posts land). Merged newest-first, tagged per node.
 *  `opts.rootDownstream` (the publisher) also scans the root's downstream channel = the whole-tree view. */
export async function readCorridor(
  provider: WalletProvider, startTxId: string, startVout: number, collectionId: string,
  opts: { rootDownstream?: boolean } = {},
): Promise<{ nodes: CorridorNode[]; posts: Array<DiscPost & { node: CorridorNode }> }> {
  const nodes = await resolveCorridor(provider, startTxId, startVout, collectionId)
  const byTx = new Map<string, DiscPost & { node: CorridorNode }>() // dedupe a post that surfaces on >1 channel
  const add = (p: DiscPost, node: CorridorNode): void => { if (!byTx.has(p.txId)) byTx.set(p.txId, { ...p, node }) }
  // Upstream + own: each node's post feed.
  for (const node of nodes) for (const p of await scanNodeFeed(provider, node.feedHash160, node.ref)) add(p, node)
  // Downstream: your own downstream channel (your subtree); the publisher also scans the root's (whole tree).
  const selfNode = nodes.find(n => n.isSelf)
  const downChannels: Array<{ h: number[]; tag: CorridorNode }> = []
  if (selfNode) downChannels.push({ h: selfNode.downHash160, tag: { ...selfNode, isSelf: false, isDownstream: true } })
  if (opts.rootDownstream) { const root = nodes[0]; downChannels.push({ h: root.downHash160, tag: { ...root, isRoot: false, isDownstream: true } }) }
  for (const ch of downChannels) for (const p of await scanNodeFeed(provider, ch.h)) add(p, ch.tag)
  const posts = [...byTx.values()].sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0)) // newest first
  return { nodes, posts }
}
