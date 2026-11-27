# src/album.js

─── Album container (multi-track release packed into ONE content file) ──────────────────────────

A PharLap-native container that bundles several tracks (or any files) into a SINGLE blob, so a
multi-track release (e.g. a music EP) can be minted as one edition NFT WITHOUT changing the on-chain
transaction format, the covenant, the TEMPLATE record, or the provenance hash. To the chain it is just
"a file": createEdition compresses/encrypts and hash-commits the whole container exactly as it does any
single file, so the entire release is one immutable, timestamped, verifiable blob. The wallet packs it
at mint and unpacks it in the viewer to show a tracklist with an inline player per track.

Layout:  "PLEP" (4B magic) | version (1B) | headerLen (4B big-endian) | header JSON (utf8) | track bytes…
The header JSON is { v, tracks: [{ n: name, m: mimeType, l: byteLength }] }; track bytes follow in order,
sliced by their lengths (no offsets needed). Everything is plain bytes — no external zip dependency.

## MAX_ALBUM_TRACKS

```ts
export const MAX_ALBUM_TRACKS = 64
```

A "release" can be more than an album's worth of tracks: a scene-timeline music video packs the audio + the
cue sheet + many scene clips into one container, so the cap covers that (the real limit is total byte size,
which the mint fee + fidelity warnings already surface). Header stays tiny even at this count.

## AlbumTrack

```ts
export interface AlbumTrack { name: string; mimeType: string; bytes: number[] }
```

## VERSION

```ts
const VERSION = 1
```

"PLEP"

## packAlbum

```ts
export function packAlbum(tracks: AlbumTrack[]): number[]
```

Pack tracks into a single album-container byte array. Throws on empty/over-cap input.

## isAlbum

```ts
export function isAlbum(mimeType: string | null | undefined, bytes?: number[]): boolean
```

True if a mimeType marks an album container, or the bytes begin with the PLEP magic.

## parseAlbum

```ts
export function parseAlbum(bytes: number[]): AlbumTrack[] | null
```

Unpack an album container back into its tracks. Returns null if the bytes aren't a valid container.

At `const len = ((bytes[5] << 24) | (bytes[6] << 16) | (bytes[7] << 8) | bytes[8]) >>> 0`:

bytes[4] = version (only v1 today; future versions can branch here)
