// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP — lightweight raw-key PushDrop script template.
 *
 * A PushDrop output is a *spendable* P2PK output that also carries arbitrary data
 * fields, which are pushed and then dropped:
 *
 *     <pubkey> OP_CHECKSIG <field0> <field1> ... <fieldN-1> [OP_2DROP ...] [OP_DROP]
 *
 * Because the data lives in the locking script of a spendable output, it stays in
 * the UTXO set and is NOT prunable (unlike OP_RETURN). This is the core reason
 * PHAR LAP moves token metadata here. See PLAN.md / BRC-48.
 *
 * This is a *raw-key* implementation of the PushDrop pattern, which is
 * built around the BRC-100 `WalletInterface` (protocolID/keyID/counterparty). PHAR LAP
 * signs with a raw private scalar, matching the rest of the wallet.
 *
 * Layout note: we use the SDK's "lock-before" ordering (pubkey + OP_CHECKSIG first,
 * then the dropped fields). This matches the layout already on chain, so the
 * encoding semantics are battle-tested. The minimal-push encoding and OP_DROP/OP_2DROP
 * bundling below are ported from that template.
 *
 * The fields themselves are opaque here — the token field layout (prefix, version,
 * name, rules, ...) is defined in `tokenCodec.ts` (Phase 2).
 */
import { OP, LockingScript, UnlockingScript } from '../impl/js/script.mjs'
import { SIGHASH, preimage, dsha256 } from '../impl/js/transaction.mjs'
import { sign as ecdsaSign, encodeDer, decodePoint } from '../impl/js/ecdsa.mjs'
import { serP } from '../impl/js/secp256k1.mjs'
import { fromHex, toHex, concat } from '../impl/js/bytes.mjs'
import type { Tx } from '../impl/js/transaction.mjs'

/**
 * ⚠⚠ THE `number[]` SEAM LIVES HERE AND ONLY HERE. This module speaks `number[]`, as the application
 *   does; the script and transaction modules speak `Uint8Array`, as a browser does. Converting at this
 *   one boundary keeps 794 lines of `tokenCodec.ts` untouched, and leaves exactly one place to change
 *   the day the application moves over.
 */
const u8 = (d: number[]): Uint8Array => Uint8Array.from(d)
const arr = (b: Uint8Array): number[] => Array.from(b)

interface ScriptChunk {
  op: number
  data?: number[]
}

/**
 * Minimally-encoded push for a data field — required because BSV consensus (and the
 * SDK `Spend` interpreter) enforce MINIMALPUSH: a 1-byte value 1..16 must use OP_1..OP_16,
 * an empty push must use OP_0, etc.
 *
 * ⚠⚠⚠ THIS ENCODING IS FIXED BY WHAT IS ON CHAIN, and it is NOT the same rule as the wallet core's
 *   `minimalPush`. Here a single ZERO byte encodes to OP_0; there it encodes to a one-byte push. Both
 *   are defensible; only one matches the tokens that already exist. ⇒ Do not "unify" these. Substituting
 *   the other rule changes the script, therefore the txid, therefore the identity of every token.
 *
 * Caveat (round-trip): an empty field `[]` and a single zero byte `[0]` both encode to
 * OP_0 and both decode back to `[0]`. The token codec (Phase 2) must account for this
 * rather than relying on truly-empty fields.
 */
export function minimalPushChunk(data: number[]): ScriptChunk {
  // ⚪ Belt and braces: falling through would give `{ op: 0, data: [] }`, which serialises to the same
  //   0x00, so no test can tell this line from its absence. It stays because it says WHY the byte is
  //   0x00 - an empty field is OP_0, not a zero-length push. (Confirmed equivalent by mutation testing.)
  if (data.length === 0) return { op: OP.OP_0 }
  if (data.length === 1 && data[0] === 0) return { op: OP.OP_0 }
  if (data.length === 1 && data[0] >= 1 && data[0] <= 16) return { op: 0x50 + data[0] } // OP_1..OP_16
  if (data.length === 1 && data[0] === 0x81) return { op: OP.OP_1NEGATE }
  if (data.length <= 75) return { op: data.length, data }
  if (data.length <= 255) return { op: OP.OP_PUSHDATA1, data }
  if (data.length <= 65535) return { op: OP.OP_PUSHDATA2, data }
  return { op: OP.OP_PUSHDATA4, data }
}

/** Append the correct run of OP_2DROP / OP_DROP to drop exactly `count` stack items. */
function appendDrops(chunks: ScriptChunk[], count: number): void {
  let notYetDropped = count
  while (notYetDropped > 1) {
    chunks.push({ op: OP.OP_2DROP })
    notYetDropped -= 2
  }
  if (notYetDropped === 1) chunks.push({ op: OP.OP_DROP })
}

/**
 * Build a PushDrop locking script: `<pubkey> OP_CHECKSIG <fields...> [drops]`.
 *
 * @param pubKeyHex Compressed (33-byte) or uncompressed (65-byte) public key, hex.
 * @param fields    The data fields to embed (opaque bytes; token layout lives in tokenCodec).
 */
export function lock(pubKeyHex: string, fields: number[][]): LockingScript {
  const pub = arr(fromHex(pubKeyHex))
  if (pub.length !== 33 && pub.length !== 65) {
    throw new Error(`pushDrop.lock: public key must be 33 or 65 bytes, got ${pub.length}`)
  }
  const chunks: ScriptChunk[] = [
    { op: pub.length, data: pub },
    { op: OP.OP_CHECKSIG },
    ...fields.map(minimalPushChunk),
  ]
  appendDrops(chunks, fields.length)
  // ⚠ the seam: our chunks carry Uint8Array, this module carries number[]
  return new LockingScript(chunks.map(c => ({ op: c.op, data: c.data === undefined ? undefined : u8(c.data) })))
}

export interface PushDropUnlockOptions {
  /** Output-signing scope. Default 'all'. */
  signOutputs?: 'all' | 'none' | 'single'
  /** Set the ANYONECANPAY flag so other inputs may be added after signing. Default false. */
  anyoneCanPay?: boolean
  // ⚠ `sourceSatoshis` and `lockingScript` USED TO LIVE HERE, as optional overrides that fell back to
  //   reading the parent transaction. They are now required ARGUMENTS, because a BIP-143 signature
  //   commits to both and there is nothing sensible to fall back to. ⇒ Left as optional fields nothing
  //   reads, they would be silently ignored by any caller that still passed them.
}

/**
 * ⚠⚠⚠ THIS REPLACES A TEMPLATE WITH A CALL, AND THAT IS THE SHAPE CHANGE.
 *   The version this adapts returned a signing callback and a size estimate, for the transaction to invoke
 *   during its own `sign()` pass, reading the script and amount back out of a parent transaction it
 *   had been handed. ⇒ Here nothing signs itself: the caller states what is being spent, because a
 *   BIP-143 signature commits to a script and an amount that the spending transaction does not contain.
 *   ★ The gain is that a wrong script or a wrong amount is a visible argument rather than a silent
 *     lookup, and the caller no longer has to carry whole parent transactions around to sign one input.
 *
 * ⚠ SYNCHRONOUS. Signing needs no I/O; it was only ever async because a template had to be awaited.
 *
 * @param privKey        the owner's scalar
 * @param lockingScript  the script of the output being SPENT, raw
 * @param sourceSatoshis that output's value
 */
export function unlockScript(
  privKey: bigint,
  tx: Tx,
  inputIndex: number,
  lockingScript: Uint8Array,
  sourceSatoshis: number,
  options: PushDropUnlockOptions = {},
): UnlockingScript {
  const { signOutputs = 'all', anyoneCanPay = false } = options
  // ⚠ FORKID is REQUIRED on this chain, never optional - it is what separates this signature scheme
  //   from the pre-fork one, and omitting it produces a signature no node will accept.
  let scope = SIGHASH.FORKID
  if (signOutputs === 'all') scope |= SIGHASH.ALL
  else if (signOutputs === 'none') scope |= SIGHASH.NONE
  else if (signOutputs === 'single') scope |= SIGHASH.SINGLE
  if (anyoneCanPay) scope |= SIGHASH.ANYONECANPAY

  if (tx.inputs[inputIndex] === undefined) throw new Error(`pushDrop.unlockScript: no input at ${inputIndex}`)
  if (!Number.isInteger(sourceSatoshis) || sourceSatoshis < 0) {
    throw new Error('pushDrop.unlockScript: sourceSatoshis must be a whole number of satoshis')
  }

  // ★ The digest is the DOUBLE sha256 of the preimage. The version this adapts reached it by hashing
  //   once here and relying on the signing call to hash again; stating it once is the same bytes and
  //   one fewer thing to get wrong.
  const digest = dsha256(preimage(tx, inputIndex, lockingScript, sourceSatoshis, scope))
  // ⚠ lowS: a KEY signature, so normalising is free and a broadcaster may refuse a high-s one.
  //   ⛔ A covenant-derived signature is the opposite case and must not borrow this.
  const der = ecdsaSign(privKey, digest, { lowS: true })
  const sig = concat(der, Uint8Array.of(scope))
  // ★ P2PK-style: the unlocking script is just the signature; the public key is already in the lock.
  return new UnlockingScript([{ op: sig.length, data: sig }])
}

/** ★ For fee estimation before a signature exists: ~72-byte DER + sighash byte + the push opcode. */
export const UNLOCK_SIZE = 73

export interface DecodedPushDrop {
  /** The data fields, in order. */
  fields: number[][]
  /** The locking public key, hex (compressed or uncompressed). */
  pubKeyHex: string
}

/**
 * Decode a PushDrop locking script back into `{ fields, pubKeyHex }`, or `null` if the
 * script is not a well-formed PushDrop output. The field normalization (OP_0 → [0], OP_1..16 → [n],
 * OP_1NEGATE → [0x81]) is what the chain already holds, and it is robust to malformed input.
 *
 * Expected layout: `<pubkey> OP_CHECKSIG <field...> [OP_2DROP ...] [OP_DROP]`.
 */
export function decode(script: LockingScript): DecodedPushDrop | null {
  const chunks = script.chunks
  if (chunks == null || chunks.length < 2) return null

  // chunks[0] = pubkey push, chunks[1] = OP_CHECKSIG
  const pubData = chunks[0].data
  if (pubData == null || (pubData.length !== 33 && pubData.length !== 65)) return null
  if (chunks[1].op !== OP.OP_CHECKSIG) return null
  let pubKeyHex: string
  try {
    // ⚠⚠ NORMALISED TO COMPRESSED, DELIBERATELY. Measured against the deployed behaviour: a script
    //   locked with an UNCOMPRESSED 65-byte key decodes to the 33-byte compressed form, so
    //   `decode(lock(uncompressedHex, …)).pubKeyHex` does not return what was passed in. Downstream
    //   matching relies on that. ⇒ Returning the key verbatim would look like a fix and would change
    //   which outputs the application believes are its own.
    pubKeyHex = toHex(serP(decodePoint(pubData as unknown as Uint8Array)))
  } catch {
    return null
  }

  const fields: number[][] = []
  for (let i = 2; i < chunks.length; i++) {
    const op = chunks[i].op
    // A drop opcode marks the end of the fields section.
    if (op === OP.OP_DROP || op === OP.OP_2DROP) break
    let data: number[] = chunks[i].data === undefined ? [] : arr(chunks[i].data as unknown as Uint8Array)
    if (data.length === 0) {
      if (op >= 0x51 && op <= 0x60) data = [op - 0x50] // OP_1..OP_16
      else if (op === OP.OP_0) data = [0]
      else if (op === OP.OP_1NEGATE) data = [0x81]
      else return null // unexpected non-data opcode inside the fields section
    }
    fields.push(data)
  }
  return { fields, pubKeyHex }
}
