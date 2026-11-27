# src/bytes.js

══ THE SEAM ═══════════════════════════════════════════════════════════════════════════════════════

★★★ THE APPLICATION SPEAKS `number[]`. THE WALLET CORE SPEAKS `Uint8Array`. This is the one place the
  two meet, and it exists so that 12,000 lines of working application code did not have to be
  rewritten to change a dependency.

⚠⚠ NAMED FOR WHAT THEY DO, NOT FOR WHAT THEY REPLACE. It would have been easy to give this module the
  removed library's object and method names, so its call sites needed no edit at all. That carries the
  old API shape forward, which is the thing this project does not do. Renaming the call sites is the
  whole cost of not doing it, and it is small.

⏭ AND THIS FILE IS MEANT TO SHRINK. Every conversion here is real work on real data - `Uint8Array.from`
  on a 47 MB payload is not free - so the day the application moves to `Uint8Array` throughout, this is
  what gets deleted. One module to remove, rather than a shim hidden in each file.

## hexBytes

```ts
export const hexBytes = (hex: string): number[] =>
```

hex → bytes. ⚠ An empty string is an empty array, not a throw: an absent field is not an error.

## hexOf

```ts
export const hexOf = (b: number[]): string =>
```

bytes → hex.

## utf8Bytes

```ts
export const utf8Bytes = (s: string): number[] =>
```

text → UTF-8 bytes.

## utf8Of

```ts
export const utf8Of = (b: number[]): string =>
```

UTF-8 bytes → text.

## sha256Bytes

```ts
export const sha256Bytes = (b: number[]): number[] =>
```

SHA-256.

## hash160Bytes

```ts
export const hash160Bytes = (b: number[]): number[] =>
```

RIPEMD-160(SHA-256(x)) — what an address is made of.

## randomBytes

```ts
export const randomBytes = (n: number): number[] =>
```

Cryptographically secure random bytes.
⚠ `crypto.getRandomValues`, never `Math.random`. This is used for content keys, and the difference
  between the two is the difference between a key and a number.

## addressFromPubHex

```ts
export const addressFromPubHex = (hex: string): string =>
```

The mainnet address for someone ELSE's public key, given as hex.

⚠⚠⚠ THE KEY IS NORMALISED TO COMPRESSED FIRST, AND THAT IS NOT A TIDY-UP. Measured against the
  deployed behaviour: a 65-byte uncompressed key hashes to the COMPRESSED key's address, because the
  library parsed it into a point before serialising. ⇒ Hashing the hex as given would produce a
  different, valid-looking address, and a scan would then look for a publisher's records at a place
  they have never posted to. Nothing would error; the answer would simply be empty.

## compressedPubKeyHex

```ts
export const compressedPubKeyHex = (hex: string): string =>
```

A public key given as hex in either form, as its compressed 33-byte hex. Throws on an invalid key.
