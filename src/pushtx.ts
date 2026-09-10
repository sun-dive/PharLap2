// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP — optimal OP_PUSH_TX primitive (transaction introspection in Bitcoin Script).
 *
 * BSV has no OP_CHECKDATASIG and no native "push the sighash" opcode, so to let a locking script
 * inspect the transaction that spends it we use the classic "optimal OP_PUSH_TX" trick:
 *
 *   1. The UNLOCK pushes the BIP143/FORKID sighash *preimage* of the spending input.
 *   2. The LOCK computes  e = HASH256(preimage)  and, using a fixed PUBLIC keypair (a, k),
 *      derives a valid ECDSA signature  s = k⁻¹·(e + r·a) mod n  (with r = (k·G).x mod n),
 *      assembles it as minimal DER, and verifies it with OP_CHECKSIG against Q = a·G.
 *
 * OP_CHECKSIG independently recomputes the sighash from the *actual* transaction, so the spend
 * only validates when HASH256(pushed preimage) == actual sighash — i.e. the spender is FORCED to
 * push the genuine preimage. Having proven it genuine, the covenant can OP_SPLIT the preimage to
 * read hashOutputs / value / nLocktime etc. and enforce arbitrary rules on the spending tx.
 *
 * Security note: (a, k) are PUBLIC, fixed constants — they protect nothing. Reusing k across spends
 * (which would be catastrophic for a secret key) is harmless here because there is no secret: the
 * covenant's security rests entirely on the preimage binding above, not on key secrecy.
 *
 * Chronicle (tx version > 1) makes this tractable: low-S is no longer enforced (so we never need to
 * normalise s) and big-integer arithmetic is available. Signature DER encoding, however, is STILL
 * enforced, so s must be MINIMAL DER. We get that for free: a positive script-number's minimal
 * little-endian form, byte-reversed, IS minimal big-endian DER content — so we OP_NUM2BIN s to a
 * fixed 33 bytes, reverse (fixed-length), then OP_SPLIT off the leading zero bytes at the runtime
 * index (33 − OP_SIZE(s)). No variable-length reversal required.
 *
 * Validated against a script interpreter with transactionVersion = 2.
 */
import { OP as OPCODES } from '../impl/js/script.mjs'
import { N, mul, serP, invN, mod } from '../impl/js/secp256k1.mjs'
import { SIGHASH, preimage as corePreimage } from '../impl/js/transaction.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { fromHex, toHex, reversed } from '../impl/js/bytes.mjs'

/**
 * ⚠ The same `number[]` seam as `covenant.ts` and `pushDrop.ts`: script chunks are assembled by hand
 *   here, opcode by opcode, and every one of them ends up in a script whose bytes are on chain.
 */
interface ScriptChunk {
  op: number
  data?: number[]
}

/**
 * ★ The big-number work is now native `BigInt`. What was a library type is a language feature, and the
 *   two helpers below are the only shapes that were actually used: a script number, little-endian and
 *   sign-extended, and a minimal big-endian integer for DER.
 * ⚠⚠ BOTH APPEND A ZERO BYTE WHEN THE TOP BIT IS SET, and for the same reason in opposite directions:
 *   Bitcoin's script numbers and DER integers are SIGNED, so a leading 1 bit would read as negative.
 */
const bytesBE = (v: bigint): number[] => {
  if (v === 0n) return []
  let h = v.toString(16)
  if (h.length & 1) h = '0' + h
  return Array.from(fromHex(h))
}

const SIGHASH_ALL_FORKID = 0x41 // SIGHASH_ALL | SIGHASH_FORKID

/** Fixed, PUBLIC constants for the introspection key. Arbitrary valid scalars (see security note). */
const A_HEX = '11'.repeat(32)
const K_HEX = '22'.repeat(32)

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

function toScriptNumLE(bn: bigint): number[] {
  if (bn === 0n) return []
  const le = bytesBE(bn).reverse()
  if ((le[le.length - 1] & 0x80) !== 0) le.push(0x00) // sign byte keeps it positive
  return le
}

function minimalBE(bn: bigint): number[] {
  const be = bytesBE(bn)
  if ((be[0] & 0x80) !== 0) be.unshift(0x00)
  return be
}

/** Compute the fixed introspection constants for a given sighash scope. Deterministic. */
export function pushTxConstants(scope: number = SIGHASH_ALL_FORKID): PushTxConstants {
  const n = N
  const a = BigInt('0x' + A_HEX)
  const k = BigInt('0x' + K_HEX)
  // ★ r is the x coordinate of k·G, reduced modulo the ORDER - not the field. Using the wrong modulus
  //   yields a number that looks right and satisfies nothing.
  const r = mod(mul(k).x, n)
  const rBE = minimalBE(r)
  return {
    Qbytes: Array.from(serP(mul(a))),
    rDerInt: [0x02, rBE.length, ...rBE],
    raLE: toScriptNumLE(mod(r * a, n)),
    nLE: toScriptNumLE(n),
    kInvLE: toScriptNumLE(invN(k)),
    scope,
  }
}

const op = (code: number): ScriptChunk => ({ op: code })
function push(data: number[]): ScriptChunk {
  if (data.length < 76) return { op: data.length, data }
  if (data.length < 256) return { op: OPCODES.OP_PUSHDATA1, data }
  if (data.length < 65536) return { op: OPCODES.OP_PUSHDATA2, data }
  return { op: OPCODES.OP_PUSHDATA4, data }
}

/** Op fragment that reverses the top stack item, assuming it is exactly `len` bytes. */
export function reverseBytesOps(len: number): ScriptChunk[] {
  const ops: ScriptChunk[] = []
  for (let i = 0; i < len - 1; i++) ops.push(op(OPCODES.OP_1), op(OPCODES.OP_SPLIT))
  for (let i = 0; i < len - 1; i++) ops.push(op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT))
  return ops
}

/**
 * Op fragment: consumes a preimage on top of the stack and leaves the derived ECDSA signature
 * (DER + sighash byte) on top. Does NOT run OP_CHECKSIG.
 */
export function deriveSigOps(c: PushTxConstants): ScriptChunk[] {
  return [
    // e = HASH256(preimage) as a positive script number (reverse BE→LE, append sign byte, minimise)
    op(OPCODES.OP_HASH256), ...reverseBytesOps(32), push([0x00]), op(OPCODES.OP_CAT), op(OPCODES.OP_BIN2NUM),
    // s = k⁻¹·((e + r·a) mod n) mod n
    push(c.raLE), op(OPCODES.OP_ADD), push(c.nLE), op(OPCODES.OP_MOD),
    push(c.kInvLE), op(OPCODES.OP_MUL), push(c.nLE), op(OPCODES.OP_MOD),
    // s (LE number) → minimal-DER integer: NUM2BIN(33) → reverse → strip leading zeros at 33−size
    op(OPCODES.OP_SIZE), push([33]), op(OPCODES.OP_SWAP), op(OPCODES.OP_SUB), op(OPCODES.OP_TOALTSTACK),
    push([33]), op(OPCODES.OP_NUM2BIN), ...reverseBytesOps(33),
    op(OPCODES.OP_FROMALTSTACK), op(OPCODES.OP_SPLIT), op(OPCODES.OP_NIP),
    op(OPCODES.OP_SIZE), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT), // <len> ++ sBE
    push([0x02]), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),        // 0x02 ++ <len> ++ sBE
    // assemble full sig: 0x30 <bodylen> rDerInt sDerInt <scope>
    push(c.rDerInt), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),
    op(OPCODES.OP_SIZE), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),
    push([0x30]), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),
    push([c.scope]), op(OPCODES.OP_CAT),
  ]
}

/**
 * Standalone primitive: consumes a preimage and leaves a boolean (OP_CHECKSIG result).
 * Useful for tests; covenants normally use `pushTxVerifyOps` to keep the preimage for inspection.
 */
export function pushTxCheckOps(c: PushTxConstants = pushTxConstants()): ScriptChunk[] {
  return [...deriveSigOps(c), push(c.Qbytes), op(OPCODES.OP_CHECKSIG)]
}

/**
 * Covenant primitive: asserts the preimage is genuine and LEAVES IT on the stack for further
 * inspection. Expects the preimage on top; on success the stack top is the (verified) preimage.
 */
export function pushTxVerifyOps(c: PushTxConstants = pushTxConstants()): ScriptChunk[] {
  return [
    op(OPCODES.OP_DUP),
    ...deriveSigOps(c),
    push(c.Qbytes), op(OPCODES.OP_CHECKSIG), op(OPCODES.OP_VERIFY),
  ]
}

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

/**
 * Build the sighash preimage the unlocking script must push.
 *
 * ⚠⚠⚠ THE INPUT ORDER IS RECONSTRUCTED, AND THAT IS THE DELICATE PART. This takes the signed input's
 *   details FLAT, plus `otherInputs` - the rest, in their original relative order. A BIP-143 preimage
 *   commits to every input through `hashPrevouts` and `hashSequence`, so the full list has to be put
 *   back exactly as it was: the others in order, with the signed one INSERTED at `inputIndex`.
 *   ⛔ Appending it instead, or sorting, gives a preimage that is well formed and wrong, and the only
 *     symptom is a covenant that refuses to unlock.
 *
 * ⚠ `otherInputs` entries need only their outpoint and sequence, which is all the preimage reads from
 *   them - their scripts are not part of a BIP-143 digest.
 */
export function pushTxPreimage(p: PreimageParams): number[] {
  const others = (p.otherInputs ?? []) as Array<{
    sourceTXID?: string; sourceTxid?: string; sourceOutputIndex?: number; sequence?: number
  }>
  const asInput = (o: typeof others[number]) => ({
    txid: reversed(fromHex(String(o.sourceTXID ?? o.sourceTxid ?? '00'.repeat(32)))),
    vout: o.sourceOutputIndex ?? 0,
    script: new Uint8Array(0),
    sequence: o.sequence ?? 0xffffffff,
  })
  const signed = {
    // ⚠ the txid arrives in DISPLAY order and the preimage needs WIRE order
    txid: reversed(fromHex(p.sourceTXID)),
    vout: p.sourceOutputIndex,
    script: new Uint8Array(0),
    sequence: p.inputSequence,
  }
  const inputs = others.map(asInput)
  inputs.splice(p.inputIndex, 0, signed)

  const outs = (p.outputs as Array<{ satoshis?: number; value?: number; lockingScript?: { toBinary: () => number[] }; script?: Uint8Array }>)
    .map(o => ({
      value: o.satoshis ?? o.value ?? 0,
      script: o.script instanceof Uint8Array
        ? o.script
        : Uint8Array.from((o.lockingScript as { toBinary: () => number[] }).toBinary()),
    }))

  const sub = p.subscript as { toBinary: () => number[] | Uint8Array }
  const subBytes = sub.toBinary()
  const scriptCode = subBytes instanceof Uint8Array ? subBytes : Uint8Array.from(subBytes)

  const tx = new Tx(p.transactionVersion, inputs, outs, p.lockTime)
  return Array.from(corePreimage(tx, p.inputIndex, scriptCode, p.sourceSatoshis, p.scope ?? SIGHASH_ALL_FORKID))
}

/** Helper to push arbitrary data with the correct (minimal) push opcode. */
export const pushData = push
export { SIGHASH_ALL_FORKID }
