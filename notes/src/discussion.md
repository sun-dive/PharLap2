# src/discussion.js

PHAR LAP lineage "corridor" discussions.

Discussions are anchored to a NODE — a fixed position in a collection's replication/lineage tree — not to a
holder (a holder anchor would move as they replicate; a node anchor keeps the math clean). A node's stable
identity is its BIRTH outpoint: where the copy first appeared — `out[1]` of the replication that minted it,
or its `TX2` genesis vout. A copy then *moves* (transfer / being cloned-from returns it on `out[0]`), but its
birth outpoint never changes.

Visibility (symmetric): you see & may post in a discussion iff you and its anchor are on the same vertical
line (one is an ancestor of the other). So your scope = your vertical corridor: the collection root, your
ancestors back to mint, and your own node. We serve this using ONLY the cheap upward direction (one parent
per hop — the same walk verification uses): read your corridor by walking UP and scanning each ancestor
node's feed. (Downstream discovery via push-up breadcrumbs is a later phase.)

Mechanics reuse what already exists — no new covenant:
  - a post = a public `RECORD_MESSAGE` (self-locked to the author, so the envelope sender == lock key proves
    authorship) keyed by `ref` to the node, plus a 1-sat P2PKH breadcrumb to the node's derived FEED address.
  - reading = scan a node's feed address (by script hash, mempool-aware) → parse the post records.
The feed address is derived deterministically from the node identity, so exactly the corridor members who can
walk to a node can compute its feed; cousins never encounter it (no lateral leak).

## MAX_WALK_HOPS

```ts
const MAX_WALK_HOPS = 600
```

Cap a corridor walk so a hot-token spine can't run away (logged when hit).

## MAX_FEED_POSTS

```ts
const MAX_FEED_POSTS = 200
```

Cap a feed scan so a busy node stays cheap.

## u32le

```ts
function u32le(n: number): number[]
```

## nodeSeed

```ts
function nodeSeed(tag: string, collectionId: string, birthTxId: string, birthVout: number): number[]
```

## nodeFeedHash160

```ts
export function nodeFeedHash160(collectionId: string, birthTxId: string, birthVout: number): number[]
```

Derive a node feed's hash160 (the "topic key" of its P2PKH feed address) from the node identity.

## rootFeedHash160

```ts
export function rootFeedHash160(collectionId: string): number[]
```

Derive the collection ROOT feed's hash160 — the common ancestor every holder's corridor includes
 (so the creator can reach all holders).

## downFeedHash160

```ts
export function downFeedHash160(collectionId: string, birthTxId: string, birthVout: number): number[]
```

Derive a node's DOWNSTREAM channel hash160 — where the node's descendants drop breadcrumbs so the node (and
 only the node) discovers downstream posts. Separate from the post feed so an ancestor's POST feed (read by
 its whole subtree) never leaks cousins' downstream pointers.

## rootDownFeedHash160

```ts
export function rootDownFeedHash160(collectionId: string): number[]
```

Root's downstream channel — aggregates the whole tree (the creator's view).

## nodeRef

```ts
export function nodeRef(collectionId: string, birthTxId: string, birthVout: number): string
```

The post `ref` for a node — a 32-byte hex value (RECORD_MESSAGE requires a 32-byte ref). Derived from the
 node identity so it's stable + verifiable. The collection ROOT uses the collectionId directly (already 32B).

## DiscNode

```ts
export interface DiscNode {
  /** Node identity = birth outpoint. */
  birthTxId: string
  birthVout: number
  /** Pubkey of the copy's birth owner (the buyer who minted it / the genesis owner) — display "who". */
  ownerPubKeyHex: string
  /** A root of the collection (a TX2 genesis copy). */
  isGenesis: boolean
}
```

## editionAt

```ts
function editionAt(tx: Tx, vout: number): ReturnType<typeof parseEditionScript>
```

The edition record at an output, or null when the output is missing or is not an edition.

## walkNodeAncestors

```ts
export async function walkNodeAncestors(
  provider: Pick<WalletProvider, 'getSourceTransaction'>,
  startTxId: string, startVout: number, collectionId: string, maxHops = MAX_WALK_HOPS,
): Promise<DiscNode[]>
```

Walk a copy's NODE ancestors, root→…→self (Phase 1 primitive). Each entry is a distinct node (copy) on the
vertical line from the genesis copy down to the given edition. Follows `input[0]` per hop; a copy seen at
`out[1]` was BORN there (step to its parent node), a copy at `out[0]` is the same node moved (keep walking
to its birth). Stops at a genesis copy (whose `input[0]` parent isn't a same-collection edition).

At `if (ed == null || ed.tx1RefHex !== collectionId) break`:

not a copy of this collection — stop

At `} catch {`:

treat as genesis on fetch failure

At `if (!parentSameCollection) {`:

genesis copy: born here

At `if (vout === 1) {`:

replica birth: this node was minted here; its parent (input 0) is a different node

At `txId = pTxId; vout = pVout`:

step up (continuation if out[0]; to the parent node if out[1])

## DiscPost

```ts
export interface DiscPost {
  text: string
  authorPubKeyHex: string
  senderAlias?: string
  sentAt?: number
  txId: string
  /** The node this post is anchored to (its ref). */
  ref: string
}
```

## postToNodeFeed

```ts
export async function postToNodeFeed(
  provider: WalletProvider, key: Signer,
  params: { feedHash160: number[]; ref: string; text: string; senderAlias?: string; feePerKb?: number;
    /** Each ancestor's DOWNSTREAM channel hash160 — a 1-sat breadcrumb is dropped on each so they discover this
     *  post (its record sits in this same tx's out[0]); push-up enables downline visibility without traversal. */
    downBreadcrumbs?: number[][] },
): Promise<string>
```

Post to a node's feed: a public, self-locked RECORD_MESSAGE keyed by `ref`, plus a 1-sat breadcrumb to the
 node's derived feed address (the discovery anchor). Returns the tx id.

At `tx.outputs.push({ value: PHARLAP_OUTPUT_SATS, script: buildMessageScript(pubHex, { ref: params.re...`:

[0] post record (self-locked)

At `tx.outputs.push({ value: 1, script: Uint8Array.from(p2pkhScript(params.feedHash160)) })`:

[1] feed breadcrumb (downstream readers)

At `for (const h of downs) tx.outputs.push({ value: 1, script: Uint8Array.from(p2pkhScript(h)) })`:

[2..] ancestor downstream breadcrumbs

At `tx.outputs.push({ value: 0, script: key.lockingScript() })`:

[last] change

## scanNodeFeed

```ts
export async function scanNodeFeed(provider: WalletProvider, feedHash160: number[], wantRef?: string): Promise<DiscPost[]>
```

Scan a feed address and return its posts. A post is authentic iff its RECORD_MESSAGE is self-locked
 (envelope sender == lock key). Pass `wantRef` to require posts keyed to a specific node (post feeds);
 omit it on a downstream channel, where descendant posts carry their own (varying) node refs.

At `if (opened == null || opened.senderPubKeyHex.toLowerCase() !== m.recipientPubKeyHex.toLowerCase()...`:

self-locked = authentic

## CorridorNode

```ts
export interface CorridorNode extends DiscNode {
  feedHash160: number[]; downHash160: number[]; ref: string; isRoot: boolean; isSelf: boolean
  /** Marker on the synthetic node attached to posts discovered via the downstream channel. */
  isDownstream?: boolean
}
```

A node in a holder's corridor, with its feed identities resolved (for read + post).

## resolveCorridor

```ts
export async function resolveCorridor(
  provider: Pick<WalletProvider, 'getSourceTransaction'>,
  startTxId: string, startVout: number, collectionId: string,
): Promise<CorridorNode[]>
```

Resolve a holder's full corridor for a collection: the collection root + node ancestors (root→self).

## readCorridor

```ts
export async function readCorridor(
  provider: WalletProvider, startTxId: string, startVout: number, collectionId: string,
  opts: { rootDownstream?: boolean } = {},
): Promise<{ nodes: CorridorNode[]; posts: Array<DiscPost & { node: CorridorNode }> }>
```

Read a holder's whole corridor feed for a collection: upstream + own (each node's post feed) PLUS downstream
 (your own downstream channel, where your subtree's posts land). Merged newest-first, tagged per node.
 `opts.rootDownstream` (the publisher) also scans the root's downstream channel = the whole-tree view.

At `for (const node of nodes) for (const p of await scanNodeFeed(provider, node.feedHash160, node.ref...`:

Upstream + own: each node's post feed.

At `const selfNode = nodes.find(n => n.isSelf)`:

Downstream: your own downstream channel (your subtree); the publisher also scans the root's (whole tree).

At `const posts = [...byTx.values()].sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))`:

newest first

### readCorridor › add

```ts
const add = (p: DiscPost, node: CorridorNode): void =>
```

dedupe a post that surfaces on >1 channel
