# src/mockupIngest.js

Mockup-bundle ingest — read a Pole Position mockup `.bmc` bundle and turn its recipe into a packed cover
manifest for minting. The bundle is a store-only ZIP: base.webp + design.webp (+ optional mask/shade/disp)
+ a readable mockup.json recipe. See PolePosition docs/MOCKUP-SPEC.md and public/mockup-author.js.

The pure pieces live here (read + map, unit-testable). The network orchestration — mint the prop atom once,
then mint the product with this manifest — is driven by the app (it needs the wallet/provider).

## MockupRecipe

```ts
export interface MockupRecipe {
  v?: number
  prop?: { name?: string; roles?: Record<string, string>; warp?: WarpStage[] }
  design?: string
  /** MIME of the sellable design master (full-res, original format — a PoD-quality PNG/JPEG/WebP). */
  designMime?: string
  /** Placement in the authoring stage (= base aspect), normalized: centre cx,cy + size w,h + rot° + skew. */
  place?: { cx: number; cy: number; w: number; h: number; rot: number; skewX: number; skewY: number }
  fabric?: number
  /** Auto fabric-contour strength in px (0/undef = off) — the fold map is derived server-side from the base. */
  contour?: number
  /** Reuse an already-published prop by txid (from Pole Position's Prop catalogue) — mints the design only, no new
   *  prop atom. The form's "Reuse a prop" field overrides this if filled. */
  propTxid?: string
}
```

The recipe emitted by Pole Position's mockup export (mockup.json).

## MockupBundle

```ts
export interface MockupBundle {
  base: number[]
  design: number[]
  /** MIME of the design master — its original full-res format (image/png keeps lossless + alpha for PoD). */
  designMime: string
  maps: { mask?: number[]; shade?: number[]; disp?: number[] }
  recipe: MockupRecipe
}
```

## mimeFromName

```ts
function mimeFromName(name: string): string
```

Best-effort MIME from a bundle filename (the design keeps its original format for PoD quality).

## readMockupBundle

```ts
export function readMockupBundle(zipBytes: number[]): MockupBundle | null
```

Parse a mockup `.bmc` bundle into its images + recipe, or null if it isn't one.

## bundleToPropManifest

```ts
export function bundleToPropManifest(recipe: MockupRecipe, ratio: number): PropManifest
```

Map a bundle's recipe → the PROP's packed manifest (rides RECORD_MOCKUP on the PROP mint). The prop is the
self-describing atom: it owns the geometry (print box + warp + fabric) and its socket `ratio` (which design
shapes it accepts). A design is a plain image — no geometry — that composites onto any prop of its ratio.
The recipe's normalized centre/size/rot/skew becomes the prop's print box; the renderer derives the box height
from the design's aspect at render time, so only the width (scale) is stored.

## productCoverPointer

```ts
export function productCoverPointer(propTxid: string): number[]
```

The PRODUCT's cover manifest = just a POINTER to the prop (design embedded = the product's own preview cover).
 Geometry is inherited from the prop's own manifest — the product carries none. ~35 bytes.

At `design: null,`:

embedded — the product's storefront preview cover

At `place: null,`:

geometry lives on the prop now

## ImagePayload

```ts
export interface ImagePayload { mimeType: string; bytes: number[] }
```

An image payload for a mint (mimeType + bytes; fileName is filled in).

## mintMockupProduct

```ts
export async function mintMockupProduct(provider: WalletProvider, key: Signer, opts: {
  base: number[]
  cleanDesign: ImagePayload
  previewDesign: ImagePayload
  recipe: MockupRecipe
  /** Reuse an existing prop by txid; omit to mint the prop from `base` (which then carries its own manifest). */
  propTxid?: string
  propName?: string
  /** Socket ratio id (RATIOS index) for a NEWLY minted prop — the design shape it accepts. Ignored when reusing
   *  a prop (the prop already carries its own manifest on chain). Caller derives it via ratioOf(design dims). */
  ratio?: number
  productName: string
  description?: string
  encrypt?: boolean
  license?: string
  /** Capped supply / tier: 1 = exclusive, N = limited. */
  supply?: number
  /** Covenant tier: when set, the PRODUCT mints as a covenant edition (trustless permissionless resale +
   *  publisher/holder fees), instead of a plain capped token. The prop stays a plain referenced asset. */
  covenant?: { terms: EditionTerms }
  feePerKb?: number
  confirmSpend?: (totalSats: number) => boolean | Promise<boolean>
}): Promise<{
  propTxid: string
  productTxid: string
  /** Covenant tier: the minted editions (with lockHex) — store via storeEdition for the onboard flow. */
  editions?: Array<{ txId: string; outputIndex: number; lockHex: string }>
  /** Plain tier: the minted token outpoints — store via the plain token index. */
  tokenOutpoints?: Array<{ txId: string; outputIndex: number }>
}>
```

Orchestrate a mockup product mint (network). Two mints:
  1. PROP — the base image as a public reusable collection → its txid (skipped if `propTxid` is supplied to
     reuse an existing prop; that's the whole point — mint a prop once, reference it forever).
  2. PRODUCT — the CLEAN design encrypted in the FILE (what the buyer gets), the PREVIEW design as the public
     storefront cover, the licence + tier, and the packed mockup manifest pointing at the prop.
v1 mints the product on the plain capped-supply path (Limited/Exclusive); base-only props (procedural warp,
e.g. a mug) — map-bearing props (a `.bmc` of base+maps) are a later addition.

At `const prop = await createCollection(provider, key, {`:

Mint the prop as a self-describing atom: the base image + its OWN packed manifest (geometry + socket ratio).

At `const manifest = productCoverPointer(propTxid)`:

The product carries only a POINTER to the prop; geometry is inherited from the prop's own manifest.

At `const dExt = opts.cleanDesign.mimeType === 'image/png' ? 'png' : opts.cleanDesign.mimeType === 'i...`:

The buyer's clean file keeps the design's real format + a matching extension (a PoD-ready design.png/.jpg/.webp).

At `if (opts.covenant) {`:

Covenant tier: the product is a covenant edition (permissionless resale enforced on-chain, publisher/holder
fees), carrying the mockup manifest + preview cover in TX1 exactly like a plain product — so the existing
Big Red curator lists AND composites it with no changes. Else a plain capped token (Limited/Exclusive).
