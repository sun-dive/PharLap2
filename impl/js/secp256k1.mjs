// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * secp256k1 in JavaScript, written to be READ.
 *
 * ⚠⚠ ON "TWO INDEPENDENT IMPLEMENTATIONS" — the honest version. Two implementations written by the
 * same author are not truly independent, and no amount of discipline makes them so. **What makes this
 * arrangement catch errors is that the vectors were SEALED FROM THE BIP BEFORE EITHER SIDE EXISTED.**
 * The oracle is external. ⇒ So the value here is not that this file was written without looking at the
 * Python one; it is that both files are answerable to a target neither of them wrote.
 *
 * ★ Where the two genuinely do diverge is in the language, and that is where the real risk lives:
 * Python has arbitrary-precision ints and a modular `pow`; JavaScript has BigInt, no modular
 * exponentiation, and a `%` that returns NEGATIVE results for negative operands. Every one of those is
 * a place to get it wrong differently.
 *
 * ⚠⚠⚠ NOT CONSTANT TIME. BigInt operates on the magnitudes it is given: a 200-bit number costs less
 * than a 256-bit one, and no arrangement of JavaScript changes that. The defence here is BLINDING —
 * randomise what the ladder sees, so its timing stops correlating with the secret even though every
 * step is still variable-cost.
 *
 * ⚠⚠ AND A FIXED-PATTERN LADDER IS A REAL ALTERNATIVE, NOT AN IMPOSSIBLE ONE. An earlier version of
 * this note said the answer "is not a clever ladder", which was overstated: the library Phar Lap 1 used
 * ran a Montgomery ladder doing one add and one double per bit whatever the bit was, and MEASURED, its
 * cost is flat in Hamming weight — 2.4% spread across 256-bit scalars of weight 2 through 189.
 *   ⇒ The two defences protect DIFFERENT things, and neither covers the other:
 *     | which bits are set | a fixed-pattern ladder hides it outright. Blinding does not hide it, but
 *       the pattern belongs to `k + b·n`, which is fresh every call, not to the key.               |
 *     | the scalar's BIT LENGTH | ⚠ a Montgomery ladder that loops over `k.toString(2)` leaks it: at
 *       256 bits it measured 1.28 ms, at 192 bits 0.96 ms, at 64 bits 0.34 ms. Nonce bit-length is
 *       exactly what lattice attacks on ECDSA consume. Blinding hides it, because the length is then
 *       set by the random blind.                                                                   |
 *     | per-operation cost | neither. BigInt multiply still costs what its operands cost.          |
 *   ⇒ So the complete answer is BOTH: a fixed iteration count over a blinded scalar. That is a
 *     behaviour and performance decision, not a tidy-up, and it has not been taken.
 *
 *   | `mul`        | ⚠ PUBLIC scalars only. Reduces mod N, then a plain double-and-add whose work
 *     depends on the bits of the scalar. Verification's `u1`/`u2` are public and belong here.        |
 *   | `mulBlinded` | ★ SECRET scalars. `(k + b·n)·P == k·P` because `n·P` is infinity, so a random `b`
 *     gives a different bit pattern every call for the same key, and the same answer.                |
 *   | `invNBlinded`| ★ SECRET inverses. `(k·t)⁻¹·t == k⁻¹` for a random `t`, so the exponentiation
 *     never runs on the secret itself.                                                               |
 *
 * ⚠⚠ THIS WAS WRITTEN ONCE BEFORE AND WAS INERT FOR A DAY. `mulBlinded` lived in `ecdsa.mjs` and called
 *   `mul`, which begins `k = mod(k, N)` — reducing `k + b·n` straight back to `k`. It read correctly and
 *   did nothing; measured, the blinded call cost 0.998x the unblinded one. ⇒ Hence `mulRaw`, which does
 *   NOT reduce, and hence `test/blinding.mjs`, which COUNTS point additions rather than reading the
 *   source. A mitigation nothing measures is a comment.
 *
 * ⇒ Blinding RAISES THE COST of a timing attack; it does not make this a hardened implementation. The
 *   standing mitigation is unchanged: a key is used in a browser the user controls, and the air-gapped
 *   path exists for anything material. → `docs/AIR_GAPPED.md`
 */

import { concat, beBytes } from './bytes.mjs'

export const P  = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn
export const N  = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
export const G = { x: Gx, y: Gy }

/** ⚠ JavaScript's `%` keeps the sign of the dividend, so -1n % 7n is -1n, not 6n. */
const mod = (a, m = P) => ((a % m) + m) % m

/* ★ THE SECOND TEST SEAM, and it is needed for a different reason than `addCount`.
   `modPow`'s ITERATION COUNT comes from the exponent, which for an inverse is the fixed `N - 2`. So the
   work cannot be counted to tell a blinded inverse from an unblinded one; the only thing that differs is
   the BASE it is handed. ⇒ `test/blinding.mjs` asserts on that, because an `invNBlinded` that drew its
   randomness and then ignored it survived every other check written against it.
   ⚠ The value recorded here is the base actually used, which on the signing path is ALREADY BLINDED. It
     exists to be compared inside a test and must never be logged, serialised or exposed to a caller. */
let LAST_BASE = 0n
export const lastModPowBase = () => LAST_BASE

/** ⚠ There is no modular `pow` in JavaScript — a**b would be astronomically large before the %. */
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

const inv = a => modPow(a, P - 2n, P)      // Fermat — P is prime

/**
 * ★ EXPORTED, because two other modules need them and were each carrying their own copy. Modular
 *   exponentiation and an inverse are curve arithmetic; they belong here, once.
 * ⚠ `invN` is modulo **N**, the ORDER — not modulo P, the field. They are different numbers and
 *   using the wrong one produces a plausible result that verifies nowhere. Signature maths, and the
 *   OP_PUSH_TX constants, both work in the order.
 */
export { modPow, mod }
export const invN = a => modPow(mod(a, N), N - 2n, N)

/* ★ A TEST SEAM, and the reason it is in production code rather than a harness. The blinding bug above
   was invisible to every test we had, because the RESULT of a blinded multiply is identical to an
   unblinded one — that is the whole point of blinding. The only observable difference is how much work
   the ladder does. ⇒ One integer increment, alongside a modular inversion, buys a test that can tell. */
let ADDS = 0
export const addCount = () => ADDS

/** A point is {x, y}, or null for the point at infinity. */
export function add(p, q) {
  ADDS++
  if (p === null) return q
  if (q === null) return p
  let lam
  if (p.x === q.x) {
    if (mod(p.y + q.y) === 0n) return null        // p + (−p) = ∞
    lam = mod(3n * p.x * p.x * inv(2n * p.y))     // doubling
  } else {
    lam = mod((q.y - p.y) * inv(q.x - p.x))
  }
  const x = mod(lam * lam - p.x - q.x)
  return { x, y: mod(lam * (p.x - x) - p.y) }
}

/**
 * Double-and-add over the scalar EXACTLY AS GIVEN.
 * ⚠⚠ IT MUST NOT REDUCE. `mulBlinded` hands it `k + b·n`, deliberately larger than the order, and a
 *   `mod(k, N)` here would silently undo the blinding — which is precisely what happened before.
 */
function mulRaw(k, p) {
  let r = null, acc = p
  while (k > 0n) {
    if (k & 1n) r = add(r, acc)
    acc = add(acc, acc)
    k >>= 1n
  }
  return r
}

/** ⚠ PUBLIC scalars only. Work depends on the bits of `k`. Secret scalar? Use `mulBlinded`. */
export const mul = (k, p = G) => mulRaw(mod(k, N), p)

/* ══ JACOBIAN COORDINATES ═════════════════════════════════════════════════════════════════════════
 *
 * ★★★ WHY THESE EXIST, AND IT IS NOT ONLY ABOUT SPEED. A point is carried as (X, Y, Z) standing for
 *   the affine (X/Z², Y/Z³), with Z = 0 meaning the point at infinity. The reason that matters here is
 *   that affine `add` above needs a MODULAR INVERSE for every single addition — a 256-bit `modPow`,
 *   about 380 big multiplications — and a multiply performs several hundred additions. Jacobian form
 *   defers the inversion: ONE at the end of the whole multiply, not one per step.
 *
 * ⇒ That is what makes a constant-pattern ladder affordable. Measured on the library Phar Lap 1 used,
 *   its constant-time multiply costs about 2.5x its variable one, which sounds like the price of the
 *   property. For us it is the reverse: the ladder below does MORE point operations than the old
 *   double-and-add and is still several times faster, because it stopped inverting.
 *
 * ⚠ Formulas are the standard `dbl-2009-l` and `add-2007-bl` for a = 0, which secp256k1 is.
 */
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
  /* ⚠⚠ THIS BRANCH IS UNREACHABLE TODAY, AND IT IS LABELLED RATHER THAN DELETED OR PRETENDED OVER.
     Equal x means either a doubling or a cancelling pair, and the general formula gives 0/0 for both.
     But `jAdd` has exactly ONE caller, the ladder below, whose two registers differ by exactly P at
     every step — so neither case can arise there.
     ⇒ ⛔ NO TEST COVERS IT, and a mutation that broke it survived the suite. That is stated here
       because the alternative is a reader assuming the green suite means these lines were checked.
     ⇒ It stays because a second caller would need it and would not think to look. */
  if (H === 0n) return r === 0n ? jDbl(P1) : J_INF
  const I = mod(4n * H * H), J = mod(H * I), V = mod(U1 * I)
  const X3 = mod(r * r - J - 2n * V)
  return {
    X: X3,
    Y: mod(r * (V - X3) - 2n * S1 * J),
    Z: mod((mod((P1.Z + P2.Z) * (P1.Z + P2.Z)) - Z1Z1 - Z2Z2) * H),
  }
}

/** ⚠ THE ONE INVERSION. Everything above deferred it to here. */
const jToAffine = ({ X, Y, Z }) => {
  if (Z === 0n) return null
  const zi = inv(Z), zi2 = mod(zi * zi)
  return { x: mod(X * zi2), y: mod(Y * zi2 * zi) }
}

/* ★ A SECOND SEAM, for the same reason as `lastModPowBase`. Once the ladder runs a FIXED number of
   steps, counting its work can no longer show that blinding happened — a constant is a constant either
   way. What still differs is the SCALAR it was handed, so the test reads that.
   ⚠ Records a blinded value, never the raw secret. Never log it, never return it to a caller. */
let LAST_SCALAR = 0n
export const lastLadderScalar = () => LAST_SCALAR

/**
 * ★★★ MONTGOMERY LADDER, FIXED WIDTH. Every iteration performs exactly one addition and one doubling
 *   whichever way the bit goes — the bit selects which register RECEIVES the result, never whether work
 *   happens. And the loop runs `width` times regardless of how large `k` actually is.
 *
 * ⚠⚠ THAT SECOND PART IS THE ONE MOST IMPLEMENTATIONS MISS, INCLUDING THE ONE THIS PROJECT REPLACED.
 *   Its ladder loops over `k.toString(2)`, so the ITERATION COUNT is the scalar's bit length. Measured:
 *   1.28 ms at 256 bits, 0.96 ms at 192, 0.34 ms at 64. A nonce that happens to be short is visible to
 *   anyone who can time the signature, and short nonces are exactly what lattice attacks on ECDSA feed
 *   on. Fixing the width costs nothing and closes it.
 */
function mulLadder(k, p, width) {
  const R = [J_INF, { X: p.x, Y: p.y, Z: 1n }]
  for (let i = width - 1; i >= 0; i--) {
    const b = Number((k >> BigInt(i)) & 1n)
    R[1 - b] = jAdd(R[0], R[1])       // ⚠ written first: R[b] below must be the value from before
    R[b] = jDbl(R[b])
  }
  return jToAffine(R[0])
}

/* ⚠ 8 bytes of blinding, matching the PHP sibling (`jetmora/server/secp256k1.php`). */
const rand8 = n => crypto.getRandomValues(new Uint8Array(n))

/* ⚠⚠ THE WIDTH IS A CONSTANT AND MUST STAY ONE. `k + b·n` with an 8-byte `b` is at most 320 bits, so
   321 covers every case with room to spare. ⛔ Deriving it from the scalar — `bitLength(k)`, or a
   `while (k > 0n)` — is precisely the leak this ladder exists to close. */
const LADDER_WIDTH = 321

/**
 * ★ SECRET scalars. Two defences, and they cover different things:
 *   | the fixed-pattern, fixed-width ladder | hides WHICH BITS ARE SET and HOW MANY THERE ARE       |
 *   | blinding, `(k + b·n)·P == k·P`        | means the bits walked are not the key's in the first
 *     place, so even a residual leak in the arithmetic is a leak about `b`, which is thrown away    |
 * ⚠ Blinding is ON BY DEFAULT. It was opt-in before, and nothing opted in.
 */
export function mulBlinded(k, p = G, rand = rand8) {
  k = mod(k, N)
  if (k === 0n) return null
  let b = 0n
  for (const byte of rand(8)) b = (b << 8n) | BigInt(byte)
  if (b === 0n) b = 1n                          // ⚠ b = 0 is no blinding at all — never let it through
  LAST_SCALAR = k + b * N
  return mulLadder(LAST_SCALAR, p, LADDER_WIDTH)
}

/**
 * ★ SECRET inverses. `(k·t)⁻¹·t == k⁻¹` for any invertible `t`, so `modPow` — whose work depends on its
 *   base — never sees the secret nonce itself.
 */
export function invNBlinded(k, rand = rand8) {
  let t = 0n
  for (const byte of rand(32)) t = (t << 8n) | BigInt(byte)
  t = mod(t, N)
  if (t === 0n) t = 1n
  return mod(invN(mod(k * t, N)) * t, N)
}

/* ⚠ `beBytes` lives in `bytes.mjs`. Two copies of a left-padding routine is two chances to drop the
   padding, and BIP-32 breaks silently when that happens — see ser256 below. */

/** SEC1 compressed: 0x02 if y is even, 0x03 if odd, then x as 32 bytes. */
export const serP = pt => concat(Uint8Array.of(2 + Number(pt.y & 1n)), beBytes(pt.x, 32))

/**
 * ⚠⚠ ALWAYS 32 BYTES. THIS IS WHAT "RETENTION OF LEADING ZEROS" MEANS IN BIP-32.
 *
 * Two published test vectors derive a private key whose first byte is zero — `tv3/m` starts `00dd`,
 * `tv4/m/0'` starts `00d9`. A minimal-length encoding gives 31 bytes, every field after it shifts, and
 * the extended key is wrong from that point on.
 * ⇒ Verified on the Python side by breaking it on purpose: minimal length fails 4 of the 17.
 */
export const ser256 = k => beBytes(k, 32)
export const ser32 = i => beBytes(BigInt(i), 4)
