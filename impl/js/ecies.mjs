// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { mulBlinded, serP } from './secp256k1.mjs'
import { decodePoint } from './ecdsa.mjs'
import { concat, fromUtf8, timingSafeEquals } from './bytes.mjs'
import { sha512 } from '../../vendor/noble-hashes/sha2.js'
import { sha256 } from '../../vendor/noble-hashes/sha2.js'
import { hmac } from '../../vendor/noble-hashes/hmac.js'

const MAGIC = fromUtf8('BIE1')
const MAC_BYTES = 32

export class EciesError extends Error {}

function sharedSecret(priv, pub) {
  if (typeof priv !== 'bigint') throw new EciesError('the private key is a BigInt scalar')
  const point = decodePoint(pub)
  if (point === null) throw new EciesError('the public key does not decode')
  return sha512(serP(mulBlinded(priv, point)))
}

const keysFrom = H => ({ iv: H.subarray(0, 16), keyE: H.subarray(16, 32), keyM: H.subarray(32, 64) })
const importAes = (raw, use) => crypto.subtle.importKey('raw', raw, 'AES-CBC', false, [use])

export async function encrypt(msg, theirPub, ourPriv) {
  const { iv, keyE, keyM } = keysFrom(sharedSecret(ourPriv, theirPub))
  const key = await importAes(keyE, 'encrypt')
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, msg))
  const body = concat(MAGIC, ct)
  return concat(body, hmac(sha256, keyM, body))
}

export async function decrypt(packed, ourPriv, theirPub) {
  if (!(packed instanceof Uint8Array)) throw new EciesError('expected bytes')
  if (packed.length < MAGIC.length + 16 + MAC_BYTES)
    throw new EciesError('too short to hold a magic, one cipher block and a MAC')
  if (!timingSafeEquals(packed.subarray(0, MAGIC.length), MAGIC))
    throw new EciesError('not this message format')

  const { iv, keyE, keyM } = keysFrom(sharedSecret(ourPriv, theirPub))
  const body = packed.subarray(0, packed.length - MAC_BYTES)
  const mac = packed.subarray(packed.length - MAC_BYTES)

  if (!timingSafeEquals(hmac(sha256, keyM, body), mac))
    throw new EciesError('message authentication failed - wrong key, wrong sender, or altered in transit')

  const key = await importAes(keyE, 'decrypt')
  try {
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv }, key, packed.subarray(MAGIC.length, packed.length - MAC_BYTES)))
  } catch {
    throw new EciesError('the message authenticated but its padding is malformed')
  }
}

export const encryptToSelf = (msg, ourPriv, ourPub) => encrypt(msg, ourPub, ourPriv)
export const decryptFromSelf = (packed, ourPriv, ourPub) => decrypt(packed, ourPriv, ourPub)
