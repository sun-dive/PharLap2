// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).

import { concat, beBytes } from './bytes.mjs'

export const P  = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn
export const N  = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
export const G = { x: Gx, y: Gy }

const mod = (a, m = P) => ((a % m) + m) % m

let LAST_BASE = 0n
export const lastModPowBase = () => LAST_BASE

function modPow(base, exp, m) {
  let r = 1n, b = mod(base, m)
  LAST_BASE = b
  while (exp > 0n) {
    if (exp & 1n) r = (r * b) % m
    b = (b * b) % m
    exp >>= 1n
  }
  return r
}

const inv = a => modPow(a, P - 2n, P)

export { modPow, mod }
export const invN = a => modPow(mod(a, N), N - 2n, N)

let ADDS = 0
export const addCount = () => ADDS

export function add(p, q) {
  ADDS++
  if (p === null) return q
  if (q === null) return p
  let lam
  if (p.x === q.x) {
    if (mod(p.y + q.y) === 0n) return null
    lam = mod(3n * p.x * p.x * inv(2n * p.y))
  } else {
    lam = mod((q.y - p.y) * inv(q.x - p.x))
  }
  const x = mod(lam * lam - p.x - q.x)
  return { x, y: mod(lam * (p.x - x) - p.y) }
}

function mulRaw(k, p) {
  let r = null, acc = p
  while (k > 0n) {
    if (k & 1n) r = add(r, acc)
    acc = add(acc, acc)
    k >>= 1n
  }
  return r
}

export const mul = (k, p = G) => mulRaw(mod(k, N), p)

const J_INF = { X: 0n, Y: 1n, Z: 0n }

function jDbl({ X, Y, Z }) {
  ADDS++
  if (Z === 0n || Y === 0n) return J_INF
  const A = mod(X * X), B = mod(Y * Y), C = mod(B * B)
  const D = mod(2n * (mod((X + B) * (X + B)) - A - C))
  const E = mod(3n * A), F = mod(E * E)
  const X3 = mod(F - 2n * D)
  return { X: X3, Y: mod(E * (D - X3) - 8n * C), Z: mod(2n * Y * Z) }
}

function jAdd(P1, P2) {
  ADDS++
  if (P1.Z === 0n) return P2
  if (P2.Z === 0n) return P1
  const Z1Z1 = mod(P1.Z * P1.Z), Z2Z2 = mod(P2.Z * P2.Z)
  const U1 = mod(P1.X * Z2Z2), U2 = mod(P2.X * Z1Z1)
  const S1 = mod(P1.Y * P2.Z * Z2Z2), S2 = mod(P2.Y * P1.Z * Z1Z1)
  const H = mod(U2 - U1), r = mod(2n * (S2 - S1))
  if (H === 0n) return r === 0n ? jDbl(P1) : J_INF
  const I = mod(4n * H * H), J = mod(H * I), V = mod(U1 * I)
  const X3 = mod(r * r - J - 2n * V)
  return {
    X: X3,
    Y: mod(r * (V - X3) - 2n * S1 * J),
    Z: mod((mod((P1.Z + P2.Z) * (P1.Z + P2.Z)) - Z1Z1 - Z2Z2) * H),
  }
}

const jToAffine = ({ X, Y, Z }) => {
  if (Z === 0n) return null
  const zi = inv(Z), zi2 = mod(zi * zi)
  return { x: mod(X * zi2), y: mod(Y * zi2 * zi) }
}

let LAST_SCALAR = 0n
export const lastLadderScalar = () => LAST_SCALAR

function mulLadder(k, p, width) {
  const R = [J_INF, { X: p.x, Y: p.y, Z: 1n }]
  for (let i = width - 1; i >= 0; i--) {
    const b = Number((k >> BigInt(i)) & 1n)
    R[1 - b] = jAdd(R[0], R[1])
    R[b] = jDbl(R[b])
  }
  return jToAffine(R[0])
}

const bitLength = k => k === 0n ? 0 : k.toString(2).length

export function mulAdd(a, P1, b, P2) {
  a = mod(a, N); b = mod(b, N)
  const J1 = { X: P1.x, Y: P1.y, Z: 1n }, J2 = { X: P2.x, Y: P2.y, Z: 1n }
  const table = [null, J1, J2, jAdd(J1, J2)]
  let R = J_INF
  for (let i = Math.max(bitLength(a), bitLength(b)) - 1; i >= 0; i--) {
    R = jDbl(R)
    const idx = Number((a >> BigInt(i)) & 1n) | (Number((b >> BigInt(i)) & 1n) << 1)
    if (idx) R = jAdd(R, table[idx])
  }
  return jToAffine(R)
}

const rand8 = n => crypto.getRandomValues(new Uint8Array(n))

const LADDER_WIDTH = 321

export function mulBlinded(k, p = G, rand = rand8) {
  k = mod(k, N)
  if (k === 0n) return null
  let b = 0n
  for (const byte of rand(8)) b = (b << 8n) | BigInt(byte)
  if (b === 0n) b = 1n
  LAST_SCALAR = k + b * N
  return mulLadder(LAST_SCALAR, p, LADDER_WIDTH)
}

export function invNBlinded(k, rand = rand8) {
  let t = 0n
  for (const byte of rand(32)) t = (t << 8n) | BigInt(byte)
  t = mod(t, N)
  if (t === 0n) t = 1n
  return mod(invN(mod(k * t, N)) * t, N)
}

export const serP = pt => concat(Uint8Array.of(2 + Number(pt.y & 1n)), beBytes(pt.x, 32))

export const ser256 = k => beBytes(k, 32)
export const ser32 = i => beBytes(BigInt(i), 4)
