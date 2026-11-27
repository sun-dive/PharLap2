# src/pharlapStore.js

## StoredToken

```ts
export interface StoredToken {
  txId: string
  outputIndex: number
  /** Collection ID = TX1 txid (the token's tx1Ref). */
  collectionId: string
  /** Mutable per-UTXO state (hex). */
  stateData: string
  /** Cached collection name from TX1 (display convenience). */
  collectionName?: string
  status: 'active' | 'sent'
  addedAt: string
  /** Covenant edition fields (present only for edition tokens). */
  kind?: 'edition'
  /** Edition locking script (hex) — needed to replicate/transfer the covenant. */
  lockHex?: string
  /** Edition terms (for rebuilding replicate/transfer txs). */
  publisherPubKeyHashHex?: string
  /** The publisher's full 33-byte public key (hex), recovered from TX1's funding input — needed to show
   *  the publisher's avatar/alias and to message them. Cached lazily; hash-verified against publisherPubKeyHashHex. */
  publisherPubKeyHex?: string
  publisherFeeSats?: number
  holderFeeSats?: number
  /** The edition's bond = its UTXO value (sats), reclaimed by burning. Drives burn/replicate/gift figures. */
  tokenSats?: number
  /** Seller's promo note captured at purchase (the note that was current when this copy was bought). */
  sellerNote?: string
  /** Optional buyer bonus captured with the note: an external link or a redeemable code. */
  bonusKind?: 'link' | 'code'
  bonusValue?: string
  /** Block height of the acquiring tx (0/undefined = unconfirmed/newest) — orders the display, esp. after recovery. */
  heightHint?: number
}
```

PHAR LAP local token store.

PushDrop token outputs are not WoC-address-indexed, so the wallet tracks its own token
outpoints locally (tokens it mints, and tokens it discovers via the notification scan).
Backed by localStorage in the browser; an injectable KV makes it unit-testable.

## KVStore

```ts
export interface KVStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
```

## outpointKey

```ts
function outpointKey(t: { txId: string; outputIndex: number }): string
```

## migrateLegacyKeys

```ts
function migrateLegacyKeys(t: StoredToken): StoredToken
```

Back-compat: tokens stored before the creator→publisher rename used `creator*` JSON keys.
 Map them onto the current `publisher*` fields on read so older holdings survive a reload.

### PharLapStore.clear

```ts
clear(): void
```

Empty the cache (e.g. on wallet switch — holdings are rebuildable from the WIF + chain).

### PharLapStore.add

```ts
add(token: {
    txId: string
    outputIndex: number
    collectionId: string
    stateData: string
    collectionName?: string
    addedAt?: string
    kind?: 'edition'
    lockHex?: string
    publisherPubKeyHashHex?: string
    publisherPubKeyHex?: string
    publisherFeeSats?: number
    holderFeeSats?: number
    tokenSats?: number
    sellerNote?: string
    bonusKind?: 'link' | 'code'
    bonusValue?: string
    heightHint?: number
  }): boolean
```

Add a token if not already present (dedup by outpoint). Returns true if added.

At `tokenSats: token.tokenSats,`:

Previously dropped on the floor: these were passed by storeEdition but never persisted, so the bond
amount / seller note / bonus were lost on reload. Persist them.

### PharLapStore.setHeightHint

```ts
setHeightHint(txId: string, outputIndex: number, heightHint: number): boolean
```

Record the block a stored token's transaction is in. Returns true if anything changed.

### PharLapStore.setPublisherPubKey

```ts
setPublisherPubKey(collectionId: string, publisherPubKeyHex: string): void
```

Cache the publisher's recovered full pubkey on every held copy of a collection (set lazily after a
 TX1 input lookup). Keyed by collectionId since all editions of a collection share one publisher.

### PharLapStore.setCollectionName

```ts
setCollectionName(txId: string, outputIndex: number, collectionName: string): void
```

Update the cached collection name of a stored token (e.g. once resolved from TX1).

### PharLapStore.markSent

```ts
markSent(txId: string, outputIndex: number): void
```

Mark a token as sent (spent in a transfer); kept for history.

### PharLapStore.reactivate

```ts
reactivate(txId: string, outputIndex: number): boolean
```

Bring a retired entry back when the chain shows its outpoint unspent. Returns true if one was revived.

### PharLapStore.active

```ts
active(): StoredToken[]
```

Active (held) tokens.
