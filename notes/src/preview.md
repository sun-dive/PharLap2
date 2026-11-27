# src/preview.js

PHAR LAP preview clip — a publisher's PUBLIC "listen before you buy" audio sample for a collection.

Mirrors the seller-note publish/resolve pattern (publish-to-self on the publisher's own address, keyed to a
collection, resolved by scanning that address newest-first) but carries a binary audio payload (an mp3 clip)
in its own RECORD_PREVIEW output instead of the 3 KB text note. Public/plaintext — any prospective buyer, and
the nft.sale curator (which holds no key), plays it with no decryption. The publisher makes the clip in their
DAW and uploads the finished mp3; PHAR LAP does not trim or transcode.

  PUBLISH  — the publisher broadcasts a tx with a PREVIEW output (locked to their own pubkey, keyed to the
             collection) + change. It's a large output, so funding is sized to the clip's fee (unlike a note).
  RESOLVE  — given the publisher's pubkey + collection, scan their address history newest-first for the most
             recent matching PREVIEW. The sales page + curator use this to surface the sample.

## MAX_PREVIEW_BYTES

```ts
export const MAX_PREVIEW_BYTES = 1_048_576
```

Cap the preview clip. A 30 s mp3 is ~300–500 KB; 1 MB leaves generous headroom while bounding the tx fee
 (~100 k sat at the floor rate for a 1 MB payload). The publisher supplies a finished, already-small clip.

## MAX_HISTORY_SCAN

```ts
const MAX_HISTORY_SCAN = 30
```

How far back to scan a publisher's history for their latest preview.

## PreviewClip

```ts
export interface PreviewClip {
  /** Audio MIME (e.g. 'audio/mpeg' for mp3). */
  mimeType: string
  bytes: number[]
}
```

## publishPreview

```ts
export async function publishPreview(
  provider: WalletProvider, key: Signer, collectionId: string, clip: PreviewClip,
): Promise<string>
```

Publish (or overwrite) the publisher's preview clip for a collection. Returns the tx id.

At `const estBytes = 300 + clip.bytes.length`:

The PREVIEW output makes this a large tx, so its fee scales with the payload — size the funding target to it
(applyFee computes the exact fee afterwards; selection just needs to pick enough UTXOs). Mirrors createCollection.

## resolvePreview

```ts
export async function resolvePreview(
  provider: WalletProvider, publisherPubKeyHex: string, collectionId: string,
): Promise<(PreviewClip & { txId: string }) | null>
```

The latest preview clip a publisher has posted for a collection, or null. Verifies the PREVIEW was authored
 by `publisherPubKeyHex` (the collection's publisher key) — so a stranger can't inject a fake sample.

At `} catch {`:

best-effort

At `if (!heightByTx.has(txId)) heightByTx.set(txId, 0)`:

mempool / unconfirmed

At `} catch {`:

best-effort

At `const ordered = [...heightByTx.entries()]`:

Newest first: unconfirmed (height 0 → +inf), then descending block height.
