// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { fromHex, toHex as u8ToHex, fromUtf8, toUtf8 } from '../impl/js/bytes.mjs'
import { hash160 } from '../impl/js/bip32.mjs'
import { p2pkhAddress } from '../impl/js/address.mjs'
import { decodePoint } from '../impl/js/ecdsa.mjs'
import { serP } from '../impl/js/secp256k1.mjs'
import { sha256 as nobleSha256 } from '../vendor/noble-hashes/sha2.js'

export const hexBytes = (hex) => (hex.length === 0 ? [] : Array.from(fromHex(hex)))
export const hexOf = (b) => u8ToHex(Uint8Array.from(b))
export const utf8Bytes = (s) => Array.from(fromUtf8(s))
export const utf8Of = (b) => toUtf8(Uint8Array.from(b))

export const sha256Bytes = (b) => Array.from(nobleSha256(Uint8Array.from(b)))
export const hash160Bytes = (b) => Array.from(hash160(Uint8Array.from(b)))

export const randomBytes = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)))

export const addressFromPubHex = (hex) => {
  const point = decodePoint(Uint8Array.from(hexBytes(hex)))
  if (point === null) throw new Error(`not a valid public key: ${hex.slice(0, 16)}…`)
  return p2pkhAddress(serP(point))
}

export const compressedPubKeyHex = (hex) => {
  const point = decodePoint(Uint8Array.from(hexBytes(hex)))
  if (point === null) throw new Error(`not a valid public key: ${hex.slice(0, 16)}…`)
  return u8ToHex(serP(point))
}
