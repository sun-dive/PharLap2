# src/keystore.js

The wallet's secret at rest: the WIF and, for a seed wallet, its words, kept SEALED (AES-GCM) under a
non-extractable AES key made in this browser, both in one IndexedDB record. The key can be used only by code
running in this site's pages, and no script can read it out as bytes; a copy of the record taken anywhere
else is locked bytes.

⚠ What the seal cannot stop: a script running in the page opens it, as the page does. secp256k1 has no
  WebCrypto form, so the signing key is plain in memory while the wallet is open. And a copy of the browser's
  profile files holds the AES key beside the sealed bytes, so it opens them; Safari alone keeps the AES key
  under one of its own, in the Keychain.

## WALLET

```ts
export const WALLET = 'wallet'
```

The open wallet's record. Others are named by the caller (a wallet set aside, kept and never deleted).

## Secret

```ts
export interface Secret {
  wif: string
  /** The BIP-39 words, or null for a wallet imported from a WIF. */
  words: string | null
}
```

## UNREADABLE

```ts
export const UNREADABLE = 'unreadable'
```

A record is saved here but the browser will not open it. ⛔ Nothing may then be written over it unasked.

## openDb

```ts
function openDb(): Promise<IDBDatabase>
```

## idb

```ts
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T>
```

One request in its own transaction. ⚠ A WRITE IS DONE WHEN ITS TRANSACTION COMMITS, not when its request
succeeds: a transaction can still abort after that and keep nothing. Safari does exactly this with a key it
cannot store. So reads resolve on the request, writes on `complete`, and an abort is an error.

## loadSecret

```ts
export async function loadSecret(id = WALLET): Promise<Secret | null | typeof UNREADABLE>
```

The sealed secret, null when none is saved, or UNREADABLE when one is saved and will not open: Safari reads a
record back as null, with no error, when it cannot use the Keychain key it stored it under. Throws when this
browser has no usable IndexedDB.

## saveSecret

```ts
export async function saveSecret(secret: Secret, id = WALLET): Promise<void>
```

Seal and save, replacing what was there. Done only once it reads back and opens to the same secret; otherwise
throws, and the caller keeps its own copy.

## forgetSecret

```ts
export async function forgetSecret(): Promise<void>
```

Remove the open wallet's sealed secret. Done once the delete commits.

## keepStorage

```ts
export async function keepStorage(): Promise<boolean | null>
```

Ask the browser to keep this site's storage rather than evict it when the disk runs short. It covers all of the
site's storage, localStorage too. Chromium grants it quietly to a site in use, Firefox asks once, Safari decides
by its own rules. True when kept, false when refused, null where the browser cannot say.
