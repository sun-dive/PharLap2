# src/flacMeta.js

Extract embedded PICTURE blocks (cover art etc.) from a FLAC file's metadata, so the player can show the
artwork the artist embedded (e.g. via Kid3). FLAC layout: the "fLaC" marker, then a chain of metadata
blocks — each a 4-byte header (1 last-block flag bit, 7 type bits, 24 length bits, big-endian) + a body.
PICTURE is type 6. We read only the metadata at the start of the file (the audio frames follow), and are
fully bounds-checked — anything malformed yields []. All multi-byte integers are big-endian.

## FlacPicture

```ts
export interface FlacPicture { pictureType: number; mimeType: string; description: string; data: number[] }
```

## u32

```ts
function u32(b: number[], o: number): number
```

## parseFlacPictures

```ts
export function parseFlacPictures(bytes: number[]): FlacPicture[]
```

All PICTURE blocks in a FLAC byte array, in file order (front cover is pictureType 3, back cover 4).

At `if (bytes.length < 8 || bytes[0] !== 0x66 || bytes[1] !== 0x4c || bytes[2] !== 0x61 || bytes[3] !...`:

"fLaC"

## LYRIC_KEYS

```ts
const LYRIC_KEYS = new Set(['LYRICS', 'UNSYNCEDLYRICS', 'SYNCEDLYRICS', 'LYRICS-XXX'])
```

Read embedded lyrics from a FLAC's VORBIS_COMMENT block (type 4). Vorbis comments are "KEY=value" UTF-8
strings; lyrics live under LYRICS / UNSYNCEDLYRICS / SYNCEDLYRICS (the field Kid3 writes). Returns the first
match, preferring any value that carries [mm:ss.xx] LRC timestamps (synced) over a plain block. Note: Vorbis
comment lengths are LITTLE-endian — unlike every other big-endian field in FLAC. Fully bounds-checked → null.

## u32le

```ts
const u32le = (b: number[], o: number): number =>
```

## parseFlacLyrics

```ts
export function parseFlacLyrics(bytes: number[]): string | null
```

At `if (bytes.length < 8 || bytes[0] !== 0x66 || bytes[1] !== 0x4c || bytes[2] !== 0x61 || bytes[3] !...`:

"fLaC"

## readVorbisLyrics

```ts
function readVorbisLyrics(b: number[], start: number, end: number): string | null
```

At `o += 4 + u32le(b, o)`:

skip vendor string

At `if (/\[\d{1,2}:\d{1,2}/.test(val)) return val`:

synced (LRC) — prefer it outright

## parsePictureBlock

```ts
function parsePictureBlock(b: number[], start: number, end: number): FlacPicture | null
```

At `o += 16`:

width(4) height(4) depth(4) colors(4) — unused
