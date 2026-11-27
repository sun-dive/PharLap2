# src/refManifest.js

─── Reference manifest (content-by-pointer container) ───────────────────────────────────────────

A PharLap-native content file that, instead of EMBEDDING bytes, POINTS at content already minted
on-chain. It lets a new collection (e.g. an "EP") reference existing single mints by their genesis
txid + content fileHash — so the audio isn't re-uploaded; the player resolves each pointer and plays
the referenced works as an album. To the chain it is just "a file" (like the PLEP album container):
createEdition compresses/hash-commits the manifest exactly as any single file, so the covenant, the
TEMPLATE record, the mint path, and the provenance hash are ALL unchanged. The fileHash committed by
the covenant binds the pointer LIST (tamper-evident); each entry's `hash` binds the referenced CONTENT
(so a resolved single can be integrity-checked against what the EP author intended).

Layout:  "PREF" (4B magic) | version (1B) | headerLen (4B big-endian) | header JSON (utf8)
The header JSON is { v, refs: [{ i: collectionTxid, h: contentFileHash, n: name, m: mimeType }] }.
There are no trailing bytes — a manifest is pure pointers. headerLen is kept for forward-compat (a
future version could append data) and to mirror the PLEP framing.

## ManifestRef

```ts
export interface ManifestRef {
  /** Referenced collection's genesis (TX1) txid — where the content lives on-chain. */
  id: string
  /** The referenced content's fileHash (sha256 hex) — integrity bind for the resolved bytes. */
  hash: string
  /** Display name (e.g. track title / filename). */
  name: string
  /** Content mimeType (e.g. audio/flac). */
  mimeType: string
}
```

## VERSION

```ts
const VERSION = 1
```

"PREF"

## packManifest

```ts
export function packManifest(refs: ManifestRef[]): number[]
```

Pack reference entries into a single manifest byte array. Throws on empty/over-cap/malformed input.

## isManifest

```ts
export function isManifest(mimeType: string | null | undefined, bytes?: number[]): boolean
```

True if a mimeType marks a reference manifest, or the bytes begin with the PREF magic.

## parseManifest

```ts
export function parseManifest(bytes: number[]): ManifestRef[] | null
```

Unpack a manifest back into its references. Returns null if the bytes aren't a valid manifest (any
 malformed pointer rejects the whole manifest — a half-valid pointer list must not resolve silently).

At `const len = ((bytes[5] << 24) | (bytes[6] << 16) | (bytes[7] << 8) | bytes[8]) >>> 0`:

bytes[4] = version (only v1 today; future versions can branch here)

At `if (!HEX64.test(id) || !HEX64.test(hash)) return null`:

a bad pointer poisons the whole manifest
