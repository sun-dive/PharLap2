// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP — miner-enforced covenant scripts, built on the OP_PUSH_TX primitive (`./pushtx`).
 *
 * The covenant verifies the spending transaction's sighash preimage in-script (so it is provably
 * genuine), then reads `hashOutputs` from the preimage and forces the spending tx to contain a
 * specific set of outputs — by reconstructing those outputs and asserting
 * `HASH256(reconstructed) == hashOutputs`. The spender may append arbitrary trailing outputs
 * (their own change), which they supply in the unlocking script; they cannot alter the enforced
 * prefix.
 *
 * Layers (built incrementally, each validated against a script interpreter):
 *   L1 — enforce a fixed-bytes output prefix + spender-supplied trailing outputs.  ← this file
 *   L2 — reconstruct the "token returned to holder" output from the script's own bytes (quine).
 *   L3 — reconstruct the buyer's replica output (same covenant, buyer's pubkey substituted).
 *   L4 — publisher-fee + holder-fee P2PKH outputs (Addendum A edition-mint layout).
 *   L5 — transfer/replicate branching + wiring into tokenCodec/collectionBuilder.
 */
import { OP, LockingScript as CoreLockingScript } from '../impl/js/script.mjs'
import { hexOf } from './bytes.ts'

/**
 * ⚠⚠ THE SEAM, exactly as in `pushDrop.ts`: this module assembles script chunks in `number[]`, and the
 *   wallet core's script type carries `Uint8Array`. Declaring the chunk shape HERE keeps 737 lines of
 *   covenant assembly untouched, and the conversion happens only where a real script is produced.
 * ⛔ Do not swap this for the core's chunk type. These chunks are built by hand, opcode by opcode, and
 *   every one of them is part of a script whose bytes are already on chain.
 */
interface ScriptChunk {
  op: number
  data?: number[]
}

/** ★ Build a real locking script from hand-assembled chunks, converting at the boundary. */
const LockingScript = class {
  static from(chunks: ScriptChunk[]): CoreLockingScript {
    return new CoreLockingScript(chunks.map(c => ({ op: c.op, data: c.data === undefined ? undefined : Uint8Array.from(c.data) })))
  }
}
import { pushTxVerifyOps, pushData, type PushTxConstants, pushTxConstants } from './pushtx.ts'

const op = (code: number): ScriptChunk => ({ op: code })

/** Little-endian 8-byte satoshi amount. */
export function u64le(n: number): number[] {
  const out: number[] = []
  let v = n
  for (let i = 0; i < 8; i++) { out.push(v & 0xff); v = Math.floor(v / 256) }
  return out
}

/** Minimal little-endian script-number encoding of a non-negative integer (for OP_SPLIT indices). */
export function numLE(n: number): number[] {
  if (n === 0) return []
  const out: number[] = []
  let v = n
  while (v > 0) { out.push(v & 0xff); v = Math.floor(v / 256) }
  if ((out[out.length - 1] & 0x80) !== 0) out.push(0x00)
  return out
}

/** Bitcoin var-int (CompactSize). */
export function varInt(n: number): number[] {
  if (n < 0xfd) return [n]
  if (n <= 0xffff) return [0xfd, n & 0xff, (n >> 8) & 0xff]
  if (n <= 0xffffffff) return [0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
  throw new Error('varInt: value too large')
}

/** Serialize a tx output exactly as it appears inside hashOutputs: value(8 LE) ‖ varint(len) ‖ script. */
export function serializeOutput(satoshis: number, scriptBytes: number[]): number[] {
  return [...u64le(satoshis), ...varInt(scriptBytes.length), ...scriptBytes]
}

/** Standard 25-byte P2PKH locking script for a 20-byte pubkey hash. */
export function p2pkhScript(hash20: number[]): number[] {
  return [0x76, 0xa9, 0x14, ...hash20, 0x88, 0xac] // OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG
}

/**
 * Op fragment: consumes the verified preimage on top of the stack and leaves `hashOutputs` (32 bytes).
 * hashOutputs sits at preimage bytes [len-40, len-8): the trailing 52 bytes are
 * value(8) ‖ nSequence(4) ‖ hashOutputs(32) ‖ nLocktime(4) ‖ sighashType(4).
 */
export function extractHashOutputsOps(): ScriptChunk[] {
  return [
    op(OP.OP_SIZE), pushData([40]), op(OP.OP_SUB), op(OP.OP_SPLIT), op(OP.OP_NIP), // tail 40 bytes
    pushData([32]), op(OP.OP_SPLIT), op(OP.OP_DROP),                               // first 32 = hashOutputs
  ]
}

/**
 * Op fragment: consumes the verified preimage and leaves the `scriptCode` FIELD (varint(len) ‖ script).
 * That field is exactly the `varint(scriptLen) ‖ script` portion of an output serialization, so it can
 * be concatenated straight after an 8-byte value to rebuild "an output paying this same script".
 *
 * Preimage layout: version(4) ‖ hashPrevouts(32) ‖ hashSequence(32) ‖ outpoint(36) ‖ scriptCodeField
 * ‖ value(8) ‖ nSequence(4) ‖ hashOutputs(32) ‖ nLocktime(4) ‖ sighashType(4). So the field is bytes
 * [104, len-52) — a fixed prefix (104) and a fixed suffix (52), independent of script length and of
 * whether ANYONECANPAY zeroed the prevout/sequence hashes (still 32 bytes each).
 */
export function extractScriptCodeFieldOps(): ScriptChunk[] {
  return [
    pushData([104]), op(OP.OP_SPLIT), op(OP.OP_NIP),                                  // drop 104-byte prefix
    op(OP.OP_SIZE), pushData([52]), op(OP.OP_SUB), op(OP.OP_SPLIT), op(OP.OP_DROP),   // drop 52-byte suffix
  ]
}

/**
 * L2 self-replicating ("quine") covenant. Stack on entry: [ spenderOutputs, preimage ].
 * Forces output[0] to pay `tokenSats` to the SAME script that is currently executing (extracted from
 * the preimage's scriptCode — no second copy embedded), then `spenderOutputs` for the rest. Leaves a
 * boolean. A token under this covenant can only be spent into a copy of itself.
 */
export function selfReplicateCovenantOps(tokenSats = 1, c: PushTxConstants = pushTxConstants()): ScriptChunk[] {
  return [
    ...pushTxVerifyOps(c),            // [ spenderOutputs, preimage ]
    op(OP.OP_DUP),                    // [ spenderOutputs, preimage, preimage ]
    ...extractHashOutputsOps(),       // [ spenderOutputs, preimage, hashOutputs ]
    op(OP.OP_SWAP),                   // [ spenderOutputs, hashOutputs, preimage ]
    ...extractScriptCodeFieldOps(),   // [ spenderOutputs, hashOutputs, scriptCodeField ]
    pushData(u64le(tokenSats)), op(OP.OP_SWAP), op(OP.OP_CAT), // [ .., hashOutputs, out0 = value ‖ field ]
    op(OP.OP_ROT), op(OP.OP_CAT),     // [ hashOutputs, out0 ‖ spenderOutputs ]
    op(OP.OP_HASH256), op(OP.OP_EQUAL),
  ]
}

/**
 * L3 pubkey-substitution covenant. Re-creates the covenant in output[0] but with the 33-byte owner
 * pubkey replaced by one supplied in the unlocking script — the basis for a buyer's replica (owner =
 * buyer) and for an enforced transfer (owner = recipient).
 *
 * `fieldPubkeyOffset` is the byte offset of the owner pubkey *within the scriptCode field*
 * (= varIntSize(scriptLen) + offset-of-pubkey-within-the-script); the caller computes it from the
 * token's layout. Swapping a 33-byte key for another leaves the script length — and thus the varint —
 * unchanged, so we mutate the field in place.
 *
 * Stack on entry (top last): [ spenderOutputs, newOwnerPubKey, preimage ]. Leaves a boolean.
 */
export function swapPubkeyOut0CovenantOps(fieldPubkeyOffset: number, tokenSats = 1, c: PushTxConstants = pushTxConstants()): ScriptChunk[] {
  return [
    ...pushTxVerifyOps(c),                                  // [ rest, newPub, preimage ]
    op(OP.OP_DUP),
    ...extractHashOutputsOps(),                             // [ rest, newPub, preimage, hashOutputs ]
    op(OP.OP_SWAP),                                         // [ rest, newPub, hashOutputs, preimage ]
    ...extractScriptCodeFieldOps(),                         // [ rest, newPub, hashOutputs, scFld ]
    pushData(numLE(fieldPubkeyOffset)), op(OP.OP_SPLIT),    // [ .., pre, oldPub‖suffix ]
    pushData([33]), op(OP.OP_SPLIT), op(OP.OP_NIP),         // [ .., pre, suffix ]  (drop oldPub)
    op(OP.OP_TOALTSTACK),                                   // alt:[suffix];  [ rest, newPub, hashOutputs, pre ]
    op(OP.OP_2), op(OP.OP_ROLL),                            // [ rest, hashOutputs, pre, newPub ]
    op(OP.OP_CAT),                                          // [ rest, hashOutputs, pre‖newPub ]
    op(OP.OP_FROMALTSTACK), op(OP.OP_CAT),                  // [ rest, hashOutputs, modifiedField ]
    pushData(u64le(tokenSats)), op(OP.OP_SWAP), op(OP.OP_CAT), // [ rest, hashOutputs, out0 ]
    op(OP.OP_ROT), op(OP.OP_CAT),                           // [ hashOutputs, out0‖rest ]
    op(OP.OP_HASH256), op(OP.OP_EQUAL),
  ]
}

export interface ReplicateParams {
  /** Offset of the 33-byte owner pubkey within the scriptCode FIELD (varIntSize(scriptLen) + offset-in-script). */
  fieldPubkeyOffset: number
  /** Satoshis on the token (and replica) outputs. Default 1. */
  tokenSats?: number
  /** 20-byte hash160 of the immutable publisher address (fee recipient). */
  publisherPubKeyHash: number[]
  /** Fixed fees (sats). */
  publisherFeeSats: number
  holderFeeSats: number
  c?: PushTxConstants
}

/**
 * L4 — Addendum A "unlimited mints" replicate branch. Permissionlessly enforces (no holder signature):
 *   out[0] token returned to the holder  (covenant re-created verbatim — same owner)
 *   out[1] replica to the buyer          (covenant re-created with owner = buyer pubkey)
 *   out[2] publisher fee                   (P2PKH to the immutable publisher address, fixed sats)
 *   out[3] holder fee                    (P2PKH to the current holder, derived in-script from the owner pubkey)
 *   out[4+] buyer change                 (spender-supplied)
 *
 * Stack on entry (top last): [ buyerChange, buyerPubKey, preimage ]. Leaves a boolean.
 *
 * NOTE: pair this with a SIGHASH_ANYONECANPAY|ALL|FORKID preimage in production so any buyer can add
 * funding inputs without invalidating the holder's outpoint commitment. The output enforcement here is
 * identical regardless of ANYONECANPAY.
 */
/**
 * Shared covenant prefix (runs once, before any branch). Verifies the preimage, stashes hashOutputs
 * on the alt stack, extracts the scriptCode field, and splits it at the owner-pubkey offset into the
 * three reusable pieces. Stack on entry: [ ..., preimage ]. On exit: [ ..., pre, ownerPub, suffix ]
 * with alt = [ hashOutputs ]. `pre` = scriptCode field up to the owner pubkey; `suffix` = the rest.
 */
export function covenantPrefixOps(fieldPubkeyOffset: number, c: PushTxConstants = pushTxConstants()): ScriptChunk[] {
  return [
    ...pushTxVerifyOps(c),
    op(OP.OP_DUP),
    ...extractHashOutputsOps(), op(OP.OP_TOALTSTACK),       // alt:[hashOutputs]
    ...extractScriptCodeFieldOps(),                         // [ ..., scFld ]
    pushData(numLE(fieldPubkeyOffset)), op(OP.OP_SPLIT),    // [ ..., pre, ownerPub‖suffix ]
    pushData([33]), op(OP.OP_SPLIT),                        // [ ..., pre, ownerPub, suffix ]
  ]
}

/**
 * Replicate tail (Addendum A). Stack on entry: [ buyerChange, buyerPub, pre, ownerPub, suffix ],
 * alt = [ hashOutputs ]. Enforces out[0] token→holder (verbatim), out[1] replica→buyer (owner swapped),
 * out[2] publisher fee, out[3] holder fee, out[4+] buyerChange. Leaves a boolean.
 */
export function replicateTailOps(p: {
  tokenSats?: number; publisherPubKeyHash: number[]; publisherFeeSats: number; holderFeeSats: number
}): ScriptChunk[] {
  const VALUE1 = u64le(p.tokenSats ?? 1)
  const OUT2 = serializeOutput(p.publisherFeeSats, p2pkhScript(p.publisherPubKeyHash)) // constant
  const C3pre = [...u64le(p.holderFeeSats), 0x19, 0x76, 0xa9, 0x14] // value ‖ varint(25) ‖ OP_DUP OP_HASH160 PUSH20
  const C3suf = [0x88, 0xac]                                        // OP_EQUALVERIFY OP_CHECKSIG
  return [
    // out0 = VALUE1 ‖ pre ‖ ownerPub ‖ suffix (token back to holder, verbatim)
    pushData(VALUE1),
    pushData([3]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([2]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([1]), op(OP.OP_PICK), op(OP.OP_CAT),
    // out1 = VALUE1 ‖ pre ‖ buyerPub ‖ suffix (replica to buyer)
    pushData(VALUE1),
    pushData([4]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([5]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([2]), op(OP.OP_PICK), op(OP.OP_CAT),
    op(OP.OP_CAT),                                              // out0 ‖ out1
    pushData(OUT2), op(OP.OP_CAT),                              // ‖ out2 (publisher fee, constant)
    pushData(C3pre), op(OP.OP_CAT),
    pushData([2]), op(OP.OP_PICK), op(OP.OP_HASH160), op(OP.OP_CAT), // ‖ HASH160(ownerPub)
    pushData(C3suf), op(OP.OP_CAT),                            // → out3 (holder fee)
    pushData([5]), op(OP.OP_ROLL), op(OP.OP_CAT),             // ‖ buyerChange → expected
    op(OP.OP_TOALTSTACK), op(OP.OP_2DROP), op(OP.OP_2DROP),   // stash expected; drop 4 leftover pieces
    op(OP.OP_FROMALTSTACK), op(OP.OP_HASH256),
    op(OP.OP_FROMALTSTACK), op(OP.OP_EQUAL),
  ]
}

/**
 * Transfer tail (owner-signed, enforced). Stack on entry:
 * [ change, newOwnerPub, ownerSig, pre, ownerPub, suffix ], alt = [ hashOutputs ].
 * Verifies the current owner authorized the move (OP_CHECKSIGVERIFY against the extracted ownerPub),
 * then forces out[0] to re-create the covenant with owner = newOwnerPub (value preserved), out[1+] change.
 */
export function transferTailOps(p: { tokenSats?: number }): ScriptChunk[] {
  const VALUE1 = u64le(p.tokenSats ?? 1)
  return [
    // authenticate current owner: <ownerSig> <ownerPub> OP_CHECKSIGVERIFY
    pushData([1]), op(OP.OP_PICK),                 // copy ownerPub
    pushData([4]), op(OP.OP_PICK),                 // copy ownerSig
    op(OP.OP_SWAP), op(OP.OP_CHECKSIGVERIFY),
    // out0 = VALUE1 ‖ pre ‖ newOwnerPub ‖ suffix
    pushData(VALUE1),
    pushData([3]), op(OP.OP_PICK), op(OP.OP_CAT),  // ‖ pre
    pushData([5]), op(OP.OP_PICK), op(OP.OP_CAT),  // ‖ newOwnerPub
    pushData([1]), op(OP.OP_PICK), op(OP.OP_CAT),  // ‖ suffix → out0
    pushData([6]), op(OP.OP_ROLL), op(OP.OP_CAT),  // ‖ change → expected
    op(OP.OP_TOALTSTACK), op(OP.OP_2DROP), op(OP.OP_2DROP), op(OP.OP_DROP), // drop 5 leftover pieces
    op(OP.OP_FROMALTSTACK), op(OP.OP_HASH256),
    op(OP.OP_FROMALTSTACK), op(OP.OP_EQUAL),
  ]
}

/**
 * Burn tail (owner-signed, NO output enforcement). Stack on entry (after the dispatch drops the selector):
 * [ ownerSig, pre, ownerPub, suffix ], alt = [ hashOutputs ]. Authenticates the current owner EXACTLY like
 * transfer (the ownerPub/ownerSig stack depths are identical — newOwnerPub/change just sit below ownerSig),
 * then succeeds. The owner's SIGHASH-ALL signature already commits to their chosen outputs, so they sweep the
 * bonded sats anywhere and the token is destroyed (no covenant output is re-created). Only the current owner
 * can produce a valid ownerSig against the script-embedded ownerPub, so only they can burn.
 */
export function burnTailOps(): ScriptChunk[] {
  return [
    // authenticate current owner: <ownerSig> <ownerPub> OP_CHECKSIGVERIFY  (same auth as transferTailOps)
    pushData([1]), op(OP.OP_PICK),                 // copy ownerPub
    pushData([4]), op(OP.OP_PICK),                 // copy ownerSig
    op(OP.OP_SWAP), op(OP.OP_CHECKSIGVERIFY),
    // burn: enforce nothing — the owner authorised their outputs by signing. Clean up + succeed.
    op(OP.OP_2DROP), op(OP.OP_2DROP),              // drop suffix, ownerPub, pre, ownerSig
    op(OP.OP_FROMALTSTACK), op(OP.OP_DROP),        // discard hashOutputs (unused by burn)
    op(OP.OP_1),
  ]
}

/** Standalone replicate covenant (L4 test/reference): prefix + replicate tail. Entry [change, buyerPub, preimage]. */
export function replicateBranchOps(p: ReplicateParams): ScriptChunk[] {
  return [...covenantPrefixOps(p.fieldPubkeyOffset, p.c ?? pushTxConstants()), ...replicateTailOps(p)]
}

// --- L5: the real edition token (data fields + transfer/replicate branches) ---

/** SIGHASH used for the covenant's OP_PUSH_TX introspection: ANYONECANPAY|ALL|FORKID (0xc1). */
export const EDITION_SCOPE = 0xc1
/** Record type byte for a covenant edition token (0x01-0x04 are TEMPLATE/TOKEN/FILE/MESSAGE). */
export const RECORD_EDITION = 0x05

/** Serialized byte length of a minimal-length-prefixed data push (matches `pushData`). */
function serializedPushLen(data: number[]): number {
  if (data.length < 76) return 1 + data.length
  if (data.length < 256) return 2 + data.length
  if (data.length < 65536) return 3 + data.length
  return 5 + data.length
}

export interface EditionFields {
  /** Protocol prefix, default [0x50] ("P"). */
  prefix?: number[]
  /** Format version, default [0x03]. */
  version?: number[]
  /** Collection id = TX1 txid (32 bytes). */
  tx1Ref: number[]
  /** 33-byte compressed owner pubkey. */
  ownerPubKey: number[]
  /* ⛔ `price` and `stateData` USED TO SIT HERE and are deliberately gone. Both belonged to a second
     covenant version that was written, never exposed by the interface, and never minted. ⚠ `stateData`
     is worth a specific note: the field builder below never read it, so passing one did nothing at all —
     an argument that looks like it configures the script and does not. Removing it cannot change a byte,
     and it removes the trap. */
}


export interface EditionParams extends EditionFields {
  tokenSats?: number
  /** 20-byte hash160 of the immutable publisher fee address. */
  publisherPubKeyHash: number[]
  publisherFeeSats: number
  holderFeeSats: number
  /** Offset of the owner pubkey within the scriptCode field (use buildEditionLock to compute it). */
  fieldPubkeyOffset: number
  c?: PushTxConstants
}


/** v1 edition data-field chunks (lean): [P, version, RECORD_EDITION, tx1Ref, ownerPubKey].
 *  ⚠ FIVE FIELDS, AND THE TWO THAT ARE ABSENT WERE NEVER USEFUL. A price field was only ever read by a
 *  covenant version that was never minted. A stateData field is covenant-PINNED — reproduced verbatim in
 *  the suffix on every spend, so immutable, and always minted empty — meaning it carried no information.
 *  ★ The owner pubkey stays at offset 40 because both absent fields sat AFTER it, so every offset in this
 *  file is unchanged by their removal. */
function editionFieldChunks(f: EditionFields): ScriptChunk[] {
  return [
    pushData(f.prefix ?? [0x50]),
    pushData(f.version ?? [0x03]),
    pushData([RECORD_EDITION]),
    pushData(f.tx1Ref),
    pushData(f.ownerPubKey),
  ]
}


/**
 * Full edition-token locking script ops:
 *   <5 data fields> OP_2DROP OP_2DROP OP_DROP    (carry token metadata on-chain, then clear the stack)
 *   <shared covenant prefix>                     (verify preimage; extract hashOutputs + scriptCode pieces)
 *   <selector> 3-way dispatch: 2 → burn, 1 → transfer, 0 → replicate
 * Use `buildEditionLock` instead of calling this directly — it computes `fieldPubkeyOffset` for you.
 */
export function editionLockOps(p: EditionParams): ScriptChunk[] {
  const c = p.c ?? pushTxConstants(EDITION_SCOPE)
  return [
    ...editionFieldChunks(p),
    op(OP.OP_2DROP), op(OP.OP_2DROP), op(OP.OP_DROP), // 5 fields
    ...covenantPrefixOps(p.fieldPubkeyOffset, c),
    pushData([3]), op(OP.OP_ROLL),                          // bring the branch selector to the top
    op(OP.OP_DUP), op(OP.OP_2), op(OP.OP_NUMEQUAL), op(OP.OP_IF), // selector == 2 → burn
    op(OP.OP_DROP),                                          // drop the selector
    ...burnTailOps(),
    op(OP.OP_ELSE),                                          // selector 1 → transfer, 0 → replicate
    op(OP.OP_IF),
    ...transferTailOps({ tokenSats: p.tokenSats }),
    op(OP.OP_ELSE),
    ...replicateTailOps(p),
    op(OP.OP_ENDIF),
    op(OP.OP_ENDIF),
  ]
}

/**
 * Build the edition-token locking script, computing the owner-pubkey offset from the field layout.
 * The owner pubkey sits before the variable-length stateData, so its offset is constant for a
 * collection. (Two-pass: the offset push is the same byte-width whether the script is being probed
 * or finalised, so the length used to size the scriptCode varint is stable.)
 */
export function buildEditionLock(p: Omit<EditionParams, 'fieldPubkeyOffset'>): LockingScript {
  const before = [p.prefix ?? [0x50], p.version ?? [0x03], [RECORD_EDITION], p.tx1Ref]
  const O = before.reduce((s, f) => s + serializedPushLen(f), 0) + 1 // +1 for the ownerPubKey push opcode
  const probeLen = LockingScript.from(editionLockOps({ ...p, fieldPubkeyOffset: 1 })).toBinary().length
  const varIntSize = probeLen < 253 ? 1 : probeLen < 65536 ? 3 : 5
  return LockingScript.from(editionLockOps({ ...p, fieldPubkeyOffset: varIntSize + O }))
}

/** Whether an edition lock has the burn branch (3-way dispatch). A v1 edition's only OP_NUMEQUAL is in the
 *  burn dispatch, so its presence cleanly distinguishes burn-capable (bonded) editions from older ones. */
export function editionSupportsBurn(lockBytes: number[]): boolean {
  const chunks = CoreLockingScript.fromBinary(Uint8Array.from(lockBytes)).chunks
  return chunks != null && chunks.some((c: { op: number }) => c.op === OP.OP_NUMEQUAL)
}


/**
 * Byte offset of the 33-byte owner pubkey within the edition locking script, for the canonical field
 * layout (prefix/version/record are 1-byte: P(2)+ver(2)+record(2)+tx1Ref(33)+pushOpcode(1) = 40).
 */
export const EDITION_OWNER_SCRIPT_OFFSET = 40


/** Return a copy of an edition locking script with the owner pubkey replaced (JS mirror of the in-script swap). */
export function swapEditionOwner(lockBytes: number[], newOwnerPub: number[]): number[] {
  if (newOwnerPub.length !== 33) throw new Error('swapEditionOwner: owner pubkey must be 33 bytes')
  const out = [...lockBytes]
  for (let i = 0; i < 33; i++) out[EDITION_OWNER_SCRIPT_OFFSET + i] = newOwnerPub[i]
  return out
}

/**
 * Byte offset of the 32-byte tx1Ref (Collection ID) within the edition locking script:
 * P(2) + ver(2) + record(2) + push-opcode(1) = 7 (the 32 ref bytes sit at [7, 39)).
 */
export const EDITION_TX1REF_SCRIPT_OFFSET = 7

/**
 * Reconstruct a holder's exact edition locking script from a collection's covenant TEMPLATE.
 *
 * Every edition of a collection shares one covenant body — identical stateData (immutable storefront),
 * fees, and tokenSats — differing only in the two identity fields the covenant fills in: tx1Ref (the
 * Collection ID, at offset 7) and the owner pubkey (at offset 40). TX1 commits that template with both
 * zeroed. So splicing a real tx1Ref + owner into the template bytes yields the byte-for-byte script of
 * that holder's edition — which is exactly what genesis/replicate produce. This makes the holder's
 * edition deterministically derivable (and thus its UTXO findable by script hash) without any history walk.
 */
export function buildHolderEditionScript(templateCovenantBytes: number[], tx1Ref: number[], ownerPub: number[]): number[] {
  if (tx1Ref.length !== 32) throw new Error('buildHolderEditionScript: tx1Ref must be 32 bytes')
  if (ownerPub.length !== 33) throw new Error('buildHolderEditionScript: owner pubkey must be 33 bytes')
  const out = [...templateCovenantBytes]
  for (let i = 0; i < 32; i++) out[EDITION_TX1REF_SCRIPT_OFFSET + i] = tx1Ref[i]
  for (let i = 0; i < 33; i++) out[EDITION_OWNER_SCRIPT_OFFSET + i] = ownerPub[i]
  return out
}

/** Extract the 33-byte owner pubkey from an edition locking script. */
export function editionOwnerPubKey(lockBytes: number[]): number[] {
  return lockBytes.slice(EDITION_OWNER_SCRIPT_OFFSET, EDITION_OWNER_SCRIPT_OFFSET + 33)
}

export interface ParsedEdition {
  /** Collection id = TX1 txid (hex). */
  tx1RefHex: string
  /** 33-byte owner pubkey (hex). */
  ownerPubKeyHex: string
  stateDataHex: string
  /** Economic terms recovered from the covenant body (no out-of-band data needed). */
  terms: { publisherPubKeyHash: number[]; publisherFeeSats: number; holderFeeSats: number }
}

function chunkBytes(c: ScriptChunk): number[] | null {
  if (c.data != null && c.data.length > 0) return c.data
  if (c.op === OP.OP_0) return []
  if (c.op >= 0x51 && c.op <= 0x60) return [c.op - 0x50] // OP_1..OP_16
  if (c.op === OP.OP_1NEGATE) return [0x81]
  return null
}
function leToNum(b: number[]): number {
  let n = 0
  for (let i = b.length - 1; i >= 0; i--) n = n * 256 + b[i]
  return n
}

/**
 * Parse an edition covenant locking script into its data fields + economic terms, or null if the
 * script is not a PHAR LAP edition. The terms are recovered from the covenant body itself (the
 * publisher-fee and holder-fee output constants), so a recipient can replicate/transfer with no
 * out-of-band metadata. Structural parse only — lineage/authenticity is a separate verify step.
 */
export function parseEditionScript(script: LockingScript): ParsedEdition | null {
  const ch = script.chunks
  if (ch == null || ch.length < 8) return null
  const P = chunkBytes(ch[0]); const ver = chunkBytes(ch[1]); const rec = chunkBytes(ch[2])
  const tx1Ref = chunkBytes(ch[3]); const ownerPub = chunkBytes(ch[4])
  if (P == null || P.length !== 1 || P[0] !== 0x50) return null
  if (ver == null || ver[0] !== 0x03) return null
  if (rec == null || rec[0] !== RECORD_EDITION) return null
  if (tx1Ref == null || tx1Ref.length !== 32) return null
  if (ownerPub == null || ownerPub.length !== 33) return null
  // v1 lean layout: 5 fields, then OP_2DROP OP_2DROP OP_DROP (no price/stateData fields).
  if (ch[5].op !== OP.OP_2DROP || ch[6].op !== OP.OP_2DROP || ch[7].op !== OP.OP_DROP) return null
  // Recover fees/publisher from the OUT2 (34B) and C3pre (12B) constants — both carry the P2PKH
  // signature 0x19 0x76 0xa9 0x14 (varint(25) ‖ OP_DUP OP_HASH160 PUSH20) at offset 8.
  let publisherFeeSats = 0, holderFeeSats = 0
  let publisherPubKeyHash: number[] | null = null
  const isP2pkhValue = (d: number[]) => d[8] === 0x19 && d[9] === 0x76 && d[10] === 0xa9 && d[11] === 0x14
  for (const c of ch) {
    const d = chunkBytes(c)
    if (d == null) continue
    if (d.length === 34 && isP2pkhValue(d)) { publisherFeeSats = leToNum(d.slice(0, 8)); publisherPubKeyHash = d.slice(12, 32) }
    else if (d.length === 12 && isP2pkhValue(d)) { holderFeeSats = leToNum(d.slice(0, 8)) }
  }
  if (publisherPubKeyHash == null) return null
  return {
    tx1RefHex: hexOf(tx1Ref), ownerPubKeyHex: hexOf(ownerPub),
    stateDataHex: '', terms: { publisherPubKeyHash, publisherFeeSats, holderFeeSats },
  }
}


/* ⛔ `parseEditionAny` STOOD HERE, dispatching to a second covenant version before falling back to this
   one. There is only one version, so `parseEditionScript` is the parser and there is no "any" to choose
   between. ⚠ Kept as a note rather than silently deleted: callers imported the old name, and a reader
   who finds it in an older file should know it was removed on purpose, not lost. */

/** Unlock for a permissionless replicate (no signature): [ buyerChange, buyerPub, OP_0, preimage ]. */
export function editionReplicateUnlockChunks(p: {
  buyerPubKey: number[]; buyerChange: number[]; preimage: number[]
}): ScriptChunk[] {
  return [pushData(p.buyerChange), pushData(p.buyerPubKey), op(OP.OP_0), pushData(p.preimage)]
}

/** Unlock for an owner-signed transfer: [ change, newOwnerPub, ownerSig, OP_1, preimage ]. */
export function editionTransferUnlockChunks(p: {
  newOwnerPubKey: number[]; ownerSig: number[]; change: number[]; preimage: number[]
}): ScriptChunk[] {
  return [pushData(p.change), pushData(p.newOwnerPubKey), pushData(p.ownerSig), op(OP.OP_1), pushData(p.preimage)]
}

/** Unlock for an owner-signed burn (selector 2): [ ownerSig, OP_2, preimage ]. The owner sweeps the bonded
 *  sats via outputs of their choosing (committed by the SIGHASH-ALL ownerSig); the token is destroyed. */
export function editionBurnUnlockChunks(p: { ownerSig: number[]; preimage: number[] }): ScriptChunk[] {
  return [pushData(p.ownerSig), op(OP.OP_2), pushData(p.preimage)]
}

/**
 * L1 covenant body. Stack on entry (top last): [ spenderOutputs, preimage ].
 *   - `spenderOutputs` = serialized trailing outputs the spender is free to choose (their change).
 *   - `preimage`       = the sighash preimage of this input.
 * Leaves a boolean: true iff the spending tx's outputs are exactly
 *   `enforcedPrefixBytes ‖ spenderOutputs`.
 */
export function outputPrefixCovenantOps(enforcedPrefixBytes: number[], c: PushTxConstants = pushTxConstants()): ScriptChunk[] {
  return [
    ...pushTxVerifyOps(c),        // [ spenderOutputs, preimage ]  (preimage verified genuine)
    ...extractHashOutputsOps(),   // [ spenderOutputs, hashOutputs ]
    op(OP.OP_SWAP),               // [ hashOutputs, spenderOutputs ]
    pushData(enforcedPrefixBytes),// [ hashOutputs, spenderOutputs, prefix ]
    op(OP.OP_SWAP), op(OP.OP_CAT),// [ hashOutputs, prefix ‖ spenderOutputs ]
    op(OP.OP_HASH256),            // [ hashOutputs, HASH256(expected) ]
    op(OP.OP_EQUAL),              // [ bool ]
  ]
}
