# src/thumbs.js

## PREFIX

```ts
const PREFIX = 'p:thumb:'
```

NFT-card thumbnails.

A thumbnail is a pure DISPLAY convenience, derived in-browser from a collection's already-public cover
image (or public image file) and cached in localStorage. NOTHING extra goes on-chain: a thumbnail is
fully regenerable from public data, so it belongs in a disposable local cache, not the permanent ledger
(which we keep as lean as possible). Browser-only (canvas + createImageBitmap/`<img>` + localStorage);
the fetch + source-selection lives in app.js, this module owns the cache + the decode + the downscale.

## NONE

```ts
const NONE = '-' // negative-cache marker: "this collection has no thumbnailable image"
```

longest thumbnail edge, px

## SVG_FIX

```ts
const SVG_FIX = 'p:thumbfix1'
```

negative-cache marker: "this collection has no thumbnailable image"

⚠ One-time repair. Before SVG covers were decodable (see `decodeImage`) every SVG cover resolved to a
NONE marker, and `thumbResolved` then reports it as settled — so fixing the decoder alone would change
nothing for a wallet that had already looked. Drop the NEGATIVES once; real thumbs stay cached.

## `try {`

At `} catch {`:

private mode / no storage — old negatives simply keep their placeholder

## cachedThumb

```ts
export function cachedThumb(collectionId: string): string | null
```

Cached data-URL for a collection, or null if uncached or known to have no image.

## thumbResolved

```ts
export function thumbResolved(collectionId: string): boolean
```

Whether this collection has already been resolved (a real thumb or a negative) — skip re-fetching.

## store

```ts
function store(collectionId: string, value: string): void
```

At `try { localStorage.setItem(PREFIX + collectionId, value) } catch {`:

quota: thumbnails are disposable

## cacheNoThumb

```ts
export function cacheNoThumb(collectionId: string): void
```

Record that a collection has no thumbnailable image, so we stop retrying it.

## THUMB_URL

```ts
export const THUMB_URL = /^data:image\/(webp|png|jpeg|gif);base64,[A-Za-z0-9+/=]+$/
```

An image data URL and nothing else: what a thumbnail may be when it comes from outside, such as a file.

## cacheThumbUrl

```ts
export function cacheThumbUrl(collectionId: string, url: string): boolean
```

Put a thumbnail from a backup file into the cache. Returns false, caching nothing, if it is not an image.

## MIME_PREFIX

```ts
const MIME_PREFIX = 'p:mime:'
```

── content MIME-type cache (for the My-NFTs type sections) ──────────────────────────────────────────
Captured from the same TX1 fetch as the thumbnail. Values: a MIME string, or NO_FILE for a collection
with no embedded file. `cachedMime` returns undefined when the collection hasn't been resolved yet.

## cachedMime

```ts
export function cachedMime(collectionId: string): string | null | undefined
```

undefined = not resolved yet · null = resolved, no embedded file · string = the content MIME type.

## cacheMime

```ts
export function cacheMime(collectionId: string, mimeType: string | null): void
```

At `try { localStorage.setItem(MIME_PREFIX + collectionId, mimeType == null || mimeType === '' ? NO_F...`:

quota

## Drawable

```ts
type Drawable = { src: CanvasImageSource; w: number; h: number; done: () => void }
```

── decode ───────────────────────────────────────────────────────────────────────────────────────────

A decoded image ready to draw. `done()` releases whatever the decode held (bitmap or object URL).

## decodeImage

```ts
async function decodeImage(bytes: number[], mimeType: string): Promise<Drawable | null>
```

Decode image bytes to something drawable, by MIME type.

⚠ `createImageBitmap` REJECTS an image/svg+xml blob in Chrome — an SVG has to go through `<img>`, which
does accept a blob: URL. Everything raster stays on createImageBitmap (faster, and off the main thread).
⇒ Without the SVG branch an SVG cover fell into the caller's catch and negative-cached, which is why SVG
covers showed the 🎴 placeholder in My NFTs while raster covers rendered.

## decodeSvg

```ts
function decodeSvg(blob: Blob): Promise<Drawable | null>
```

Decode an SVG via `<img>` + object URL. Resolves null (never rejects) if it won't load or has no size.

At `const w = img.naturalWidth || img.width`:

⚠ An SVG carrying no intrinsic width/height decodes to 0×0 here rather than failing. Reject it
instead of drawing an empty canvas — our covers set both (e.g. 1000×1000).

## downscaleToAvatar

```ts
export async function downscaleToAvatar(bytes: number[], mimeType: string, maxEdge = 96): Promise<{ mimeType: string; bytes: number[] } | null>
```

Downscale an image to a small square-ish WebP for an on-chain avatar, returning the bytes (not cached).
 Returns null if the bytes aren't a decodable image or the browser can't encode WebP.

## makeThumb

```ts
export async function makeThumb(collectionId: string, bytes: number[], mimeType: string): Promise<string | null>
```

Downscale image bytes to a cached thumbnail data-URL (WebP). Returns null — without caching — if the
bytes aren't a decodable image, so the caller can try another source or fall back to a placeholder.
