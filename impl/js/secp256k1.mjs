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
 * ⚠⚠⚠ NOT CONSTANT TIME — AND NEITHER IS THE SIGNING PATH. This line used to say that signing was done
 * elsewhere, by something hardened. That stopped being true when this project took the signing over:
 * `ecdsa.mjs` is our own code, on JavaScript BigInt, and BigInt arithmetic is not constant time either.
 *   ⇒ So the honest statement is that NOTHING here resists a timing attacker, and the mitigation is not
 *     in the arithmetic: it is that a key is used in a browser the user controls, and that the
 *     air-gapped path exists for anything material. → `docs/AIR_GAPPED.md`
 *   ⛔ Do not read this file's caution as implying some other file is safe.
 */

import { concat, beBytes } from './bytes.mjs'

export const P  = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn
export const N  = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
export const G = { x: Gx, y: Gy }

/** ⚠ JavaScript's `%` keeps the sign of the dividend, so -1n % 7n is -1n, not 6n. */
const mod = (a, m = P) => ((a % m) + m) % m

/** ⚠ There is no modular `pow` in JavaScript — a**b would be astronomically large before the %. */
function modPow(base, exp, m) {
  let r = 1n, b = mod(base, m)
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

/** A point is {x, y}, or null for the point at infinity. */
export function add(p, q) {
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

/** Double-and-add. ⚠ Not constant time — see the module note. */
export function mul(k, p = G) {
  k = mod(k, N)
  let r = null, acc = p
  while (k > 0n) {
    if (k & 1n) r = add(r, acc)
    acc = add(acc, acc)
    k >>= 1n
  }
  return r
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
