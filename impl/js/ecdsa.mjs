// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { N, P, G, mulBlinded, mulAdd, serP, mod, modPow, invN, invNBlinded } from './secp256k1.mjs'
import { rfc6979k } from './rfc6979.mjs'
import { concat, beBytes, toBigBE } from './bytes.mjs'

const toBig = toBigBE

export function publicKey(d, compressed = true) {
  const pt = mulBlinded(mod(d, N), G)
  if (pt === null) throw new Error('private key out of range')
  return compressed ? serP(pt) : concat(Uint8Array.of(0x04), beBytes(pt.x, 32), beBytes(pt.y, 32))
}

function derInt(v) {
  let b = beBytes(v, 32)
  const first = b.findIndex(x => x !== 0)
  b = b.subarray(first === -1 ? 31 : first)
  if (b[0] & 0x80) b = concat(Uint8Array.of(0x00), b)
  return concat(Uint8Array.of(0x02, b.length), b)
}

export function encodeDer(r, s) {
  const body = concat(derInt(r), derInt(s))
  return concat(Uint8Array.of(0x30, body.length), body)
}

export function decodeDer(sig, allowTrailing = false) {
  const b = sig
  if (b.length < 8 || b[0] !== 0x30) return null
  const len = b[1]
  if (len & 0x80) return null
  if (!allowTrailing && 2 + len !== b.length) return null
  if (2 + len > b.length) return null
  let p = 2
  const readInt = () => {
    if (b[p++] !== 0x02) return null
    const l = b[p++]
    if (l === 0 || l > 33 || p + l > b.length) return null
    const v = b.subarray(p, p + l); p += l
    if (v[0] & 0x80) return null
    if (v[0] === 0x00 && !(v[1] & 0x80)) return null
    return toBig(v)
  }
  const r = readInt(); if (r === null) return null
  const s = readInt(); if (s === null) return null
  if (p !== 2 + len) return null
  if (r <= 0n || s <= 0n || r >= N || s >= N) return null
  return [r, s]
}

export function sign(d, digest32, { lowS = false, rand } = {}) {
  if (digest32.length !== 32) throw new Error('a digest is 32 bytes')
  const z = toBig(digest32)
  for (let attempt = 0; attempt < 64; attempt++) {
    const k = rfc6979k(N, mod(d, N), digest32, attempt)
    const pt = mulBlinded(k, G, rand)
    if (pt === null) continue
    const r = mod(pt.x, N)
    if (r === 0n) continue
    let s = mod(invNBlinded(k, rand) * (z + r * mod(d, N)), N)
    if (s === 0n) continue
    if (lowS && s > N / 2n) s = N - s
    return encodeDer(r, s)
  }
  throw new Error('no valid signature after 64 attempts — statistically impossible; something is wrong')
}

export function verifyDigest(sig, pub, digest32, allowTrailing = false) {
  const parsed = decodeDer(sig, allowTrailing)
  if (parsed === null) return false
  const [r, s] = parsed
  const Q = decodePoint(pub)
  if (Q === null) return false
  const z = toBig(digest32)
  const w = invN(s)
  const R = mulAdd(mod(z * w, N), G, mod(r * w, N), Q)
  return R !== null && mod(R.x, N) === r
}

export function decodePoint(pub) {
  const b = pub
  if (b.length === 33 && (b[0] === 0x02 || b[0] === 0x03)) {
    const x = toBig(b.subarray(1))
    if (x >= P) return null
    const y2 = mod(x * x % P * x + 7n, P)
    let y = modPow(y2, (P + 1n) / 4n, P)
    if (modPow(y, 2n, P) !== y2) return null
    if ((y & 1n) !== BigInt(b[0] & 1)) y = P - y
    return { x, y }
  }
  if (b.length === 65 && b[0] === 0x04) {
    const x = toBig(b.subarray(1, 33)), y = toBig(b.subarray(33))
    if (x >= P || y >= P) return null
    if (mod(y * y, P) !== mod(x * x % P * x + 7n, P)) return null
    return { x, y }
  }
  return null
}
