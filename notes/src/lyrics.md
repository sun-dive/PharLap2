# src/lyrics.js

Parse a lyric text block (extracted from an MP3 USLT frame or a FLAC LYRICS comment) for the player.
If any line carries one or more [mm:ss(.xx)] LRC timestamps, the result is SYNCED — one entry per
timestamp, sorted by time — for karaoke-style highlighting. Otherwise it's the plain non-empty lines
(t = -1). LRC metadata tags like [ti:…]/[ar:…]/[offset:…] are ignored (they aren't mm:ss). null = nothing.

## ParsedLyrics

```ts
export interface ParsedLyrics { synced: boolean; lines: { t: number; text: string }[] }
```

## parseLyrics

```ts
export function parseLyrics(raw: string | null): ParsedLyrics | null
```
