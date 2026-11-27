# src/pushtx.js

PHAR LAP — optimal OP_PUSH_TX primitive (transaction introspection in Bitcoin Script).

BSV has no OP_CHECKDATASIG and no native "push the sighash" opcode, so to let a locking script
inspect the transaction that spends it we use the classic "optimal OP_PUSH_TX" trick:

  1. The UNLOCK pushes the BIP143/FORKID sighash *preimage* of the spending input.
  2. The LOCK computes  e = HASH256(preimage)  and, using a fixed PUBLIC keypair (a, k),
     derives a valid ECDSA signature  s = k⁻¹·(e + r·a) mod n  (with r = (k·G).x mod n),
     assembles it as minimal DER, and verifies it with OP_CHECKSIG against Q = a·G.

OP_CHECKSIG independently recomputes the sighash from the *actual* transaction, so the spend
only validates when HASH256(pushed preimage) == actual sighash — i.e. the spender is FORCED to
push the genuine preimage. Having proven it genuine, the covenant can OP_SPLIT the preimage to
read hashOutputs / value / nLocktime etc. and enforce arbitrary rules on the spending tx.

Security note: (a, k) are PUBLIC, fixed constants — they protect nothing. Reusing k across spends
(which would be catastrophic for a secret key) is harmless here because there is no secret: the
covenant's security rests entirely on the preimage binding above, not on key secrecy.

Chronicle (tx version > 1) makes this tractable: low-S is no longer enforced (so we never need to
normalise s) and big-integer arithmetic is available. Signature DER encoding, however, is STILL
enforced, so s must be MINIMAL DER. We get that for free: a positive script-number's minimal
little-endian form, byte-reversed, IS minimal big-endian DER content — so we OP_NUM2BIN s to a
fixed 33 bytes, reverse (fixed-length), then OP_SPLIT off the leading zero bytes at the runtime
index (33 − OP_SIZE(s)). No variable-length reversal required.

Validated against a script interpreter with transactionVersion = 2.

## ScriptChunk

```ts
interface ScriptChunk {
  op: number
  data?: number[]
}
```

⚠ The same `number[]` seam as `covenant.ts` and `pushDrop.ts`: script chunks are assembled by hand
  here, opcode by opcode, and every one of them ends up in a script whose bytes are on chain.

## bytesBE

```ts
const bytesBE = (v: bigint): number[] =>
```

★ The big-number work is now native `BigInt`. What was a library type is a language feature, and the
  two helpers below are the only shapes that were actually used: a script number, little-endian and
  sign-extended, and a minimal big-endian integer for DER.
⚠⚠ BOTH APPEND A ZERO BYTE WHEN THE TOP BIT IS SET, and for the same reason in opposite directions:
  Bitcoin's script numbers and DER integers are SIGNED, so a leading 1 bit would read as negative.

## A_HEX

```ts
const A_HEX = '11'.repeat(32)
```

SIGHASH_ALL | SIGHASH_FORKID

Fixed, PUBLIC constants for the introspection key. Arbitrary valid scalars (see security note).

## PushTxConstants

```ts
export interface PushTxConstants {
  /** Compressed pubkey Q = a·G (33 bytes). */
  Qbytes: number[]
  /** Precomputed DER integer for the constant r: `0x02 <len> <rBE>`. */
  rDerInt: number[]
  /** Script-number (LE) encodings of the modular constants. */
  raLE: number[]
  nLE: number[]
  kInvLE: number[]
  /** Sighash type byte appended to the derived signature. */
  scope: number
}
```

## toScriptNumLE

```ts
function toScriptNumLE(bn: bigint): number[]
```

At `if ((le[le.length - 1] & 0x80) !== 0) le.push(0x00)`:

sign byte keeps it positive

## minimalBE

```ts
function minimalBE(bn: bigint): number[]
```

## pushTxConstants

```ts
export function pushTxConstants(scope: number = SIGHASH_ALL_FORKID): PushTxConstants
```

Compute the fixed introspection constants for a given sighash scope. Deterministic.

At `const r = mod(mul(k).x, n)`:

★ r is the x coordinate of k·G, reduced modulo the ORDER - not the field. Using the wrong modulus
  yields a number that looks right and satisfies nothing.

## op

```ts
const op = (code: number): ScriptChunk =>
```

## push

```ts
function push(data: number[]): ScriptChunk
```

## reverseBytesOps

```ts
export function reverseBytesOps(len: number): ScriptChunk[]
```

Op fragment that reverses the top stack item, assuming it is exactly `len` bytes.

## deriveSigOps

```ts
export function deriveSigOps(c: PushTxConstants): ScriptChunk[]
```

Op fragment: consumes a preimage on top of the stack and leaves the derived ECDSA signature
(DER + sighash byte) on top. Does NOT run OP_CHECKSIG.

At `op(OPCODES.OP_HASH256), ...reverseBytesOps(32), push([0x00]), op(OPCODES.OP_CAT), op(OPCODES.OP_B...`:

e = HASH256(preimage) as a positive script number (reverse BE→LE, append sign byte, minimise)

At `push(c.raLE), op(OPCODES.OP_ADD), push(c.nLE), op(OPCODES.OP_MOD),`:

s = k⁻¹·((e + r·a) mod n) mod n

At `op(OPCODES.OP_SIZE), push([33]), op(OPCODES.OP_SWAP), op(OPCODES.OP_SUB), op(OPCODES.OP_TOALTSTACK),`:

s (LE number) → minimal-DER integer: NUM2BIN(33) → reverse → strip leading zeros at 33−size

At `op(OPCODES.OP_SIZE), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),`:

<len> ++ sBE

At `push([0x02]), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),`:

0x02 ++ <len> ++ sBE

At `push(c.rDerInt), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),`:

assemble full sig: 0x30 <bodylen> rDerInt sDerInt <scope>

## pushTxCheckOps

```ts
export function pushTxCheckOps(c: PushTxConstants = pushTxConstants()): ScriptChunk[]
```

Standalone primitive: consumes a preimage and leaves a boolean (OP_CHECKSIG result).
Useful for tests; covenants normally use `pushTxVerifyOps` to keep the preimage for inspection.

## pushTxVerifyOps

```ts
export function pushTxVerifyOps(c: PushTxConstants = pushTxConstants()): ScriptChunk[]
```

Covenant primitive: asserts the preimage is genuine and LEAVES IT on the stack for further
inspection. Expects the preimage on top; on success the stack top is the (verified) preimage.

## PreimageParams

```ts
export interface PreimageParams {
  sourceTXID: string
  sourceOutputIndex: number
  sourceSatoshis: number
  transactionVersion: number
  inputIndex: number
  /** The locking script being spent (the covenant script). */
  subscript: { toBinary: () => number[] } | unknown
  outputs: unknown[]
  inputSequence: number
  lockTime: number
  otherInputs?: unknown[]
  scope?: number
}
```

## pushTxPreimage

```ts
export function pushTxPreimage(p: PreimageParams): number[]
```

Build the sighash preimage the unlocking script must push.

⚠⚠⚠ THE INPUT ORDER IS RECONSTRUCTED, AND THAT IS THE DELICATE PART. This takes the signed input's
  details FLAT, plus `otherInputs` - the rest, in their original relative order. A BIP-143 preimage
  commits to every input through `hashPrevouts` and `hashSequence`, so the full list has to be put
  back exactly as it was: the others in order, with the signed one INSERTED at `inputIndex`.
  ⛔ Appending it instead, or sorting, gives a preimage that is well formed and wrong, and the only
    symptom is a covenant that refuses to unlock.

⚠ `otherInputs` entries need only their outpoint and sequence, which is all the preimage reads from
  them - their scripts are not part of a BIP-143 digest.

At `txid: reversed(fromHex(p.sourceTXID)),`:

⚠ the txid arrives in DISPLAY order and the preimage needs WIRE order

## pushData

```ts
export const pushData = push
```

Helper to push arbitrary data with the correct (minimal) push opcode.
