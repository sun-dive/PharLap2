# src/markerBackup.js

THE MARKER BACKUP: every transaction that brought this wallet a 1-sat marker or a token, held or spent,
kept whole, with its Merkle proof, so a restore reads the wallet's history only for what is newer than the backup.

A token's transaction pays its holder a 1-sat P2PKH marker, and the wallet finds the token through it. A
spent marker is no longer an unspent coin, and once its transaction is old enough the explorer's newest
history no longer names it either, so the token is lost to a restore. This record keeps the transactions
themselves, so finding a token never depends on a marker staying unspent or on an explorer's window.

⚠ Not every token comes with a 1-sat marker: a bought copy reaches the buyer's history through their change,
  and a holder fee is only a 1-sat output when the fee is 1 sat. ⇒ A transaction is recorded when it pays
  this wallet a 1-sat P2PKH output OR carries a token output this wallet owns.

★ Each record holds the whole transaction and, once it is confirmed, its Merkle proof: the path and the root
  of the block header it was checked against. A wallet holding these needs no explorer to read or prove its
  own history. The backup also carries the wallet's token list, so a restore needs no old transaction at all.

Kept in the browser and brought up to date on each use: the full history is listed (txids only), and only
transactions above the last height read, or unconfirmed, are fetched. Saved as a file to move to another
device. It holds transactions, proofs and the token list, never a key.

## READABLE_SCHEMAS

```ts
const READABLE_SCHEMAS = [1, 2]
```

Formats this reader accepts. Format 1 had no transactions, proofs or token list.

## MARKER_SATS

```ts
const MARKER_SATS = 1
```

The value of a marker output.

## CarriedToken

```ts
export interface CarriedToken {
  outputIndex: number
  kind: 'edition' | 'token'
  /** The collection id (TX1 txid). */
  collectionId: string
}
```

## MarkerRecord

```ts
export interface MarkerRecord {
  /** The transaction the marker or token arrived in. */
  txId: string
  /** Its 1-sat P2PKH outputs paying this wallet. */
  markerVouts: number[]
  /** Its token outputs this wallet owns. */
  carries: CarriedToken[]
  /** Block height when read; 0 = unconfirmed at the time. */
  height: number
  /** The whole transaction, hex. Checked against `txId` whenever it is read back. */
  rawHex?: string
  /** Its Merkle proof, once confirmed. Checked whenever it is read back. */
  proof?: MerkleProofEntry
}
```

## CardData

```ts
export interface CardData { mime: string | null; thumb: string | null }
```

What a holdings card shows for a collection, as the wallet had it cached: the content's file type (null: the
collection has no file) and a small thumbnail (an image data URL; null: none). Carried in the file only, so a
restore draws the cards without fetching each collection's first transaction.

## MarkerBackup

```ts
export interface MarkerBackup {
  schema: number
  address: string
  /** Every confirmed transaction below this height has been read. */
  readToHeight: number
  markers: MarkerRecord[]
  /** The wallet's token list when last saved: everything needed to show and spend each token. */
  tokens: StoredToken[]
  /** Card data per collection id. */
  cards?: Record<string, CardData>
}
```

## emptyMarkerBackup

```ts
export function emptyMarkerBackup(address: string): MarkerBackup
```

## TxLike

```ts
interface TxLike { outputs: Array<{ value?: number; script: Uint8Array }> }
```

## readMarkers

```ts
export function readMarkers(tx: TxLike, address: string, ownerPubKeyHex: string): { markerVouts: number[]; carries: CarriedToken[] }
```

What one transaction holds for this wallet: its 1-sat markers, and the token outputs it owns. Pure.

## provenFor

```ts
function provenFor(txId: string, proof: unknown): proof is MerkleProofEntry
```

A proof is kept only if it is for this transaction and its path reaches the root it names.

## rawFor

```ts
function rawFor(txId: string, rawHex: unknown): rawHex is string
```

A transaction is kept only if its bytes hash to the txid it is filed under.

## updateMarkerBackup

```ts
export async function updateMarkerBackup(
  provider: Pick<WalletProvider, 'getFullAddressHistory' | 'getSourceTransaction' | 'getMerkleProof'>,
  address: string, ownerPubKeyHex: string, prev: MarkerBackup,
): Promise<{ backup: MarkerBackup; added: number; fetched: number; proved: number }>
```

Bring the backup up to date. Lists the full history, fetches only what is above the last height read (the
top block is read again, in case a transaction in it was not yet listed) or unconfirmed, and records each
transaction that brought a marker or a token, whole. A transaction that cannot be fetched holds the height
read below its own, so it is tried again next time: the record never claims to have read what it has not.
Then every record still missing its transaction or, once confirmed, its proof, gets them; one that cannot
yet is tried again next time. Throws when the history cannot be listed; the caller keeps the backup it had.

At `if (blockHeight > 0 && blockHeight < prev.readToHeight) continue`:

read on an earlier use

At `try { m.rawHex = (await provider.getSourceTransaction(m.txId)).hex(); fetched++ } catch {`:

next time

At `} catch {`:

next time

## parseMarkerBackup

```ts
export function parseMarkerBackup(text: string): MarkerBackup
```

Parse a backup file, of this format or an earlier one. A transaction that does not hash to its txid, or a
proof that does not reach its root, is dropped rather than trusted; the next update fetches them again.
Throws with a reason a person can read.

At `thumb: typeof c.thumb === 'string' && THUMB_URL.test(c.thumb) ? c.thumb : null,`:

an image, or nothing

## richer

```ts
function richer(a: MarkerRecord, b: MarkerRecord): MarkerRecord
```

One record from two copies of it: the confirmed height, and whichever has the transaction and the proof.

## mergeMarkerBackups

```ts
export function mergeMarkerBackups(a: MarkerBackup, b: MarkerBackup): MarkerBackup
```

Join two backups of the same wallet: every transaction in either, each with the most either holds, every
token in either, and the higher height read, since each backup has read everything below its own. Throws if
they belong to different wallets.

## markerBackupFileName

```ts
export function markerBackupFileName(address: string, handle = '', when: Date = new Date()): string
```

The file name a backup is saved under: led by the wallet's handle when it has one, and ending with the
local date and time it was saved, since copying a file does not always keep its creation date. Letters
and digits of any script are kept in the handle; anything else becomes `-`, and a leading dot is dropped
so the file is never hidden. No colons, which some systems refuse in a file name.

## markerTxIds

```ts
export function markerTxIds(b: MarkerBackup): string[]
```

The transactions a scan should read, whatever the explorer's history says.

## heldTransactions

```ts
export function heldTransactions(b: MarkerBackup): Array<{ txId: string; rawHex: string }>
```

The transactions the backup holds whole, for a provider to serve without fetching them.
