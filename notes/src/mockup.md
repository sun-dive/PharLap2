# src/mockup.js

─── Mockup cover manifest + prop descriptor codec ───────────────────────────────────────────────

A product cover (a design shown on a tee / mug / tote…) is a RECIPE, not a baked image: a reusable
prop atom + a design + a little placement, composited in the browser. See docs/MOCKUP-SPEC.md.

This module is the format layer, shared by every app: Pole Position AUTHORS covers; PHAR LAP and Big
Red READ them to render. Two encodings interconvert:
  • PACKED bytes — the on-chain form (primary). Two 32-byte txids dominate; everything else quantizes
    to ≤2 bytes and defaults are omitted via flags → a minimal cover is 66 bytes. Hashes don't compress,
    so the record is stored raw (compress-if-smaller only helps content, never this — see the spec).
  • JSON shorthand — for authoring / interop: { v, p, d, P:[x,y,scale,rot], w:[{t,…}] }.

## HEX64

```ts
const HEX64 = /^[0-9a-f]{64}$/i
```

'M'

## FLAG_PLACE

```ts
const FLAG_PLACE = 0x01           // a place block follows
```

FLAGS byte (see §5). Defaults are omitted via these bits so the common cover is just header + refs.

## FLAG_WARP

```ts
const FLAG_WARP = 0x02            // a warp block follows
```

a place block follows

## FLAG_PROP_IDX

```ts
const FLAG_PROP_IDX = 0x04        // prop is a u16 set-index, not a 32-byte txid
```

a warp block follows

## FLAG_DESIGN_IDX

```ts
const FLAG_DESIGN_IDX = 0x08      // design is a u16 set-index, not a 32-byte txid
```

prop is a u16 set-index, not a 32-byte txid

## FLAG_DESIGN_EMBEDDED

```ts
const FLAG_DESIGN_EMBEDDED = 0x10 // no design ref at all — the design IS the product's...
```

design is a u16 set-index, not a 32-byte txid

## RATIOS

```ts
export const RATIOS = [
```

no design ref at all — the design IS the product's own storefront cover

─── canonical socket ratios (frozen ids — see spec §2) ──────────────
A design is a plain image; its pixel dimensions classify it into ONE of these ratios, and it composites only
onto props whose socketRatio matches. Order is FROZEN — the index is the on-chain socket id. Fewer ratios =
one sample reuses across more props (that's the whole point of the prop/design split).

At `{ id: 0, name: '1:1', w: 1, h: 1 },`:

square — tote, sticker, mug (centred), matted poster, phone (centred)

At `{ id: 1, name: '4:5', w: 4, h: 5 },`:

portrait — apparel fronts, posters

At `{ id: 2, name: '2:3', w: 2, h: 3 },`:

tall portrait — art prints, posters

At `{ id: 3, name: '16:9', w: 16, h: 9 },`:

wide landscape — banners, laptop skins, mug wraps

At `{ id: 4, name: '9:16', w: 9, h: 16 },`:

tall — phone cases, story format

## ratioOf

```ts
export function ratioOf(width: number, height: number): number
```

Classify pixel dimensions into the nearest canonical ratio id (nearest by log-aspect, so 3:4≈4:5 etc.).

## ratioDims

```ts
export function ratioDims(id: number): { w: number; h: number }
```

Ratio id → { w, h } for laying out a print box / display frame.

## Enc

```ts
type Enc = 'u8' | 'i8' | 'unit' | 'sunit' | 'deg' | 'q4'
```

─── warp registry (frozen ids — see spec §3) ────────────────────────
Each stage packs as [typeId:u8, plen:u8, plen param bytes]. Known types have a fixed param schema
(name → quantization); unknown/variable types (mesh/fold/ext) round-trip via raw param bytes.

## SIGNED

```ts
const SIGNED: Record<Enc, boolean> = { u8: false, i8: true, unit: false, sunit: true, d...
```

## WARP_TYPES

```ts
export const WARP_TYPES = [
```

id → type name. Index is the on-chain id; order is FROZEN.

## WARP_ID

```ts
const WARP_ID: Record<string, number> = Object.fromEntries(WARP_TYPES.map((t, i) => [t,...
```

## WARP_SCHEMA

```ts
const WARP_SCHEMA: Record<string, [string, Enc][]> = {
```

Fixed param schema per known type (name, quantization). Absent from this table ⇒ raw-bytes round-trip.

At `}`:

mesh, fold, ext: variable-length → carried as `raw` bytes on the stage.

## WarpStage

```ts
export interface WarpStage {
  t: string
  /** Named params (present for known types after decode). */
  [param: string]: number | string | number[] | undefined
  /** Raw param bytes for variable/unknown types (mesh/fold/ext). */
  raw?: number[]
}
```

## Ref

```ts
export interface Ref { tx: string | null; index: number | null }
```

## MockupCover

```ts
export interface MockupCover {
  version: number
  prop: Ref
  /** The design reference — or null when the design is EMBEDDED (it's the product's own storefront cover, so no
   *  ref is stored). Embedded is the TeeStrip product case; a ref is used when the design is a shared atom. */
  design: Ref | null
  /** Placement within the prop's print region. null = fill the region (identity). */
  /** Placement of the design within the base: centre x,y and scale (all normalized to the base), rotation°, an
   *  affine skew (parallelogram tilt for an angled surface), and the fabric-shading strength (0..1 — how strongly
   *  the prop's own shadows multiply over the print). null = fill the print region. */
  place: { x: number; y: number; scale: number; rot: number; skewX: number; skewY: number; fabric: number } | null
  /** Warp override. null = inherit the prop's default warp. */
  warp: WarpStage[] | null
}
```

## TAG_PROP

```ts
const TAG_PROP = 0x50
```

─── on-chain PROP manifest (TLV blocks — extensible; see spec §6) ───
The prop's own record (rides RECORD_MOCKUP on the PROP mint). A stream of tagged blocks: [id:u8, len:u8
(0xFF→u16), value]. A parser reads the ids it knows and SKIPS any unknown id by its length — so a prop minted
later with new params still renders on old code, and old props render on new code. New params = new ids, never
a format break. Distinct TAG (0x50 'P') from a cover (0x4D 'M').

## PROP_FIELD

```ts
export const PROP_FIELD = {
```

Field ids — FROZEN, additive. 0x0C–0xFE reserved for future params (wrinkle, exclusion zones, light…).

## PropManifest

```ts
export interface PropManifest {
  version: number
  /** Socket ratio id (index into RATIOS) — the design aspect this prop accepts. */
  ratio: number
  /** Fabric-shading strength 0..1. */
  fabric: number
  /** Print box on the base (centre x,y + scale, all normalized; rotation°, affine skew). null = fill/identity. */
  place: { x: number; y: number; scale: number; rot: number; skewX: number; skewY: number } | null
  /** 4-corner perspective quad on the base (alt/added to place). null = none. */
  quad: [number, number][] | null
  /** Warp pipeline. null = none. */
  warp: WarpStage[] | null
  /** Displacement / contour map atom (txid) + strength 0..1 — bends the print to the surface (e.g. shirt folds). */
  disp: { tx: string; str: number } | null
  /** Print-area mask atom (txid). */
  mask: string | null
  /** Baked shade/AO map atom (txid). */
  shade: string | null
  /** Physical print size in mm. */
  dims: { wmm: number; hmm: number } | null
  name: string | null
  /** Auto fabric-contour strength in px (0/absent = off) — the fold map is DERIVED from the prop's own base image
   *  (server-side, no map atom); the design displaces by this much. Tunable per prop/fabric. Optional (additive). */
  contour?: number | null
  /** Unknown blocks, preserved verbatim for forward-compatible round-trips. */
  ext?: { id: number; data: number[] }[]
}
```

## PropDescriptor

```ts
export interface PropDescriptor {
  version: number
  /** Socket ratio id (index into RATIOS) — the design aspect this prop accepts. A design composites onto this
   *  prop only when ratioOf(design) === ratio. This is the whole reuse contract: prop owns geometry, design is a
   *  plain image of the matching shape. */
  ratio: number
  /** Print-region quad on the base, normalized (4 [x,y] corners). */
  print: [number, number][]
  warp: WarpStage[]
  /** Fabric-shading strength (0..1) — how strongly the prop's own shadows multiply over the print. A PROP
   *  property (belongs with the prop, not the design). */
  fabric: number
  roles: { base?: string; mask?: string; shade?: string; disp?: string }
  meta?: { name?: string; wmm?: number; hmm?: number }
}
```

## class W

```ts
class W
```

─── tiny byte writer / reader ───────────────────────────────────────

## clamp

```ts
const clamp = (v: number, lo: number, hi: number) =>
```

## hexToBytes

```ts
function hexToBytes(hex: string): number[]
```

## bytesToHex

```ts
function bytesToHex(b: number[]): string
```

## utf8ToBytes

```ts
function utf8ToBytes(s: string): number[]
```

## bytesToUtf8

```ts
function bytesToUtf8(b: number[]): string
```

## encParam

```ts
function encParam(enc: Enc, v: number): number
```

## decParam

```ts
function decParam(enc: Enc, byte: number): number
```

## packWarp

```ts
function packWarp(stages: WarpStage[]): number[]
```

─── warp pipeline pack / parse ──────────────────────────────────────

## parseWarp

```ts
function parseWarp(r: R): WarpStage[]
```

At `r.i = start + plen`:

Skip any trailing bytes the writer added beyond the known schema.

## packCover

```ts
export function packCover(c: MockupCover): number[]
```

─── cover manifest: packed bytes ────────────────────────────────────

## parseCover

```ts
export function parseCover(bytes: number[]): MockupCover | null
```

Parse a packed cover record. Returns null if it isn't one.

At `r.u8()`:

TAG

## isMockup

```ts
export function isMockup(mimeType: string | null | undefined, bytes?: number[]): boolean
```

## isProp

```ts
export function isProp(bytes?: number[] | null): boolean
```

True if these bytes are a packed PROP manifest (TAG 0x50), vs a cover (0x4D).

## putBlock

```ts
function putBlock(w: W, id: number, val: number[]): void
```

─── prop manifest: packed TLV bytes (extensible) ────────────────────

Write one TLV block: [id, len (0xFF→u16), value].

## packProp

```ts
export function packProp(p: PropManifest): number[]
```

## parseProp

```ts
export function parseProp(bytes: number[]): PropManifest | null
```

Parse a packed prop manifest. Unknown block ids are preserved in `ext` and skipped by length. Null if not one.

At `r.u8()`:

TAG

At `r.i = start + len`:

advance EXACTLY len — skip-unknown, and tolerant of a block longer than the known schema

## refFromJson

```ts
function refFromJson(x: unknown): Ref
```

─── cover manifest: JSON shorthand (authoring / interop) ────────────

## refToJson

```ts
function refToJson(r: Ref): string | number
```

## warpFromJson

```ts
function warpFromJson(w: unknown): WarpStage[]
```

## coverFromJson

```ts
export function coverFromJson(obj: Record<string, unknown>): MockupCover
```

At `design: obj.d == null ? null : refFromJson(obj.d),`:

absent/null d = embedded (the storefront cover)

## coverToJson

```ts
export function coverToJson(c: MockupCover): Record<string, unknown>
```

## propFromJson

```ts
export function propFromJson(obj: Record<string, unknown>): PropDescriptor | null
```

─── prop descriptor (rides in the .bmc as readable JSON) ────────────

## propToJson

```ts
export function propToJson(p: PropDescriptor): Record<string, unknown>
```
