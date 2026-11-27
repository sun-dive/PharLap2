# src/broadcast.js

PHAR LAP publisher broadcast ("Updates") — the pull/announcement channel (PLAN.md Addendum E).

A publisher posts ONE public message anchored to a collection, locked to their OWN pubkey (the TX1
template lock key). Holders PULL it: they scan the publisher's address for `RECORD_MESSAGE` records
referencing a collection they hold, and read them. One flat-cost tx reaches every current holder, the
publisher needs no holder list, and free transfers don't break delivery (holders pull by collection).

Public-only by design: a single broadcast can't be ECIES-encrypted to all holders at once. Private
1:1 messages remain the (encrypted) job of messageCodec + the Messages tab.

Mirrors sellerNote.ts (publish a collection-keyed record to your address; others resolve by scanning
it) — but uses RECORD_MESSAGE from the publisher and returns the full history, newest-first.

## MAX_BROADCAST_BYTES

```ts
export const MAX_BROADCAST_BYTES = 480
```

Cap an announcement so it stays cheap and comfortably on one output.

## MAX_BROADCAST_SCAN

```ts
const MAX_BROADCAST_SCAN = 50
```

Bound how far back we scan a publisher's history for their announcements.

## Broadcast

```ts
export interface Broadcast {
  text: string
  txId: string
  /** Block height of the announcement tx (0 = unconfirmed/newest) — orders the feed. */
  height: number
  /** Publisher's self-asserted alias (if attached) — display + capture as a contact. */
  senderAlias?: string
}
```

A resolved publisher announcement.

## publishBroadcast

```ts
export async function publishBroadcast(
  provider: WalletProvider, key: Signer, collectionId: string, text: string, senderAlias?: string,
): Promise<string>
```

Publish a PUBLIC announcement to all holders of a collection: a single `RECORD_MESSAGE` keyed to the
collection, locked to the publisher's own pubkey. Returns the tx id. Only the real publisher's address
is ever scanned by holders, so this self-gates (an impostor's "broadcast" is never pulled).

At `const envelope = await buildEnvelope({`:

Public envelope (encrypt:false → recipientPubKeyHex is unused; anyone can read it).

At `tx.outputs.push({`:

Locked to the publisher's own pubkey + keyed to the collection → discoverable on the publisher's address.

## resolveBroadcasts

```ts
export async function resolveBroadcasts(
  provider: WalletProvider, publisherPubKeyHex: string, collectionId: string,
): Promise<Broadcast[]>
```

Pull every public announcement a publisher has posted for a collection, newest-first. A broadcast is a
RECORD_MESSAGE that is locked to the publisher AND sent by the publisher (self-locked) AND keyed to the
collection — which cleanly distinguishes it from DMs the publisher may have received.

At `const address = addressFromPubHex(publisherPubKeyHex)`:

⚠ NORMALISED: an uncompressed key must resolve to the COMPRESSED key's address, or the scan looks
  somewhere the publisher has never posted and simply finds nothing.

At `} catch {`:

best-effort

At `if (!heightByTx.has(txId)) heightByTx.set(txId, 0)`:

mempool / unconfirmed

At `} catch {`:

best-effort

At `const ordered = [...heightByTx.entries()]`:

Newest first (unconfirmed → top), capped so a busy publisher address stays cheap to scan.

At `if (m.recipientPubKeyHex.toLowerCase() !== publisher) continue`:

locked to the publisher

At `if (m.fields.ref.toLowerCase() !== want) continue`:

for this collection

At `if (opened == null || opened.senderPubKeyHex.toLowerCase() !== publisher) continue`:

sent by the publisher
