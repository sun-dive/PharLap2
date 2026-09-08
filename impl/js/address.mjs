/**
 * WIF and base58check — the BSV side.
 *
 * ⚠⚠ THE TRAILING 0x01 IS NOT DECORATION. It means "this key is used COMPRESSED". Omitting it gives a
 * DIFFERENT ADDRESS for the same key, which is a classic way to lose funds that are provably yours.
 * ⇒ So the flag TRAVELS with the key, through import and export, and is never re-defaulted.
 *
 * ★ NOTE FOR ANYONE ARRIVING FROM jetmora: §2c-i forbids **jetmora** emitting a base58check address, so
 *   its `Base58Check` has no `encode()` at all. ⛔ That rule is jetmora's and does NOT cross — this is
 *   the BSV side, where writing an address is the entire job.
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { b58check, hash160 } from './bip32.mjs'
import { concat, fromHex, equals } from './bytes.mjs'

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const dsha = b => sha256(sha256(b))

/** @returns {{version:number, payload:Uint8Array}|null} — null rather than throwing: callers test with it */
export function b58decode(s) {
  if (!s) return null
  let n = 0n
  for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) return null; n = n * 58n + BigInt(i) }
  let hex = n.toString(16); if (hex.length & 1) hex = '0' + hex
  let b = n === 0n ? new Uint8Array(0) : fromHex(hex)
  // ⚠ leading '1's are leading ZERO BYTES, and they are data — dropping them changes the payload
  const lead = s.length - s.replace(/^1+/, '').length
  b = concat(new Uint8Array(lead), b)
  if (b.length < 5) return null
  const body = b.subarray(0, -4)
  if (!equals(dsha(body).subarray(0, 4), b.subarray(b.length - 4))) return null
  return { version: body[0], payload: body.subarray(1) }
}

export const p2pkhAddress = pub => b58check(concat(Uint8Array.of(0x00), hash160(pub)))
export const p2pkhScript  = h160 => concat(Uint8Array.of(0x76, 0xa9, 0x14), h160, Uint8Array.of(0x88, 0xac))

export const wifEncode = (key32, compressed = true, version = 0x80) => {
  if (key32.length !== 32) throw new Error('a private key is 32 bytes')
  return b58check(concat(Uint8Array.of(version), key32, compressed ? Uint8Array.of(0x01) : new Uint8Array(0)))
}

/** @returns {{key:Uint8Array, compressed:boolean, version:number}|null} */
export function wifDecode(wif) {
  const d = b58decode(wif)
  if (!d) return null
  const b = concat(Uint8Array.of(d.version), d.payload)
  if (b.length !== 33 && b.length !== 34) return null
  const compressed = b.length === 34
  if (compressed && b[33] !== 0x01) return null      // ⚠ only 0x01 is a valid suffix
  return { key: b.subarray(1, 33), compressed, version: b[0] }
}
