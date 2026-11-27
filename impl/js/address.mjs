// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { sha256 } from '../../vendor/noble-hashes/sha2.js'
import { b58check, hash160 } from './bip32.mjs'
import { concat, fromHex, equals } from './bytes.mjs'

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const dsha = b => sha256(sha256(b))

export function b58decode(s) {
  if (!s) return null
  let n = 0n
  for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) return null; n = n * 58n + BigInt(i) }
  let hex = n.toString(16); if (hex.length & 1) hex = '0' + hex
  let b = n === 0n ? new Uint8Array(0) : fromHex(hex)
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

export function wifDecode(wif) {
  const d = b58decode(wif)
  if (!d) return null
  const b = concat(Uint8Array.of(d.version), d.payload)
  if (b.length !== 33 && b.length !== 34) return null
  const compressed = b.length === 34
  if (compressed && b[33] !== 0x01) return null
  return { key: b.subarray(1, 33), compressed, version: b[0] }
}

export function scriptForAddress(addr) {
  const d = b58decode(addr)
  if (!d) throw new Error(`not a valid address: ${addr}`)
  if (d.payload.length !== 20) throw new Error(`address payload is ${d.payload.length} bytes, expected 20`)
  if (d.version !== 0x00) throw new Error(`address version 0x${d.version.toString(16)} is not mainnet P2PKH`)
  return p2pkhScript(d.payload)
}
