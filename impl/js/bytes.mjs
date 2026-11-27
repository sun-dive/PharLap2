// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).

export function fromHex(hex) {
  if (hex.length === 0) return new Uint8Array(0)
  if (hex.length % 2 !== 0) throw new Error(`hex string has an odd length (${hex.length})`)
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error(`not a hex string: "${hex.slice(0, 24)}…"`)
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  return out
}

export function toHex(b) {
  let s = ''
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0')
  return s
}

export function concat(...parts) {
  let n = 0
  for (const p of parts) n += p.length
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export function equals(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function timingSafeEquals(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export const reversed = b => new Uint8Array(b).reverse()

export const fromUtf8 = s => new TextEncoder().encode(s)
export const toUtf8 = b => new TextDecoder().decode(b)

const dv = b => new DataView(b.buffer, b.byteOffset, b.byteLength)

export const readU16LE = (b, o = 0) => dv(b).getUint16(o, true)
export const readU32LE = (b, o = 0) => dv(b).getUint32(o, true)
export const readU64LE = (b, o = 0) => dv(b).getBigUint64(o, true)

export function u16LE(n) { const b = new Uint8Array(2); dv(b).setUint16(0, n, true); return b }
export function u32LE(n) { const b = new Uint8Array(4); dv(b).setUint32(0, n, true); return b }
export function u64LE(n) { const b = new Uint8Array(8); dv(b).setBigUint64(0, BigInt(n), true); return b }

export function beBytes(n, len) {
  const out = new Uint8Array(len)
  for (let i = len - 1; i >= 0; i--) { out[i] = Number(n & 0xffn); n >>= 8n }
  if (n !== 0n) throw new RangeError(`does not fit in ${len} bytes`)
  return out
}

export const toBigBE = b => (b.length === 0 ? 0n : BigInt('0x' + toHex(b)))
