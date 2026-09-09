// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * ══ TWO-PARTY ENCRYPTION ════════════════════════════════════════════════════════════════════════════
 *
 * ★★★ THE FORMAT IS FIXED BY MESSAGES ALREADY SENT. It was established here by MEASURING what the
 *   deployed wallet produces, not by reading a specification and hoping, because a message that was
 *   encrypted last year has to open next year:
 *
 *     S    = compressed(theirPublicKey × ourPrivateKey)          ECDH
 *     H    = SHA-512(S)
 *     iv   = H[0..16]      keyE = H[16..32]      keyM = H[32..64]
 *     out  = "BIE1" ‖ AES-128-CBC(iv, keyE, PKCS#7(message)) ‖ HMAC-SHA256(keyM, "BIE1" ‖ ciphertext)
 *
 * ⚠⚠ AES-**128**, not 256, and that is recorded rather than chosen: `keyE` is 16 bytes of the digest.
 *   Widening it would be a different scheme and every message already sent would stop opening.
 *
 * ⚠⚠⚠ AND IT IS DETERMINISTIC. The IV is derived from the shared secret, so encrypting the same message
 *   to the same recipient twice produces IDENTICAL BYTES. ⇒ That leaks equality: an observer can tell
 *   that two messages between the same pair have the same contents, without learning what they are.
 *   ⛔ This is a property of the deployed format, not a bug introduced here, and it cannot be fixed
 *     without breaking compatibility. It is written down so nobody has to rediscover it, and so nobody
 *     assumes a freshness this does not provide.
 *
 * ★ Encrypt-then-MAC, and the MAC is checked BEFORE anything is decrypted. Verifying afterwards would
 *   mean running a cipher over bytes an attacker chose.
 */
import { mul, serP } from './secp256k1.mjs'
import { decodePoint } from './ecdsa.mjs'
import { concat, fromUtf8, timingSafeEquals } from './bytes.mjs'
import { sha512 } from '@noble/hashes/sha2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'

/** ⚠ Four bytes of the wire format. Not a version to bump - old messages carry exactly these. */
const MAGIC = fromUtf8('BIE1')
const MAC_BYTES = 32

export class EciesError extends Error {}

/**
 * The shared secret both sides compute.
 * ★ ECDH: `theirs × ours` gives the same point as `ours × theirs`, which is the whole trick. It is
 *   serialized COMPRESSED before hashing - the uncompressed form would hash differently and open
 *   nothing.
 */
function sharedSecret(priv, pub) {
  if (typeof priv !== 'bigint') throw new EciesError('the private key is a BigInt scalar')
  // ⚠⚠ `decodePoint` REPORTS FAILURE BY RETURNING null, NOT BY THROWING. I wrapped this in a try/catch
  //   first, which never fired, so a malformed key sailed through to the multiply. ⇒ Measured, so as not
  //   to overstate it: `mul` also returns null, and `serP` then throws "Cannot read properties of null
  //   (reading 'y')". It failed - but with a curve-internals error instead of saying which argument was
  //   wrong, which is the difference between a caller fixing it and a caller filing a bug.
  const point = decodePoint(pub)
  if (point === null) throw new EciesError('the public key does not decode')
  return sha512(serP(mul(priv, point)))
}

const keysFrom = H => ({ iv: H.subarray(0, 16), keyE: H.subarray(16, 32), keyM: H.subarray(32, 64) })
const importAes = (raw, use) => crypto.subtle.importKey('raw', raw, 'AES-CBC', false, [use])

/**
 * Encrypt `msg` so that the holder of `theirPub` can read it, provably from the holder of `ourPriv`.
 *
 * ⚠ The sender's public key is NOT embedded. The deployed format carries it alongside, in the message
 *   envelope, so `decrypt` has to be told who sent it. That is not an omission to fix here: adding it
 *   would change the bytes and break every message already sent.
 */
export async function encrypt(msg, theirPub, ourPriv) {
  const { iv, keyE, keyM } = keysFrom(sharedSecret(ourPriv, theirPub))
  // ⚠ WebCrypto applies PKCS#7 itself, which is what the deployed format uses - hence 0 bytes of
  //   plaintext still producing one full block.
  const key = await importAes(keyE, 'encrypt')
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, msg))
  const body = concat(MAGIC, ct)
  return concat(body, hmac(sha256, keyM, body))
}

/**
 * Open a message sent to us by the holder of `theirPub`.
 *
 * ⛔ Throws on a bad MAC, a truncated message or a wrong magic. It never returns partial plaintext:
 *   the only two outcomes are the real message and an exception.
 */
export async function decrypt(packed, ourPriv, theirPub) {
  if (!(packed instanceof Uint8Array)) throw new EciesError('expected bytes')
  if (packed.length < MAGIC.length + 16 + MAC_BYTES)
    throw new EciesError('too short to hold a magic, one cipher block and a MAC')
  if (!timingSafeEquals(packed.subarray(0, MAGIC.length), MAGIC))
    throw new EciesError('not this message format')

  const { iv, keyE, keyM } = keysFrom(sharedSecret(ourPriv, theirPub))
  const body = packed.subarray(0, packed.length - MAC_BYTES)
  const mac = packed.subarray(packed.length - MAC_BYTES)

  // ⚠⚠ THE MAC IS CHECKED FIRST, and with a timing-safe compare. Decrypting before verifying would run
  //   a cipher over attacker-chosen bytes; comparing with === would leak how much of the MAC matched.
  if (!timingSafeEquals(hmac(sha256, keyM, body), mac))
    throw new EciesError('message authentication failed - wrong key, wrong sender, or altered in transit')

  const key = await importAes(keyE, 'decrypt')
  try {
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv }, key, packed.subarray(MAGIC.length, packed.length - MAC_BYTES)))
  } catch {
    // ⚠ Only reachable if the padding is wrong on bytes whose MAC verified, which means the sender
    //   produced them incorrectly rather than an attacker altering them.
    throw new EciesError('the message authenticated but its padding is malformed')
  }
}

/** ★ To ourselves - the shape a settings backup uses. Same scheme, both keys ours. */
export const encryptToSelf = (msg, ourPriv, ourPub) => encrypt(msg, ourPub, ourPriv)
export const decryptFromSelf = (packed, ourPriv, ourPub) => decrypt(packed, ourPriv, ourPub)
