# src/sceneTimeline.js

Resolve a video cue sheet into a scene timeline for the player. A cue sheet is LRC-style text whose lines are
[mm:ss.xx]scene-file.webp — i.e. the synced-lyrics format, where each "lyric" is a scene filename. We reuse the
lyrics engine to parse the timing, then match each filename against the album's packed files (exact path or
basename, case-insensitive). The caller turns each resolved name into bytes/an object URL.

## CueScene

```ts
export interface CueScene { t: number; name: string }
```

## resolveCue

```ts
export function resolveCue(cueText: string, available: string[]): CueScene[] | null
```

Parse + resolve a cue sheet against the available packed file names. Returns timed scene refs (the matched
 file's actual name, sorted by time — inherited from parseLyrics), or null if the cue isn't timed or none of
 its filenames match a packed file.

At `if (parsed == null || !parsed.synced) return null`:

a video cue sheet must carry timestamps

At `for (const a of available) {`:

later entries win, but names are expected unique within an album

At `byName.set(a.toLowerCase().replace(/^.*[/\\]/, ''), a)`:

also index by basename
