# impl/js/ecdsa.mjs

ECDSA over secp256k1 — signing, verification, and STRICT DER.

★ THIS FILE OWNS THE SIGNING PATH. `secp256k1.mjs` was written for BIP-32 derivation and did not sign
  at all; signing happens here, and nowhere else.

⛔⛔ STRICT DER, AND THE RULE THAT IS EASIEST TO MISS:
  A DER INTEGER is SIGNED. One whose top bit is set REQUIRES a leading `0x00`, or the value reads as
  negative. ⇒ Omit that byte and you have **two different byte strings for one signature** — the
  classic malleability. **BIP-66 has made the unpadded form invalid on the network since 2015**, so a
  parser that accepts it is MORE PERMISSIVE THAN CONSENSUS: it can call a transaction good that no
  node would accept. `decodeDer` refuses it, along with BER long-form lengths, trailing bytes and
  non-minimal leading zeros.

⚠⚠ NOT CONSTANT TIME, and cannot be. That is a property of JavaScript rather than of any particular
  implementation: JIT compilation and garbage collection put it out of reach in a scripting language.
  ⇒ The two secrets on this path are BLINDED instead — the nonce through `mulBlinded`, its inverse
    through `invNBlinded`, both in `secp256k1.mjs` where `mulRaw` guarantees the blinding is not
    reduced away. That RAISES THE COST of a timing attack; it does not remove it.
  **For anything material, sign air-gapped.**

## toBig

⚠ mod, modPow and invN come from the curve module — they were duplicated here.

⚠ `beBytes` and `toBigBE` live in bytes.mjs — one copy of the left-padding rule, not three.

## publicKey

⚠ `mulBlinded` USED TO LIVE HERE, and it did nothing: it called `mul`, which reduces mod N and so
erased the blinding. It now lives in the curve module next to `mulRaw`, the only multiply that does
not reduce — so the two cannot drift apart again. See the note at the top of `secp256k1.mjs`.

At `const pt = mulBlinded(mod(d, N), G)`:

⚠ d is SECRET — never the plain `mul` here

## derInt

⚠ DER INTEGERs are SIGNED: a high top bit needs a `0x00` in front or the value reads negative.

At `if (b[0] & 0x80) b = concat(Uint8Array.of(0x00), b)`:

⚠ DER INTEGERs are SIGNED

## decodeDer

STRICT by default. `allowTrailing` permits ONE thing — bytes after the sequence, which is where
Bitcoin's sighash byte lives. ⚠ It does NOT relax the integer rules.
@returns {[bigint, bigint] | null}

At `if (len & 0x80) return null`:

⛔ long-form length is BER, not DER

At `if (!allowTrailing && 2 + len !== b.length) return null`:

⛔ trailing bytes

### decodeDer › readInt

At `if (v[0] & 0x80) return null`:

⛔ NEGATIVE — see the module note

At `if (v[0] === 0x00 && !(v[1] & 0x80)) return null`:

⛔ non-minimal leading zero

## sign

Sign a 32-byte DIGEST. ⚠ Not a message — ECDSA cannot consume bytes, only a digest, so the hash is
the caller's explicit responsibility.
@param {bigint} d
@param {Uint8Array} digest32
@param {{lowS?: boolean, rand?: Function}} opts
⚠ The HMAC used to be injected. `@noble/hashes` is synchronous and bundles for a browser, so the
  hook had no remaining purpose and is gone rather than left unused.

At `if (r === 0n) continue`:

★ retry steps the generator forward, never randomly

At `let s = mod(invNBlinded(k, rand) * (z + r * mod(d, N)), N)`:

⚠ `invNBlinded`, not `invN`: `k` is the secret nonce, and `modPow`'s work depends on its base.
Verification below uses the plain `invN` because `s` there is public.

At `if (lowS && s > N / 2n) s = N - s`:

⚠⚠ LOW-S IS NOT A PROTOCOL RULE, AND HAS NOT BEEN SINCE APRIL 2026.
It is a BIP-62 malleability rule from 2015. **Chronicle removed it** — mainnet block 943,816,
7 April 2026, opt-in via transaction version > 1 — along with the rest of that 2015 set.

⛔ ONE MAJOR PROCESSOR STILL ENFORCES IT. Measured on mainnet 2026-08-12: of 20 covenant spends,
ARC refused exactly the 7 whose signature was high-s — `error 461: Non-canonical signature: S
value is unnecessarily high` — while WhatsOnChain accepted all 20. ★ And the chain settled it:
one of the refused transactions was MINED, in block 961,975. ⇒ **ARC is the non-conformant
party, not the signature.**

⇒ SO WHY NORMALISE HERE? Because for KEY-BASED signing it is free: the signer holds the key and
simply negates s, which is deterministic, so reproducibility survives and no fee is paid.
⇒ ⚠ THE COVENANT CASE IS DIFFERENT AND THE ANSWER THERE IS THE OPPOSITE. In an OP_PUSH_TX
covenant `s` is DERIVED in-script from fixed constants and cannot be conditionally negated, so
low-s costs a builder-side GRIND. That was decided against (2026-08-12): bending transactions
to satisfy a processor that has not caught up is the wrong default on a chain whose premise is
restoring the original protocol. **Do not bake low-s into a covenant.**

## verifyDigest

Verify a DER signature over a 32-byte digest.

At `const R = mulAdd(mod(z * w, N), G, mod(r * w, N), Q)`:

u1·G + u2·Q, public scalars

## decodePoint

SEC1 point decoding, compressed or uncompressed.

At `if (modPow(y, 2n, P) !== y2) return null`:

⛔ not on the curve
