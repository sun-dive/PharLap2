// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * ══ THE SEAM ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * ★★★ THE APPLICATION SPEAKS `number[]`. THE WALLET CORE SPEAKS `Uint8Array`. This is the one place the
 *   two meet, and it exists so that 12,000 lines of working application code did not have to be
 *   rewritten to change a dependency.
 *
 * ⚠⚠ NAMED FOR WHAT THEY DO, NOT FOR WHAT THEY REPLACE. It would have been easy to give this module the
 *   removed library's object and method names, so its call sites needed no edit at all. That carries the
 *   old API shape forward, which is the thing this project does not do. Renaming the call sites is the
 *   whole cost of not doing it, and it is small.
 *
 * ⏭ AND THIS FILE IS MEANT TO SHRINK. Every conversion here is real work on real data - `Uint8Array.from`
 *   on a 47 MB payload is not free - so the day the application moves to `Uint8Array` throughout, this is
 *   what gets deleted. One module to remove, rather than a shim hidden in each file.
 */
import { fromHex, toHex as u8ToHex, fromUtf8, toUtf8 } from '../impl/js/bytes.mjs'
import { hash160 } from '../impl/js/bip32.mjs'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'

/** hex → bytes. ⚠ An empty string is an empty array, not a throw: an absent field is not an error. */
export const hexBytes = (hex: string): number[] => (hex.length === 0 ? [] : Array.from(fromHex(hex)))
/** bytes → hex. */
export const hexOf = (b: number[]): string => u8ToHex(Uint8Array.from(b))
/** text → UTF-8 bytes. */
export const utf8Bytes = (s: string): number[] => Array.from(fromUtf8(s))
/** UTF-8 bytes → text. */
export const utf8Of = (b: number[]): string => toUtf8(Uint8Array.from(b))

/** SHA-256. */
export const sha256Bytes = (b: number[]): number[] => Array.from(nobleSha256(Uint8Array.from(b)))
/** RIPEMD-160(SHA-256(x)) — what an address is made of. */
export const hash160Bytes = (b: number[]): number[] => Array.from(hash160(Uint8Array.from(b)))

/**
 * Cryptographically secure random bytes.
 * ⚠ `crypto.getRandomValues`, never `Math.random`. This is used for content keys, and the difference
 *   between the two is the difference between a key and a number.
 */
export const randomBytes = (n: number): number[] => Array.from(crypto.getRandomValues(new Uint8Array(n)))
