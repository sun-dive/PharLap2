// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concat, toBigBE } from './bytes.mjs'

const hmac256 = (key, msg) => hmac(sha256, key, msg)

function bits2int(b, qlen) {
  const v = toBigBE(b)
  const blen = b.length * 8
  return blen > qlen ? v >> BigInt(blen - qlen) : v
}

function int2octets(x, rlen) {
  const out = new Uint8Array(rlen)
  for (let i = rlen - 1; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n }
  if (x !== 0n) throw new RangeError('int2octets: value wider than the order')
  return out
}

const bitlen = n => (n === 0n ? 0 : n.toString(2).length)

export function rfc6979k(q, x, h1, attempt = 0) {
  const qlen = bitlen(q)
  const rlen = Math.ceil(qlen / 8)
  const h1int = bits2int(h1, qlen)
  const z2 = int2octets(h1int >= q ? h1int - q : h1int, rlen)
  const x2 = int2octets(x, rlen)

  let V = new Uint8Array(32).fill(0x01)
  let K = new Uint8Array(32).fill(0x00)
  K = hmac256(K, concat(V, Uint8Array.of(0x00), x2, z2)); V = hmac256(K, V)
  K = hmac256(K, concat(V, Uint8Array.of(0x01), x2, z2)); V = hmac256(K, V)

  for (let skipped = 0; ;) {
    let T = new Uint8Array(0)
    while (T.length * 8 < qlen) { V = hmac256(K, V); T = concat(T, V) }
    const cand = bits2int(T, qlen)
    if (cand >= 1n && cand < q) {
      if (skipped === attempt) return cand
      skipped++
    }
    K = hmac256(K, concat(V, Uint8Array.of(0x00))); V = hmac256(K, V)
  }
}
