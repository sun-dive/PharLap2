# impl/js/secp256k1.mjs

secp256k1 in JavaScript, written to be READ.

⚠⚠ ON "TWO INDEPENDENT IMPLEMENTATIONS" — the honest version. Two implementations written by the
same author are not truly independent, and no amount of discipline makes them so. **What makes this
arrangement catch errors is that the vectors were SEALED FROM THE BIP BEFORE EITHER SIDE EXISTED.**
The oracle is external. ⇒ So the value here is not that this file was written without looking at the
Python one; it is that both files are answerable to a target neither of them wrote.

★ Where the two genuinely do diverge is in the language, and that is where the real risk lives:
Python has arbitrary-precision ints and a modular `pow`; JavaScript has BigInt, no modular
exponentiation, and a `%` that returns NEGATIVE results for negative operands. Every one of those is
a place to get it wrong differently.

⚠⚠⚠ NOT CONSTANT TIME. BigInt operates on the magnitudes it is given: a 200-bit number costs less
than a 256-bit one, and no arrangement of JavaScript changes that. The defence here is BLINDING —
randomise what the ladder sees, so its timing stops correlating with the secret even though every
step is still variable-cost.

⚠⚠ A FIXED-PATTERN LADDER IS THE OTHER HALF. A Montgomery ladder does one addition and one doubling
per bit whichever way the bit goes, so its cost stops tracking the scalar.
  ⇒ THREE THINGS LEAK, AND THEY ARE NOT THE SAME PROBLEM:
    | which bits are set | ✅ the ladder hides it outright — a plain double-and-add works only on the
      1 bits, so its cost tracks the scalar's Hamming weight.                                     |
    | how many bits there are | ⚠ ONLY IF THE LOOP COUNT IS A CONSTANT. A ladder that runs
      `bitLength(k)` times leaks the size of the scalar, which is what lattice attacks on ECDSA
      consume. MEASURED on the ladder below, run at width = the scalar's own bit length: 1.65 ms at
      256 bits, 1.14 at 192, 0.44 at 64 — a short scalar costs a quarter of a full one.           |
    | per-operation cost | ⛔ NEITHER defence touches this, and nothing in JavaScript can. A BigInt
      multiply costs what its operands cost.                                                      |

⚠⚠⚠ A FIXED WIDTH ALONE DOES NOT DO IT. Padding the loop to a constant makes the OPERATION COUNT
  constant, but leading zero bits are cheap: `R0` is still infinity and both formulas return early.
  Measured at width 321, a 256-bit scalar cost 1.53 ms and a 64-bit one 0.44 ms — same count, and not
  the same time.
  ⇒ ★ BLINDING IS WHAT ACTUALLY CLOSES IT: `k + b·n` with an 8-byte `b` is ~320 bits whatever `k`
    was, so there are no leading zeros to be cheap. The fixed width then makes that structural
    rather than a happy consequence of `b` being large.
  ⇒ Measured end to end on the shipped path, keys from 4 bits to 256: **2.0% spread**.

  | `mul`        | ⚠ PUBLIC scalars only. Reduces mod N, then a plain double-and-add whose work
    depends on the bits of the scalar. Verification's `u1`/`u2` are public and belong here.        |
  | `mulBlinded` | ★ SECRET scalars. `(k + b·n)·P == k·P` because `n·P` is infinity, so a random `b`
    gives a different bit pattern every call for the same key, and the same answer.                |
  | `invNBlinded`| ★ SECRET inverses. `(k·t)⁻¹·t == k⁻¹` for a random `t`, so the exponentiation
    never runs on the secret itself.                                                               |

⚠⚠ THIS WAS WRITTEN ONCE BEFORE AND WAS INERT FOR A DAY. `mulBlinded` lived in `ecdsa.mjs` and called
  `mul`, which begins `k = mod(k, N)` — reducing `k + b·n` straight back to `k`. It read correctly and
  did nothing; measured, the blinded call cost 0.998x the unblinded one. ⇒ Hence `mulRaw`, which does
  NOT reduce, and hence `test/blinding.mjs`, which COUNTS point additions rather than reading the
  source. A mitigation nothing measures is a comment.

⇒ Blinding RAISES THE COST of a timing attack; it does not make this a hardened implementation. The
  standing mitigation is unchanged: a key is used in a browser the user controls, and the air-gapped
  path exists for anything material. → `docs/AIR_GAPPED.md`

## mod

⚠ JavaScript's `%` keeps the sign of the dividend, so -1n % 7n is -1n, not 6n.

## LAST_BASE

★ THE SECOND TEST SEAM, and it is needed for a different reason than `addCount`.
`modPow`'s ITERATION COUNT comes from the exponent, which for an inverse is the fixed `N - 2`. So the
work cannot be counted to tell a blinded inverse from an unblinded one; the only thing that differs is
the BASE it is handed. ⇒ `test/blinding.mjs` asserts on that, because an `invNBlinded` that drew its
randomness and then ignored it survived every other check written against it.
⚠ The value recorded here is the base actually used, which on the signing path is ALREADY BLINDED. It
  exists to be compared inside a test and must never be logged, serialised or exposed to a caller.

## modPow

⚠ There is no modular `pow` in JavaScript — a**b would be astronomically large before the %.

## `export { modPow, mod }`

Fermat — P is prime

★ EXPORTED, because two other modules need them and were each carrying their own copy. Modular
  exponentiation and an inverse are curve arithmetic; they belong here, once.
⚠ `invN` is modulo **N**, the ORDER — not modulo P, the field. They are different numbers and
  using the wrong one produces a plausible result that verifies nowhere. Signature maths, and the
  OP_PUSH_TX constants, both work in the order.

## ADDS

★ A TEST SEAM, and the reason it is in production code rather than a harness. The blinding bug above
was invisible to every test we had, because the RESULT of a blinded multiply is identical to an
unblinded one — that is the whole point of blinding. The only observable difference is how much work
the ladder does. ⇒ One integer increment, alongside a modular inversion, buys a test that can tell.

## add

A point is {x, y}, or null for the point at infinity.

At `if (mod(p.y + q.y) === 0n) return null`:

p + (−p) = ∞

At `lam = mod(3n * p.x * p.x * inv(2n * p.y))`:

doubling

## mulRaw

Double-and-add over the scalar EXACTLY AS GIVEN.
⚠⚠ IT MUST NOT REDUCE. `mulBlinded` hands it `k + b·n`, deliberately larger than the order, and a
  `mod(k, N)` here would silently undo the blinding — which is precisely what happened before.

## mul

⚠ PUBLIC scalars only. Work depends on the bits of `k`. Secret scalar? Use `mulBlinded`.

## J_INF

══ JACOBIAN COORDINATES ═════════════════════════════════════════════════════════════════════════

★★★ WHY THESE EXIST, AND IT IS NOT ONLY ABOUT SPEED. A point is carried as (X, Y, Z) standing for
  the affine (X/Z², Y/Z³), with Z = 0 meaning the point at infinity. The reason that matters here is
  that affine `add` above needs a MODULAR INVERSE for every single addition — a 256-bit `modPow`,
  about 380 big multiplications — and a multiply performs several hundred additions. Jacobian form
  defers the inversion: ONE at the end of the whole multiply, not one per step.

⇒ That is what makes a constant-pattern ladder affordable, and it is worth knowing WHY, because the
  received wisdom is that constant time costs a multiple of variable time. It does, when the variable
  version is already efficient. Ours was not: it inverted on every step. ⇒ The ladder below does MORE
  point operations than the old double-and-add and still runs 19x faster — 40.5 ms to 2.10 ms per
  signature — because the property it bought displaced the expensive part.
  ★ So before accepting "hardening costs N times", check what it REPLACES.

⚠ Formulas are the standard `dbl-2009-l` and `add-2007-bl` for a = 0, which secp256k1 is.

## jAdd

At `if (H === 0n) return r === 0n ? jDbl(P1) : J_INF`:

Equal x means either a doubling or a cancelling pair, and the general formula gives 0/0 for both.
The ladder never reaches this (its registers differ by exactly P at every step); `mulAdd` does,
when P1 = ±P2 or an accumulator meets a table entry. test/ecdsa.mjs covers both outcomes.

## jToAffine

⚠ THE ONE INVERSION. Everything above deferred it to here.

## LAST_SCALAR

★ A SECOND SEAM, for the same reason as `lastModPowBase`. Once the ladder runs a FIXED number of
steps, counting its work can no longer show that blinding happened — a constant is a constant either
way. What still differs is the SCALAR it was handed, so the test reads that.
⚠ Records a blinded value, never the raw secret. Never log it, never return it to a caller.

## mulLadder

★★★ MONTGOMERY LADDER, FIXED WIDTH. Every iteration performs exactly one addition and one doubling
  whichever way the bit goes — the bit selects which register RECEIVES the result, never whether work
  happens. And the loop runs `width` times regardless of how large `k` actually is.

⚠⚠ THAT SECOND PART IS THE ONE EASILY MISSED. Deriving the loop count from the scalar — `bitLength(k)`,
  or the natural `while (k > 0n)` — makes the ITERATION COUNT the scalar's size. Measured on this very
  function, run at width = the scalar's own bit length: 1.65 ms at 256 bits, 1.14 at 192, 0.44 at 64.
  A nonce that happens to be short would be visible to anyone who can time the signature, and short
  nonces are exactly what lattice attacks on ECDSA feed on. A constant width costs nothing.

⚠ BUT IT IS NOT SUFFICIENT ON ITS OWN. Leading zero bits are cheap here — `R[0]` is still infinity and
  both formulas return early — so a fixed width alone equalises the COUNT and not the TIME: at width
  321 a 256-bit scalar measured 1.53 ms against 0.44 for a 64-bit one. ⇒ It is `mulBlinded` handing
  this a scalar that is always ~320 bits that makes the width real. **Do not call this directly with
  a secret.**

At `R[1 - b] = jAdd(R[0], R[1])`:

⚠ written first: R[b] below must be the value from before

## mulAdd

★ PUBLIC scalars, two at once: a·P1 + b·P2, which is what verification computes. Straus-Shamir:
  one shared doubling per bit and at most one addition, from a table of {P1, P2, P1+P2}, all in
  Jacobian form with the single inversion at the end. ⚠ Variable time on purpose — u1, u2, G and the
  public key are all public; a secret scalar belongs in `mulBlinded`.
  Measured in `verifyDigest` against the affine `mul` + `add` it replaces: 68.9 ms → 1.55 ms.

## rand8

⚠ 8 bytes of blinding, matching the PHP sibling (`jetmora/server/secp256k1.php`).

## LADDER_WIDTH

⚠⚠ THE WIDTH IS A CONSTANT AND MUST STAY ONE. `k + b·n` with an 8-byte `b` is at most 320 bits, so
321 covers every case with room to spare. ⛔ Deriving it from the scalar — `bitLength(k)`, or a
`while (k > 0n)` — is precisely the leak this ladder exists to close.

## mulBlinded

★ SECRET scalars. Two defences, and they cover different things:
  | the fixed-pattern, fixed-width ladder | hides WHICH BITS ARE SET and HOW MANY THERE ARE       |
  | blinding, `(k + b·n)·P == k·P`        | means the bits walked are not the key's in the first
    place, so even a residual leak in the arithmetic is a leak about `b`, which is thrown away    |
⚠ Blinding is ON BY DEFAULT. It was opt-in before, and nothing opted in.

At `if (b === 0n) b = 1n`:

⚠ b = 0 is no blinding at all — never let it through

## invNBlinded

★ SECRET inverses. `(k·t)⁻¹·t == k⁻¹` for any invertible `t`, so `modPow` — whose work depends on its
  base — never sees the secret nonce itself.

## serP

⚠ `beBytes` lives in `bytes.mjs`. Two copies of a left-padding routine is two chances to drop the
padding, and BIP-32 breaks silently when that happens — see ser256 below.

SEC1 compressed: 0x02 if y is even, 0x03 if odd, then x as 32 bytes.

## ser256

⚠⚠ ALWAYS 32 BYTES. THIS IS WHAT "RETENTION OF LEADING ZEROS" MEANS IN BIP-32.

Two published test vectors derive a private key whose first byte is zero — `tv3/m` starts `00dd`,
`tv4/m/0'` starts `00d9`. A minimal-length encoding gives 31 bytes, every field after it shifts, and
the extended key is wrong from that point on.
⇒ Verified on the Python side by breaking it on purpose: minimal length fails 4 of the 17.
