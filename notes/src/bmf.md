# src/bmf.js

─── Block Media Format (BMF) manifest ───────────────────────────────────────────────────────────

A BMF manifest is the "recipe" for a composable video: a timeline that references media components
(by on-chain txid, or by local name inside a .bmc) with start-time cues. See the spec at
github.com/sun-dive/block-media-format. This parses both interchangeable encodings:

  • JSON  — the pure on-chain form, carrying txid references:
      { "bmf": 0, "audio": { "tx": "<txid>", "name": "supersonic.flac" }, "tempo": 110,
        "scenes": [ { "t": 0.0, "tx": "<txid>", "name": "scene-01.webp" }, … ] }
  • Cue   — LRC-compatible: `[mm:ss.cc]<name>` lines + optional `# key: value` headers.

The player resolves each `tx` from chain (raw tx → the minted component's bytes) and sequences the
scenes to the audio — a clip placed at N moments is one stored component + N cue lines. Reuse is free.

## BmfRef

```ts
export interface BmfRef { t: number; tx: string | null; name: string }
```

## BmfManifest

```ts
export interface BmfManifest {
  audio: { tx: string | null; name: string } | null
  tempo: number | null
  license: string | null       // reuse terms declared by the author, e.g. "CC BY 4.0"
  attribution: string | null   // who to credit, e.g. "Evidnus"
  scenes: BmfRef[]
}
```

## toTxid

```ts
function toTxid(s: unknown): string | null
```

A reference may be a bare txid or an outpoint "txid:vout" — we resolve at the collection (genesis) txid.

## fmtLrcTime

```ts
export function fmtLrcTime(sec: number): string
```

LRC time "mm:ss.cc" (centiseconds) — the cue timestamp format the player already understands.

## isBmf

```ts
export function isBmf(mimeType: string | null | undefined, bytes?: number[]): boolean
```

True if the mimeType/bytes look like a BMF manifest (JSON with a "bmf" key, or a cue with a bmf header).

At `if (head.startsWith('{') && /"bmf"\s*:/.test(head)) return true`:

JSON form

At `if (/^#\s*bmf\s*:/im.test(head)) return true`:

cue form with a `# bmf:` header

## parseBmf

```ts
export function parseBmf(bytes: number[]): BmfManifest | null
```

Parse a BMF manifest (JSON or cue) into audio + timed scenes. Returns null if it isn't a usable manifest.

At `const scenes = []`:

Cue form: `[mm:ss.cc]name` scene lines + `# audio:`/`# tempo:`/`# license:`/`# attribution:` headers.
