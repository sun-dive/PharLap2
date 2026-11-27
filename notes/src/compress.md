# src/compress.js

Smart gzip for on-chain payloads — applied wherever bytes go on-chain (embedded edition files, message
envelopes), gated by "keep ONLY if smaller". Uses the platform-native CompressionStream (browsers + Node
18+), so zero dependencies. ALWAYS compress BEFORE encrypting — ciphertext is random and won't compress.

Two guards keep it safe everywhere: (1) known already-compressed formats (woff2/png/jpg/webp/mp3/…) are
skipped outright — gzip saves ~nothing on them but would force every consumer through a decompress step, so
they're stored RAW and stay directly usable (a woff2 atom drops straight into @font-face); (2) everything
else is kept ONLY if it actually shrank. Text/markup (svg/json) shrinks 50–90%; short payloads stay raw.

## MIN_COMPRESS

```ts
const MIN_COMPRESS = 64
```

Below this, gzip's ~18-byte header/footer can only enlarge — don't bother.

## PRECOMPRESSED_MIME

```ts
const PRECOMPRESSED_MIME = new Set<string>([
```

Already-compressed payloads — gzip yields ~nothing (sometimes a byte or two, sometimes larger) but forces a
 decompress step on every consumer. Store RAW so the bytes are directly reusable. Matched by MIME or filename
 extension (browsers report font/media MIME inconsistently). SVG/JSON/text are deliberately absent — they
 compress well and should.

## PRECOMPRESSED_EXT

```ts
const PRECOMPRESSED_EXT = new Set<string>([
```

## isPrecompressed

```ts
export function isPrecompressed(mimeType?: string, fileName?: string): boolean
```

True when a payload is already compressed (by MIME or filename ext) → skip gzip, store raw.

## run

```ts
async function run(bytes: number[], stream: CompressionStream | DecompressionStream): Promise<number[]>
```

## compressIfSmaller

```ts
export async function compressIfSmaller(
  bytes: number[], mimeType?: string, fileName?: string,
): Promise<{ bytes: number[]; compressed: boolean }>
```

Gzip `bytes`, returning the compressed form ONLY if it actually shrinks. Pass `mimeType`/`fileName` so
 already-compressed formats (woff2/png/jpg/…) are stored RAW — directly reusable, no decompress for consumers.

## decompress

```ts
export async function decompress(bytes: number[]): Promise<number[]>
```

Decompress gzip bytes produced by compressIfSmaller.
