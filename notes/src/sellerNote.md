# src/sellerNote.js

PHAR LAP seller-note — a seller's MUTABLE promo note for a collection (review, bonuses, redemption
instructions). PLAN.md Step 2 (D3): the note lives OUTSIDE the frozen edition covenant, so a reseller
can overwrite it freely; the latest one a seller publishes wins.

  PUBLISH  — the seller broadcasts a tiny tx with a NOTE output (locked to their own pubkey, keyed to
             the collection) + change. Because the funding/change touch the seller's address, the note
             is discoverable via that address's history (no indexer).
  RESOLVE  — given a seller's pubkey + collection, scan their address history newest-first and return
             the most recent matching NOTE. This runs in the same place the sales page resolves the
             seller's edition tip, so the storefront can show the current note to buyers.

Delivery to the buyer at purchase (riding on the replicate notification output) is handled by the
edition builder; this module owns the standalone publish + resolve.

⚠⚠ "MUTABLE" IS A PROPERTY OF THE RESOLVER, NOT OF THE CHAIN. Nothing is ever overwritten — every note
  a seller has published is still there, and `resolveSellerNote` simply returns the newest. ⇒ A seller
  who publishes a correction has not removed the original; the wallet must never imply otherwise.

## MAX_NOTE_BYTES

```ts
export const MAX_NOTE_BYTES = 3072
```

Cap the note so it stays cheap and rides comfortably on the notification/propagation output. Raised
 280→560 (2026-06-26), 560→2048 (2026-07-05), then 2048→3072 (2026-07-08) to fit a full listing "story" +
 terms with room to spare: the extra bytes per resale are negligible on BSV, and the full text is on-chain +
 search-engine-indexable even when the UI truncates the visible portion. (Pre-written notes are kept ≤2 KB
 so the seller has ~1 KB of headroom to edit before hitting the cap.)

## MAX_HISTORY_SCAN

```ts
const MAX_HISTORY_SCAN = 30
```

Bound how far back we scan a seller's history looking for their latest note.

## utf8Len

```ts
function utf8Len(s: string): number
```

## SellerNote

```ts
export interface SellerNote {
  text: string
  /** Seller-authored listing heading (updatable; distinct from the immutable collection title). */
  heading?: string
  /** Category tags (slug-like, no leading '#'). */
  tags?: string[]
  bonusKind?: BonusKind
  bonusValue?: string
}
```

A resolved seller note: a listing heading + description (text) + tags + optional buyer bonus.

## MAX_HEADING_BYTES

```ts
const MAX_HEADING_BYTES = 120
```

Bound the heading / joined tags so the note stays small enough to ride on a notification output.

## noteHasContent

```ts
export function noteHasContent(n: SellerNote): boolean
```

True if a note carries anything worth recording/propagating (description, heading, tags, or a bonus).

## publishSellerNote

```ts
export async function publishSellerNote(
  provider: WalletProvider, key: Signer, collectionId: string, note: SellerNote,
): Promise<string>
```

Publish (or overwrite) the seller's note for a collection, with an optional bonus. Returns the note tx id.

At `const selected = selectFunding(await getSafeUtxos(provider), PHARLAP_OUTPUT_SATS + 500)`:

⚠ THE +500 IS THE DEPLOYED HEADROOM AND IS DELIBERATELY NOT THE +600 `broadcast.js` USES. Each was
  sized against its own record, and a note is capped far larger. Left alone rather than harmonised:
  the fee is computed from the real signed size below, so the only thing this figure decides is how
  many UTXOs get pulled in.

At `const funding = selected.map(u => ({ utxo: u }))`:

⚠ The deployed version also fetched each funding input's SOURCE TRANSACTION here, because the removed
  library's unlocking template needed the parent to find the amount. We sign BIP-143, which commits
  the amount directly, so the parent is never needed — one network round trip per input, gone.

## readNoteFromTx

```ts
export function readNoteFromTx(tx: Tx, collectionId: string): SellerNote | null
```

Read a note that rode IN on a transaction (the on-chain echo carried by a sale/transfer), for a given
collection — used for hands-off propagation: when a holder resells, the note attached to the tx that
gave them their edition is re-attached to the new sale unless they've published their own.

## resolveSellerNote

```ts
export async function resolveSellerNote(
  provider: WalletProvider, sellerPubKeyHex: string, collectionId: string,
): Promise<(SellerNote & { txId: string }) | null>
```

The latest note a seller has published for a collection, or null.

At `const sellerAddress = addressFromPubHex(sellerPubKeyHex)`:

⚠ NORMALISED: an uncompressed key must resolve to the COMPRESSED key's address, or the scan looks
  somewhere the seller has never posted and finds nothing — a silent empty result, not an error.

At `const heightByTx = new Map()`:

Candidates: confirmed history (with heights) UNIONed with mempool-aware txids (the just-published
note's change output surfaces here before `/history` indexes it). Unconfirmed → height 0 → ranked newest.

At `} catch {`:

best-effort

At `if (!heightByTx.has(txId)) heightByTx.set(txId, 0)`:

mempool / unconfirmed

At `} catch {`:

best-effort

At `const ordered = [...heightByTx.entries()]`:

Newest first: unconfirmed (height 0 → +inf), then descending block height.

At `const seller = sellerPubKeyHex.toLowerCase()`:

⚠⚠ MATCHED BY RAW HEX, WHICH IS NOT WHAT THE ADDRESS ABOVE WAS DERIVED FROM. The same inconsistency
  is pinned in `broadcast.js`: an uncompressed caller scans exactly the right address and then
  matches no record. ⛔ Preserved rather than fixed — normalising this would change which records the
  application considers its own, and that is a decision, not a tidy-up.
