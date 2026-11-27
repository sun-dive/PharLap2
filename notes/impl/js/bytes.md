# impl/js/bytes.mjs

Byte primitives — what `Uint8Array` does not give you and `Buffer` did.

★★★ WHY `Uint8Array` AND NOT `Buffer`. **The wallet is browser-only.** `Buffer` does not exist in a
  browser: code using it BUNDLES CLEANLY and then fails at runtime on a user's machine, which is a
  worse failure than one that refuses to build. ⇒ `test/browser-safe.mjs` now catches both.

★★ AND `Uint8Array` IS THE BETTER TYPE ANYWAY, not merely the available one:
  | it **enforces bytes** | assign 256 and you get 0; a `number[]` holds `-1` or `999` and says nothing |
  | every browser API speaks it | `crypto.getRandomValues`, `TextEncoder`, `Blob`, `File.arrayBuffer()` |
  | `subarray()` is a **view** | not a copy, unlike `slice()` on an array |
  | one byte per element | rather than eight |

⚠ Multi-byte reads and writes go through `DataView`, which takes an explicit endianness argument on
  every call. Bitcoin is little-endian almost everywhere and big-endian in a few places, and having to
  name it each time is a feature: `readU32LE` cannot be misread as its big-endian cousin.

## fromHex

⚠ Refuses malformed hex rather than guessing — see `src/bytes.js` for the two implementations that
 disagreed about odd-length input, producing different bytes for the same string.

## toHex

⚠ `padStart` is not cosmetic: a byte is always two characters.

## equals

⚠ Compares CONTENT. `a === b` on two Uint8Arrays compares identity and is always false.

## timingSafeEquals

★ Constant-time content comparison, for anything derived from a secret.

## reversed

⚠ Reverses a COPY. Bitcoin displays hashes reversed; mutating the original in place is a classic bug.

## dv

── multi-byte integers ─────────────────────────────────────────────────────────────────────────────
⚠ Endianness is named in every function, because Bitcoin uses both and the wrong one is silent.

## u64LE

⚠ 8 bytes, and it takes a BigInt: a satoshi amount above 2^53 is not safe as a JS number.

## beBytes

big-endian, LEFT-PADDED. ⚠ The padding is the point — see BIP-32's "retention of leading zeros".
