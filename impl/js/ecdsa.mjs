/**
 * ECDSA over secp256k1 — signing, verification, and STRICT DER.
 *
 * ★ THIS FILE OWNS THE SIGNING PATH. `secp256k1.mjs` was written for BIP-32 derivation and deferred
 *   signing to a library; that deferral is what this replaces. The wallet's signing path is its own.
 *
 * ⛔⛔ STRICT DER, AND THE RULE THAT IS EASIEST TO MISS:
 *   A DER INTEGER is SIGNED. One whose top bit is set REQUIRES a leading `0x00`, or the value reads as
 *   negative. ⇒ Omit that byte and you have **two different byte strings for one signature** — the
 *   classic malleability. **BIP-66 has made the unpadded form invalid on the network since 2015**, so a
 *   parser that accepts it is MORE PERMISSIVE THAN CONSENSUS: it can call a transaction good that no
 *   node would accept. `decodeDer` refuses it, along with BER long-form lengths, trailing bytes and
 *   non-minimal leading zeros.
 *
 * ⚠⚠ NOT CONSTANT TIME, and cannot be. That is a property of JavaScript rather than of any particular
 *   implementation: JIT compilation and garbage collection put it out of reach in a scripting language.
 *   ⇒ Scalar blinding below decorrelates timing without pretending to solve it. **For anything
 *   material, sign air-gapped.**
 */
import { N, G, mul, add, serP } from './secp256k1.mjs'
import { makeRfc6979 } from './rfc6979.mjs'

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn
const mod = (a, m) => ((a % m) + m) % m
const modPow = (b, e, m) => { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n } return r }
const invN = a => modPow(mod(a, N), N - 2n, N)

const beBytes = (n, len) => {
  const out = Buffer.alloc(len)
  for (let i = len - 1; i >= 0; i--) { out[i] = Number(n & 0xffn); n >>= 8n }
  if (n !== 0n) throw new RangeError(`does not fit in ${len} bytes`)
  return out
}
const toBig = b => (b.length ? BigInt('0x' + Buffer.from(b).toString('hex')) : 0n)

/**
 * ★ Scalar blinding: `(k + b·n)·P == k·P` because `n·P` is the point at infinity.
 * ⇒ The ladder runs over a different bit pattern each time, which decorrelates timing from the secret
 *   WITHOUT needing constant-time arithmetic. ⚠ Mitigation, not a fix — see the module note.
 */
function mulBlinded(k, pt = G, rand) {
  k = mod(k, N)
  if (k === 0n) return null
  const b = rand ? toBig(rand(8)) : 0n
  return mul(k + b * N, pt)
}

export function publicKey(d, compressed = true) {
  const pt = mul(mod(d, N), G)
  if (pt === null) throw new Error('private key out of range')
  return compressed ? serP(pt) : Buffer.concat([Buffer.from([0x04]), beBytes(pt.x, 32), beBytes(pt.y, 32)])
}

/** ⚠ DER INTEGERs are SIGNED: a high top bit needs a `0x00` in front or the value reads negative. */
function derInt(v) {
  let b = beBytes(v, 32)
  b = b.subarray(b.findIndex(x => x !== 0) === -1 ? 31 : b.findIndex(x => x !== 0))
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b])
  return Buffer.concat([Buffer.from([0x02, b.length]), b])
}

export function encodeDer(r, s) {
  const body = Buffer.concat([derInt(r), derInt(s)])
  return Buffer.concat([Buffer.from([0x30, body.length]), body])
}

/**
 * STRICT by default. `allowTrailing` permits ONE thing — bytes after the sequence, which is where
 * Bitcoin's sighash byte lives. ⚠ It does NOT relax the integer rules.
 * @returns {[bigint, bigint] | null}
 */
export function decodeDer(sig, allowTrailing = false) {
  const b = Buffer.from(sig)
  if (b.length < 8 || b[0] !== 0x30) return null
  const len = b[1]
  if (len & 0x80) return null                                  // ⛔ long-form length is BER, not DER
  if (!allowTrailing && 2 + len !== b.length) return null       // ⛔ trailing bytes
  if (2 + len > b.length) return null
  let p = 2
  const readInt = () => {
    if (b[p++] !== 0x02) return null
    const l = b[p++]
    if (l === 0 || l > 33 || p + l > b.length) return null
    const v = b.subarray(p, p + l); p += l
    if (v[0] & 0x80) return null                                // ⛔ NEGATIVE — see the module note
    if (v[0] === 0x00 && !(v[1] & 0x80)) return null            // ⛔ non-minimal leading zero
    return toBig(v)
  }
  const r = readInt(); if (r === null) return null
  const s = readInt(); if (s === null) return null
  if (p !== 2 + len) return null
  if (r <= 0n || s <= 0n || r >= N || s >= N) return null
  return [r, s]
}

/**
 * Sign a 32-byte DIGEST. ⚠ Not a message — ECDSA cannot consume bytes, only a digest, so the hash is
 * the caller's explicit responsibility.
 * @param {bigint} d
 * @param {Uint8Array} digest32
 * @param {{lowS?: boolean, hmac: Function, rand?: Function}} opts
 */
export function sign(d, digest32, { lowS = false, hmac, rand } = {}) {
  if (digest32.length !== 32) throw new Error('a digest is 32 bytes')
  if (typeof hmac !== 'function') throw new Error('an hmac implementation is required — see rfc6979.mjs')
  const k6979 = makeRfc6979(hmac)
  const z = toBig(digest32)
  for (let attempt = 0; attempt < 64; attempt++) {
    const k = k6979(N, mod(d, N), digest32, attempt)
    const pt = mulBlinded(k, G, rand)
    if (pt === null) continue
    const r = mod(pt.x, N)
    if (r === 0n) continue                       // ★ retry steps the generator forward, never randomly
    let s = mod(invN(k) * (z + r * mod(d, N)), N)
    if (s === 0n) continue
    // ⚠ lowS is NOT a protocol rule, but a broadcaster can refuse high-s — this project has been
    //   refused by exactly that. ⇒ negating s is deterministic, so reproducibility survives.
    if (lowS && s > N / 2n) s = N - s
    return encodeDer(r, s)
  }
  throw new Error('no valid signature after 64 attempts — statistically impossible; something is wrong')
}

/** Verify a DER signature over a 32-byte digest. */
export function verifyDigest(sig, pub, digest32, allowTrailing = false) {
  const parsed = decodeDer(sig, allowTrailing)
  if (parsed === null) return false
  const [r, s] = parsed
  const Q = decodePoint(pub)
  if (Q === null) return false
  const z = toBig(digest32)
  const w = invN(s)
  const p1 = mul(mod(z * w, N), G)
  const p2 = mul(mod(r * w, N), Q)
  const R = add(p1, p2)
  return R !== null && mod(R.x, N) === r
}

/** SEC1 point decoding, compressed or uncompressed. */
export function decodePoint(pub) {
  const b = Buffer.from(pub)
  if (b.length === 33 && (b[0] === 0x02 || b[0] === 0x03)) {
    const x = toBig(b.subarray(1))
    if (x >= P) return null
    const y2 = mod(x * x % P * x + 7n, P)
    let y = modPow(y2, (P + 1n) / 4n, P)
    if (modPow(y, 2n, P) !== y2) return null       // ⛔ not on the curve
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
