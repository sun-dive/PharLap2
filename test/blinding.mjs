// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The signing path's timing defences — a fixed-width constant-pattern ladder, over a blinded scalar.
 *
 * ★★★ NOTHING HERE CAN BE CHECKED BY READING THE SOURCE, WHICH IS THE WHOLE REASON THE FILE EXISTS.
 *   Both defences are invisible in the result by construction: `(k + b·n)·P == k·P`, and a ladder that
 *   does redundant work returns the same point as one that does not. An earlier attempt at blinding was
 *   INERT FOR A DAY - it called a multiply that reduced `k + b·n` straight back to `k` - and every suite
 *   stayed green throughout. So everything below is a MEASUREMENT: point operations counted, and the
 *   scalar actually handed to the ladder read back through a seam.
 *
 * ⚠⚠ AND THE MEASUREMENT CHANGED WHEN THE LADDER DID. The previous version of this file proved blinding
 *   by showing the work VARIED between calls. That test is now wrong in the other direction: a fixed
 *   ladder does identical work every time on purpose. ⇒ Constant work is now the claim, and blinding is
 *   proved from the scalar instead.
 */
import {
  N, G, mul, mulBlinded, invN, invNBlinded, addCount, lastModPowBase, lastLadderScalar,
} from '../impl/js/secp256k1.mjs'
import { sign, verifyDigest, publicKey } from '../impl/js/ecdsa.mjs'
import { fromSeed } from '../impl/js/bip32.mjs'
import { encrypt } from '../impl/js/ecies.mjs'
import { fromHex, toHex } from '../impl/js/bytes.mjs'

let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

/** point operations performed by one call */
const adds = f => { const before = addCount(); f(); return addCount() - before }

const D = BigInt('0x' + 'c0ffee'.padStart(64, '1'))
const DIGEST = fromHex('7f'.repeat(32))

// ── ★★★ 1 · THE WORK IS CONSTANT, AND THAT INCLUDES THE WIDTH ───────────────────────────────────────
// ⚠⚠ TWO SEPARATE LEAKS, AND MOST IMPLEMENTATIONS CLOSE ONLY THE FIRST.
//   · WHICH BITS ARE SET - a plain double-and-add works only on the 1 bits, so its cost tracks the
//     scalar's Hamming weight. A Montgomery ladder does one add and one double per bit either way.
//   · HOW MANY BITS THERE ARE - ⚠ a ladder that loops over the scalar's bit LENGTH still leaks that.
//     Measured on the library this project replaced: 1.28 ms at 256 bits, 0.96 ms at 192, 0.34 ms at
//     64. Short nonces are exactly what lattice attacks on ECDSA consume, so this one matters.
{
  const counts = new Set()
  for (const k of [1n, 3n, 255n, 0x1234n, (N + 1n) / 2n, N - 1n]) counts.add(adds(() => mulBlinded(k, G)))
  ok(counts.size === 1,
     `★★★ a one-bit scalar and a 256-bit one cost the SAME (${[...counts].join(', ')} operations)`)

  const rep = new Set()
  for (let i = 0; i < 12; i++) rep.add(adds(() => mulBlinded(D, G)))
  ok(rep.size === 1, `★★★ …and the same key costs the same on every call (${[...rep].join(', ')})`)

  // ⛔ THE CONTROL. Without it a broken counter would report "constant" for everything. The public-scalar
  //   multiply is a deliberate variable-time double-and-add, so it MUST vary here.
  const varied = new Set()
  for (const k of [1n, 255n, N - 1n]) varied.add(adds(() => mul(k, G)))
  ok(varied.size > 1,
     `⛔★ the counter is live: the PUBLIC multiply still varies with the scalar (${[...varied].join(', ')})`)
}

// ── ★★★ 2 · AND THE ANSWER IS RIGHT ─────────────────────────────────────────────────────────────────
// ⚠ A ladder is easy to get subtly wrong - the degenerate cases in Jacobian addition give 0/0 - so it is
//   swept against the affine multiply rather than sampled.
{
  let bad = 0
  const ks = [1n, 2n, 3n, N - 1n, N - 2n, (N + 1n) / 2n]
  for (let i = 0; i < 40; i++) {
    let r = 0n
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) r = (r << 8n) | BigInt(byte)
    ks.push(r % N || 1n)
  }
  for (const k of ks) {
    const a = mul(k, G), b = mulBlinded(k, G)
    if (a.x !== b.x || a.y !== b.y) bad++
  }
  ok(bad === 0, `★★★ the ladder agrees with the affine multiply on ${ks.length} scalars (${bad} wrong)`)

  const P = mul(7n, G)
  let bad2 = 0
  for (let i = 1; i < 20; i++) {
    const a = mul(BigInt(i * 977 + 3), P), b = mulBlinded(BigInt(i * 977 + 3), P)
    if (a.x !== b.x || a.y !== b.y) bad2++
  }
  ok(bad2 === 0, '★★ …and on a point that is not the generator, where Z is not 1')
}

// ── ★★★ 3 · THE BLINDING IS STILL LIVE ──────────────────────────────────────────────────────────────
// ⚠⚠ THE OLD PROOF NO LONGER WORKS, AND THAT IS WHY THIS SECTION IS WRITTEN DIFFERENTLY. Blinding used
//   to show up as a varying amount of work; with a fixed ladder it cannot show up that way at all. What
//   still distinguishes it is the SCALAR the ladder was handed, so the seam reports that.
// ★ The structural check is the strong one: whatever was fed in must be `k` plus a MULTIPLE OF THE
//   ORDER, and must not be `k` itself. That is the blinding identity, asserted directly.
{
  const seen = new Set()
  for (let i = 0; i < 16; i++) { mulBlinded(D, G); seen.add(lastLadderScalar()) }
  ok(seen.size > 12, `★★★ 16 calls fed the ladder ${seen.size} different scalars`)
  ok(![...seen].includes(D), '★★★ …none of which was the key itself')
  ok([...seen].every(s => (s - D) % N === 0n),
     '★★★ …and every one was k plus a multiple of the order, which is the blinding identity')
  ok([...seen].every(s => s > N), '★ …so each is larger than the order, never reduced back down')
}

// ── ★★ 4 · THE INVERSE IS BLINDED TOO ───────────────────────────────────────────────────────────────
// ★ `(k·t)⁻¹·t == k⁻¹`. `modPow` walks the bits of its BASE, so handing it the secret nonce leaks in the
//   same way an unblinded ladder would.
{
  let same = 0
  for (let i = 0; i < 32; i++) if (invNBlinded(D) === invN(D)) same++
  ok(same === 32, `★★ a blinded inverse equals the plain one every time (${same}/32)`)
  ok(invNBlinded(1n) === 1n, '⚠ and the degenerate k = 1 still inverts to 1')

  /* ⚠⚠ AND THE OBVIOUS CHECKS ARE NOT ENOUGH, WHICH IS THE LESSON OF THIS WHOLE FILE. An `invNBlinded`
     that simply did `return invN(k)` satisfies everything above, because blinded and unblinded answers
     are equal BY CONSTRUCTION. It was written as a mutant and it survived. So did a version that drew
     its 32 random bytes and then ignored them.
     ⇒ `modPow` cannot be counted the way the ladder can - its iteration count comes from the exponent,
       `N - 2`, which is fixed. Only the BASE differs, so the blind has to be shown REACHING that. */
  const spy = n => Uint8Array.of(...Array(n).fill(9))
  const got = invNBlinded(D, spy)
  const blindedBase = lastModPowBase()
  invN(D)
  ok(got === invN(D), '★ the blinded inverse is correct with a fixed blind')
  ok(blindedBase !== lastModPowBase() && blindedBase !== D,
     '★★★ …and REACHES the exponentiation: modPow never sees the secret nonce, only k·t')
}

// ── ★★★ 5 · SIGNING STILL PRODUCES THE SAME BYTES ───────────────────────────────────────────────────
// ⚠⚠⚠ THE WHOLE PORT RESTS ON THIS. Signatures are RFC 6979 deterministic and transactions are graded
//   for byte identity against what is already on chain. A defence that changed a single signature byte
//   would be unshippable, whatever it bought.
{
  const sigs = new Set()
  for (let i = 0; i < 12; i++) sigs.add(toHex(sign(D, DIGEST, { lowS: true })))
  ok(sigs.size === 1, '★★★ 12 signatures over the same digest are BYTE IDENTICAL')
  ok(verifyDigest(fromHex([...sigs][0]), publicKey(D), DIGEST), '★ …and the signature verifies')
}

// ── ★★★ 6 · EVERY SECRET SCALAR, NOT JUST THE NONCE ─────────────────────────────────────────────────
// ⚠⚠ SIGNING WAS NEVER THE ONLY EXPOSURE. Deriving a public key from a private one, deriving a BIP-32
//   child and computing an ECIES shared secret all feed a SECRET scalar to the same code. The first
//   attempt covered the nonce and left those three alone, and nothing noticed, because all three give
//   the identical answer either way.
// ★ The seam settles it without the test needing to know the secret: if a site still called the plain
//   multiply, the recorded scalar would never be written and would sit unchanged across calls.
const distinctScalars = async (f, n = 12) => {
  const seen = new Set()
  for (let i = 0; i < n; i++) { await f(); seen.add(lastLadderScalar()) }
  return seen.size
}
{
  ok(await distinctScalars(() => publicKey(D)) > 8, '★★★ publicKey() goes through the blinded ladder')
  ok(await distinctScalars(() => sign(D, DIGEST, { lowS: true })) > 8, '★★★ so does sign()')

  // ⚠ AND ITS INVERSE, SEPARATELY. `sign` can blind the multiply and still hand the raw nonce to
  //   `invN`; that mutant survived until this line existed. `modPow` is the last thing sign touches, so
  //   the base it was left holding says which inverse ran.
  const bases = new Set()
  for (let i = 0; i < 12; i++) { sign(D, DIGEST, { lowS: true }); bases.add(lastModPowBase()) }
  ok(bases.size > 8,
     `★★★ …and sign()'s INVERSE is blinded too — modPow saw ${bases.size} different bases for one nonce`)

  const parent = fromSeed(new Uint8Array(64).fill(7))
  ok(await distinctScalars(() => parent.derive("m/0'")) > 8, '★★ so does BIP-32 child derivation')
  ok(toHex(parent.derive("m/0'").K) === toHex(parent.derive("m/0'").K),
     '★ …and it still derives the same child key, which is what these defences must not disturb')

  const theirPub = publicKey(D)
  ok(await distinctScalars(() => encrypt(new Uint8Array(8), theirPub, 12345n)) > 8,
     '★★ and so does the ECIES shared secret — a message key is a secret scalar like any other')
}

// ── ⚠ 7 · WHAT IS NOT CLAIMED ───────────────────────────────────────────────────────────────────────
// ⛔ The ladder's PATTERN is fixed and its WIDTH is fixed. The cost of each individual BigInt operation
//   is not: a multiply still costs what its operands cost, and JIT and garbage collection are beyond
//   reach in a scripting language. Blinding is what covers that residue, because the operands then
//   belong to `k + b·n` rather than to the key. Stated here so nobody reads a green suite as "solved".
// ⛔ AND ONE BRANCH IS NOT COVERED AT ALL: the degenerate case in Jacobian addition, where the two
//   points are equal or cancel. The ladder's registers always differ by exactly P, so it cannot be
//   reached from the only caller, and a mutation that broke it SURVIVED this suite. It is labelled as
//   such in the source. Nothing here should be read as evidence about those two lines.
{
  ok(adds(() => mul(1n, G)) < adds(() => mul(N - 1n, G)),
     '⛔ the PUBLIC multiply is still variable-time, deliberately — it is given nothing secret')
}

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [signing defences · counted and read back, not reviewed]`)
process.exit(fail === 0 ? 0 : 1)
