# src/bmc.js

BMC — a container (store-only ZIP + a bmc.json index) for a SET of BMF media files, minted as ONE
collection. Members stay individually referenceable by name: a BMF reference { tx: <setTxid>, name }
resolves to the member called <name>. This decodes the container so the player can pull a member out.
Only the store-only (no-deflate) ZIP that the BMC tool produces is supported — which is all that's minted.

## readStoreZip

```ts
export function readStoreZip(bytes: number[]): Record<string, number[]> | null
```

Read a store-only (no-deflate) ZIP → { filename: bytes }. Used by BMC sets and the mockup-bundle ingest.

At `while (i + 30 <= bytes.length && u32(i) === 0x04034b50) {`:

local file header

At `if (method !== 0) return null`:

store-only only

## isBmc

```ts
const isBmc = (b: number[]): boolean =>
```

## BmcMember

```ts
export interface BmcMember { name: string; file: string; mimeType: string; bytes: number[] }
```

"PK\x03\x04"

## BmcSet

```ts
export interface BmcSet { name: string; members: BmcMember[] }
```

## parseBmcSet

```ts
export function parseBmcSet(bytes: number[]): BmcSet | null
```

Parse decoded content as a BMC set → { name, members } or null (not a set).

## bmcMember

```ts
export function bmcMember(set: BmcSet, name: string): BmcMember | null
```

Pick a member from a set by its reference name (falls back to matching the file entry name).
