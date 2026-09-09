// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP — Tier 1 encrypted content (PLAN.md Addendum F).
 *
 * Envelope encryption with a per-collection content key K:
 *   - K = 32 random bytes; the file is AES-GCM encrypted with K → ciphertext (stored on-chain; fileHash binds it).
 *   - K is delivered to holders as `wrappedK` — an OBFUSCATED, not securely-encrypted, blob.
 *   - Each collection also gets a random `keySalt`; the wrap key = SHA256(walletConstant ‖ keySalt). So both
 *     K and the wrapper are unique per collection (the keySalt is stored in the TX1 template, public).
 *
 * IMPORTANT — this is Tier 1: "an inconvenience, not DRM". The wrap is a deterministic obfuscation: every
 * holder derives the same wrap key from the public keySalt + a constant baked into this (open-source) wallet.
 * So ANY holder can unwrap K with no live party — which is exactly what makes permissionless replication work
 * without a server — but it also means anyone who reads this source + the public keySalt can unwrap it too.
 * The per-collection keySalt makes wrappers distinct but adds NO security over a constant (the unwrap method
 * is public either way). The real defence is economic (content priced below the bother-cost of extraction) +
 * the resale incentive (Addendum A). Its only cryptographic job is to stop casual copy-paste of a raw key out
 * of a block explorer.
 *
 * For real per-recipient protection you need a live sender (Tier 2) or a watermarking server (Tier 3).
 */
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'

/**
 * ⚠⚠⚠ THE CIPHERTEXT FRAMING IS FIXED BY WHAT IS ALREADY ON CHAIN: `[32-byte IV][ciphertext][16-byte
 *   auth tag]`. 21 encrypted editions were minted with it. Changing any of it - including "fixing" the
 *   IV to GCM's usual 12 bytes - makes coins that exist today undecryptable, and there is no version
 *   marker to tell old from new.
 *   ★ MEASURED, not assumed: WebCrypto accepts a 32-byte IV and decrypts the deployed format, in Node
 *     and in Chromium over `file://` (which is what the air-gapped wallet runs on). The 20 bytes a
 *     standard nonce would save are meaningless against a 47 MB release.
 *
 * ★★★ WHY THIS IS NOW ASYNC, AND WHY THAT IS THE POINT. The version this replaces ran AES-GCM in pure
 *   JavaScript over a `number[]`: encrypting a ~47 MB release took 1 to 3 minutes single-threaded, with
 *   the tab apparently frozen, before the spend dialog even appeared. That was diagnosed in June and the
 *   fix recorded then.
 *   ⚠ MEASURED HERE, 4 MB, and the first measurement was WRONG: timing the old path in Node gave 17x,
 *     because Node has a NATIVE AES the browser does not - so that measured a path no browser takes.
 *     Timing the pure-JS routine a browser actually runs: **1805 ms against 4 ms, 424x.** For a 47 MB
 *     release that is roughly 21 seconds of arithmetic against a tenth of a second.
 *   ⇒ `crypto.subtle` is asynchronous, so
 *   the four functions that touch it are too. All four call sites already sit inside `async` functions,
 *   so the change stops there.
 *
 * ⏭ STILL TO DO, from the same June note: these signatures are `number[]` because the application is.
 *   Converting a 47 MB payload to a `Uint8Array` and back is a real cost on exactly the inputs that
 *   hurt, and the note calls for "no giant array". The 100x win is here; that one is not.
 */
const AES = 'AES-GCM'
/** ⚠ 32, not 12. See the framing note above - this is not a choice, it is what the chain holds. */
const IV_BYTES = 32

const sha256Bytes = (data: number[]): number[] => Array.from(nobleSha256(Uint8Array.from(data)))
const randomBytes = (n: number): number[] => Array.from(crypto.getRandomValues(new Uint8Array(n)))
const toHex = (b: number[]): string => b.map(x => x.toString(16).padStart(2, '0')).join('')
const utf8 = (s: string): number[] => Array.from(new TextEncoder().encode(s))

/** ⚠ `false` for extractable: the key must not be exportable once imported. */
const importKey = (K: number[], use: KeyUsage): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', Uint8Array.from(K), AES, false, [use])

async function gcmEncrypt (K: number[], plain: number[]): Promise<number[]> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await importKey(K, 'encrypt')
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: AES, iv }, key, Uint8Array.from(plain)))
  // ⚠ WebCrypto APPENDS the auth tag to the ciphertext, which is the same layout the deployed format
  //   expects, so the tag needs no separate handling - only the IV is prefixed.
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv, 0); out.set(ct, iv.length)
  return Array.from(out)
}

async function gcmDecrypt (K: number[], packed: number[]): Promise<number[]> {
  const b = Uint8Array.from(packed)
  if (b.length < IV_BYTES + 16) throw new Error('ciphertext too short to hold an IV and a tag')
  const key = await importKey(K, 'decrypt')
  // ⛔ A wrong key fails HERE, as an exception, because GCM authenticates. That is what callers rely on.
  const pt = await crypto.subtle.decrypt({ name: AES, iv: b.subarray(0, IV_BYTES) }, key, b.subarray(IV_BYTES))
  return Array.from(new Uint8Array(pt))
}

/** Constant baked into the wallet — PUBLIC (this is open source). Obfuscation only, not a secret. */
const OBFUSCATION_SALT = utf8('PHARLAP/tier1/content-key/v1')

/** Generate a fresh 32-byte content key K. */
export function newContentKey(): number[] {
  return randomBytes(32)
}

/** Generate a fresh per-collection 16-byte key salt (stored public in the template). */
export function newKeySalt(): number[] {
  return randomBytes(16)
}

/** AES-GCM encrypt file bytes with K → ciphertext. ⚠ The IV is PREFIXED, the tag suffixed. */
export async function encryptContent(fileBytes: number[], K: number[]): Promise<number[]> {
  return await gcmEncrypt(K, fileBytes)
}

/** AES-GCM decrypt ciphertext with K → file bytes. Throws on a wrong/garbled key. */
export async function decryptContent(ciphertext: number[], K: number[]): Promise<number[]> {
  return await gcmDecrypt(K, ciphertext)
}

/**
 * Per-collection obfuscation key = SHA-256(SALT ‖ keySalt). Every holder derives the same key from the
 * public keySalt — see the file header: this is NOT a secret.
 */
function obfuscationKey(keySalt: number[]): number[] {
  return sha256Bytes([...OBFUSCATION_SALT, ...keySalt])
}

/** Obfuscate K for a collection → `wrappedK` (stored in the TX1 template alongside its keySalt). */
export async function wrapContentKey(K: number[], keySalt: number[]): Promise<number[]> {
  return await gcmEncrypt(obfuscationKey(keySalt), K)
}

/** Recover K from `wrappedK` using the collection's keySalt, or null if it doesn't unwrap. */
export async function unwrapContentKey(wrappedK: number[], keySalt: number[]): Promise<number[] | null> {
  try {
    return await gcmDecrypt(obfuscationKey(keySalt), wrappedK)
  } catch {
    // ⛔ null, not a throw: a wrapped key that does not unwrap is an ordinary outcome here, and GCM's
    //   authentication is what detects it. The contract is unchanged by the move to `await`.
    return null
  }
}

/** SHA-256 of the (encrypted) bytes, hex — binds the ciphertext to the collection identity (template fileHash). */
export function contentHash(ciphertext: number[]): string {
  return toHex(sha256Bytes(ciphertext))
}
