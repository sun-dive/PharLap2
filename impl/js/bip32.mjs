// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { sha256 } from '../../vendor/noble-hashes/sha2.js'
import { sha512 } from '../../vendor/noble-hashes/sha2.js'
import { ripemd160 } from '../../vendor/noble-hashes/legacy.js'
import { hmac } from '../../vendor/noble-hashes/hmac.js'
import { G, N, add, mul, mulBlinded, serP, ser32, ser256 } from './secp256k1.mjs'
import { concat, fromHex, fromUtf8, toBigBE } from './bytes.mjs'

const XPRV = fromHex('0488ade4')
const XPUB = fromHex('0488b21e')
const HARDENED = 0x80000000

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export const hash160 = b => ripemd160(sha256(b))

export function b58check(payload) {
  const raw = concat(payload, sha256(sha256(payload)).subarray(0, 4))
  let n = 0n
  for (const byte of raw) n = n * 256n + BigInt(byte)
  let out = ''
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n }
  let pad = 0
  while (pad < raw.length && raw[pad] === 0) pad++
  return '1'.repeat(pad) + out
}

export class Node {
  constructor(k, K, chain, depth = 0, parentFp = new Uint8Array(4), index = 0) {
    this.k = k
    this.K = K ?? mulBlinded(k)
    this.chain = chain
    this.depth = depth
    this.parentFp = parentFp
    this.index = index
  }

  #ser(version, key) {
    return b58check(concat(
      version, Uint8Array.of(this.depth), this.parentFp, ser32(this.index), this.chain, key,
    ))
  }

  xpub() { return this.#ser(XPUB, serP(this.K)) }

  xprv() {
    if (this.k === null) throw new Error('no private key in this node')
    return this.#ser(XPRV, concat(new Uint8Array(1), ser256(this.k)))
  }

  fingerprint() { return hash160(serP(this.K)).subarray(0, 4) }

  child(index) {
    const hardened = index >= HARDENED
    let data
    if (hardened) {
      if (this.k === null) throw new Error('a hardened child needs the private key')
      data = concat(new Uint8Array(1), ser256(this.k), ser32(index))
    } else {
      data = concat(serP(this.K), ser32(index))
    }

    const I = hmac(sha512, this.chain, data)
    const IL = toBigBE(I.subarray(0, 32))
    const IR = I.subarray(32)

    if (IL >= N) return this.child(index + 1)

    if (this.k !== null) {
      const k = (IL + this.k) % N
      if (k === 0n) return this.child(index + 1)
      return new Node(k, null, IR, this.depth + 1, this.fingerprint(), index)
    }
    const K = add(mulBlinded(IL), this.K)
    if (K === null) return this.child(index + 1)
    return new Node(null, K, IR, this.depth + 1, this.fingerprint(), index)
  }

  derive(path) {
    const parts = path.split('/')
    if (parts[0] !== 'm' && parts[0] !== 'M') throw new Error(`a path starts at m, not "${parts[0]}"`)
    let node = this
    for (const p of parts.slice(1)) {
      if (!p) throw new Error(`empty step in path "${path}"`)
      const hard = ["'", 'h', 'H'].includes(p.at(-1))
      const n = Number(hard ? p.slice(0, -1) : p)
      if (!Number.isInteger(n) || n < 0 || n >= HARDENED) throw new Error(`index out of range: ${p}`)
      node = node.child(hard ? n + HARDENED : n)
    }
    return node
  }
}

export function fromSeed(seed) {
  const I = hmac(sha512, fromUtf8('Bitcoin seed'), seed)
  const IL = toBigBE(I.subarray(0, 32))
  if (IL === 0n || IL >= N) {
    throw new Error('invalid seed: the master key is out of range')
  }
  return new Node(IL, null, I.subarray(32))
}
