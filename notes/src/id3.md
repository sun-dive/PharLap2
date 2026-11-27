# src/id3.js

Extract embedded picture frames (cover art) from an MP3's ID3v2 tag, so the player shows MP3 cover art the
same way it does FLAC PICTURE blocks. ID3v2 sits at the START of the file: a 10-byte header ("ID3", 2 version
bytes, flags, then a 4-byte SYNCSAFE size) followed by frames. The picture frame is "APIC" (v2.3/v2.4) or
"PIC" (v2.2). Fully bounds-checked + defensive — anything unexpected yields []. Supports v2.2/2.3/2.4; bails
on unsynchronised tags (rare). Frame sizes: v2.2 = 3-byte plain, v2.3 = 4-byte plain, v2.4 = 4-byte syncsafe.

## Id3Picture

```ts
export interface Id3Picture { pictureType: number; mimeType: string; data: number[] }
```

## syncsafe

```ts
const syncsafe = (b: number[], o: number): number =>
```

## u32

```ts
const u32 = (b: number[], o: number): number =>
```

## u24

```ts
const u24 = (b: number[], o: number): number =>
```

## latin1

```ts
const latin1 = (b: number[], s: number, e: number): string =>
```

## normalizeMime

```ts
function normalizeMime(m: string): string
```

## skipDescription

```ts
function skipDescription(b: number[], o: number, end: number, encoding: number): number
```

Skip a null-terminated description; UTF-16 (encoding 1/2) terminates on a 00 00 pair.

## parseApic

```ts
function parseApic(b: number[], start: number, end: number): Id3Picture | null
```

## parsePic

```ts
function parsePic(b: number[], start: number, end: number): Id3Picture | null
```

v2.2 "PIC": encoding(1) + 3-char image format + picture type(1) + description + data.

## decodeText

```ts
function decodeText(b: number[], start: number, end: number, encoding: number): string
```

Decode a text region by ID3 text encoding: 0 = Latin-1, 1 = UTF-16 (with BOM), 2 = UTF-16BE, 3 = UTF-8.

At `} catch {`:

fall through to Latin-1

## parseId3Lyrics

```ts
export function parseId3Lyrics(bytes: number[]): string | null
```

"USLT" (v2.3/2.4) / "ULT" (v2.2) unsynchronised-lyrics frame: encoding(1) + language(3) + null-terminated
content descriptor + the lyric text (may be LRC, i.e. lines prefixed with [mm:ss.xx] timestamps). Returns the
first non-empty lyric text found, or null. Same defensive, bounds-checked frame walk as parseId3Pictures.

At `if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null`:

"ID3"

At `if ((flags & 0x80) !== 0) return null`:

unsynchronised tag — skip (rare)

At `if (bytes[o] === 0) break`:

padding

At `const encoding = bytes[p]; p += 1 + 3`:

encoding + 3-byte language

## parseId3Pictures

```ts
export function parseId3Pictures(bytes: number[]): Id3Picture[]
```

At `if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return []`:

"ID3"

At `if ((flags & 0x80) !== 0) return []`:

unsynchronised — would need de-unsync first; skip (rare)

At `if ((flags & 0x40) !== 0) {`:

extended header — skip it

At `o += major >= 4 ? syncsafe(bytes, o) : u32(bytes, o) + 4`:

v2.4 size includes itself; v2.3 size excludes the 4 size bytes

At `if (bytes[o] === 0) break`:

padding
