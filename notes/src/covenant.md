# src/covenant.js

PHAR LAP — miner-enforced covenant scripts, built on the OP_PUSH_TX primitive (`./pushtx`).

The covenant verifies the spending transaction's sighash preimage in-script (so it is provably
genuine), then reads `hashOutputs` from the preimage and forces the spending tx to contain a
specific set of outputs — by reconstructing those outputs and asserting
`HASH256(reconstructed) == hashOutputs`. The spender may append arbitrary trailing outputs
(their own change), which they supply in the unlocking script; they cannot alter the enforced
prefix.

Layers (built incrementally, each validated against a script interpreter):
  L1 — enforce a fixed-bytes output prefix + spender-supplied trailing outputs.  ← this file
  L2 — reconstruct the "token returned to holder" output from the script's own bytes (quine).
  L3 — reconstruct the buyer's replica output (same covenant, buyer's pubkey substituted).
  L4 — publisher-fee + holder-fee P2PKH outputs (Addendum A edition-mint layout).
  L5 — transfer/replicate branching + wiring into tokenCodec/collectionBuilder.

## ScriptChunk

```ts
interface ScriptChunk {
  op: number
  data?: number[]
}
```

⚠⚠ THE SEAM, exactly as in `pushDrop.ts`: this module assembles script chunks in `number[]`, and the
  wallet core's script type carries `Uint8Array`. Declaring the chunk shape HERE keeps 737 lines of
  covenant assembly untouched, and the conversion happens only where a real script is produced.
⛔ Do not swap this for the core's chunk type. These chunks are built by hand, opcode by opcode, and
  every one of them is part of a script whose bytes are already on chain.

## LockingScript

```ts
const LockingScript = class {
```

★ Build a real locking script from hand-assembled chunks, converting at the boundary.

## op

```ts
const op = (code: number): ScriptChunk =>
```

## u64le

```ts
export function u64le(n: number): number[]
```

Little-endian 8-byte satoshi amount.

## numLE

```ts
export function numLE(n: number): number[]
```

Minimal little-endian script-number encoding of a non-negative integer (for OP_SPLIT indices).

## varInt

```ts
export function varInt(n: number): number[]
```

Bitcoin var-int (CompactSize).

## serializeOutput

```ts
export function serializeOutput(satoshis: number, scriptBytes: number[]): number[]
```

Serialize a tx output exactly as it appears inside hashOutputs: value(8 LE) ‖ varint(len) ‖ script.

## p2pkhScript

```ts
export function p2pkhScript(hash20: number[]): number[]
```

Standard 25-byte P2PKH locking script for a 20-byte pubkey hash.

At `return [0x76, 0xa9, 0x14, ...hash20, 0x88, 0xac]`:

OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG

## extractHashOutputsOps

```ts
export function extractHashOutputsOps(): ScriptChunk[]
```

Op fragment: consumes the verified preimage on top of the stack and leaves `hashOutputs` (32 bytes).
hashOutputs sits at preimage bytes [len-40, len-8): the trailing 52 bytes are
value(8) ‖ nSequence(4) ‖ hashOutputs(32) ‖ nLocktime(4) ‖ sighashType(4).

At `op(OP.OP_SIZE), pushData([40]), op(OP.OP_SUB), op(OP.OP_SPLIT), op(OP.OP_NIP),`:

tail 40 bytes

At `pushData([32]), op(OP.OP_SPLIT), op(OP.OP_DROP),`:

first 32 = hashOutputs

## extractScriptCodeFieldOps

```ts
export function extractScriptCodeFieldOps(): ScriptChunk[]
```

Op fragment: consumes the verified preimage and leaves the `scriptCode` FIELD (varint(len) ‖ script).
That field is exactly the `varint(scriptLen) ‖ script` portion of an output serialization, so it can
be concatenated straight after an 8-byte value to rebuild "an output paying this same script".

Preimage layout: version(4) ‖ hashPrevouts(32) ‖ hashSequence(32) ‖ outpoint(36) ‖ scriptCodeField
‖ value(8) ‖ nSequence(4) ‖ hashOutputs(32) ‖ nLocktime(4) ‖ sighashType(4). So the field is bytes
[104, len-52) — a fixed prefix (104) and a fixed suffix (52), independent of script length and of
whether ANYONECANPAY zeroed the prevout/sequence hashes (still 32 bytes each).

At `pushData([104]), op(OP.OP_SPLIT), op(OP.OP_NIP),`:

drop 104-byte prefix

At `op(OP.OP_SIZE), pushData([52]), op(OP.OP_SUB), op(OP.OP_SPLIT), op(OP.OP_DROP),`:

drop 52-byte suffix

## selfReplicateCovenantOps

```ts
export function selfReplicateCovenantOps(tokenSats = 1, c: PushTxConstants = pushTxConstants()): ScriptChunk[]
```

L2 self-replicating ("quine") covenant. Stack on entry: [ spenderOutputs, preimage ].
Forces output[0] to pay `tokenSats` to the SAME script that is currently executing (extracted from
the preimage's scriptCode — no second copy embedded), then `spenderOutputs` for the rest. Leaves a
boolean. A token under this covenant can only be spent into a copy of itself.

At `...pushTxVerifyOps(c),`:

[ spenderOutputs, preimage ]

At `op(OP.OP_DUP),`:

[ spenderOutputs, preimage, preimage ]

At `...extractHashOutputsOps(),`:

[ spenderOutputs, preimage, hashOutputs ]

At `op(OP.OP_SWAP),`:

[ spenderOutputs, hashOutputs, preimage ]

At `...extractScriptCodeFieldOps(),`:

[ spenderOutputs, hashOutputs, scriptCodeField ]

At `pushData(u64le(tokenSats)), op(OP.OP_SWAP), op(OP.OP_CAT),`:

[ .., hashOutputs, out0 = value ‖ field ]

At `op(OP.OP_ROT), op(OP.OP_CAT),`:

[ hashOutputs, out0 ‖ spenderOutputs ]

## swapPubkeyOut0CovenantOps

```ts
export function swapPubkeyOut0CovenantOps(fieldPubkeyOffset: number, tokenSats = 1, c: PushTxConstants = pushTxConstants()): ScriptChunk[]
```

L3 pubkey-substitution covenant. Re-creates the covenant in output[0] but with the 33-byte owner
pubkey replaced by one supplied in the unlocking script — the basis for a buyer's replica (owner =
buyer) and for an enforced transfer (owner = recipient).

`fieldPubkeyOffset` is the byte offset of the owner pubkey *within the scriptCode field*
(= varIntSize(scriptLen) + offset-of-pubkey-within-the-script); the caller computes it from the
token's layout. Swapping a 33-byte key for another leaves the script length — and thus the varint —
unchanged, so we mutate the field in place.

Stack on entry (top last): [ spenderOutputs, newOwnerPubKey, preimage ]. Leaves a boolean.

At `...pushTxVerifyOps(c),`:

[ rest, newPub, preimage ]

At `...extractHashOutputsOps(),`:

[ rest, newPub, preimage, hashOutputs ]

At `op(OP.OP_SWAP),`:

[ rest, newPub, hashOutputs, preimage ]

At `...extractScriptCodeFieldOps(),`:

[ rest, newPub, hashOutputs, scFld ]

At `pushData(numLE(fieldPubkeyOffset)), op(OP.OP_SPLIT),`:

[ .., pre, oldPub‖suffix ]

At `pushData([33]), op(OP.OP_SPLIT), op(OP.OP_NIP),`:

[ .., pre, suffix ]  (drop oldPub)

At `op(OP.OP_TOALTSTACK),`:

alt:[suffix];  [ rest, newPub, hashOutputs, pre ]

At `op(OP.OP_2), op(OP.OP_ROLL),`:

[ rest, hashOutputs, pre, newPub ]

At `op(OP.OP_CAT),`:

[ rest, hashOutputs, pre‖newPub ]

At `op(OP.OP_FROMALTSTACK), op(OP.OP_CAT),`:

[ rest, hashOutputs, modifiedField ]

At `pushData(u64le(tokenSats)), op(OP.OP_SWAP), op(OP.OP_CAT),`:

[ rest, hashOutputs, out0 ]

At `op(OP.OP_ROT), op(OP.OP_CAT),`:

[ hashOutputs, out0‖rest ]

## ReplicateParams

```ts
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
```

## covenantPrefixOps

```ts
export function covenantPrefixOps(fieldPubkeyOffset: number, c: PushTxConstants = pushTxConstants()): ScriptChunk[]
```

L4 — Addendum A "unlimited mints" replicate branch. Permissionlessly enforces (no holder signature):
  out[0] token returned to the holder  (covenant re-created verbatim — same owner)
  out[1] replica to the buyer          (covenant re-created with owner = buyer pubkey)
  out[2] publisher fee                   (P2PKH to the immutable publisher address, fixed sats)
  out[3] holder fee                    (P2PKH to the current holder, derived in-script from the owner pubkey)
  out[4+] buyer change                 (spender-supplied)

Stack on entry (top last): [ buyerChange, buyerPubKey, preimage ]. Leaves a boolean.

NOTE: pair this with a SIGHASH_ANYONECANPAY|ALL|FORKID preimage in production so any buyer can add
funding inputs without invalidating the holder's outpoint commitment. The output enforcement here is
identical regardless of ANYONECANPAY.

Shared covenant prefix (runs once, before any branch). Verifies the preimage, stashes hashOutputs
on the alt stack, extracts the scriptCode field, and splits it at the owner-pubkey offset into the
three reusable pieces. Stack on entry: [ ..., preimage ]. On exit: [ ..., pre, ownerPub, suffix ]
with alt = [ hashOutputs ]. `pre` = scriptCode field up to the owner pubkey; `suffix` = the rest.

At `...extractHashOutputsOps(), op(OP.OP_TOALTSTACK),`:

alt:[hashOutputs]

At `...extractScriptCodeFieldOps(),`:

[ ..., scFld ]

At `pushData(numLE(fieldPubkeyOffset)), op(OP.OP_SPLIT),`:

[ ..., pre, ownerPub‖suffix ]

At `pushData([33]), op(OP.OP_SPLIT),`:

[ ..., pre, ownerPub, suffix ]

## replicateTailOps

```ts
export function replicateTailOps(p: {
  tokenSats?: number; publisherPubKeyHash: number[]; publisherFeeSats: number; holderFeeSats: number
}): ScriptChunk[]
```

Replicate tail (Addendum A). Stack on entry: [ buyerChange, buyerPub, pre, ownerPub, suffix ],
alt = [ hashOutputs ]. Enforces out[0] token→holder (verbatim), out[1] replica→buyer (owner swapped),
out[2] publisher fee, out[3] holder fee, out[4+] buyerChange. Leaves a boolean.

At `const OUT2 = serializeOutput(p.publisherFeeSats, p2pkhScript(p.publisherPubKeyHash))`:

constant

At `const C3pre = [...u64le(p.holderFeeSats), 0x19, 0x76, 0xa9, 0x14]`:

value ‖ varint(25) ‖ OP_DUP OP_HASH160 PUSH20

At `const C3suf = [0x88, 0xac]`:

OP_EQUALVERIFY OP_CHECKSIG

At `pushData(VALUE1),`:

out0 = VALUE1 ‖ pre ‖ ownerPub ‖ suffix (token back to holder, verbatim)

At `pushData(VALUE1),`:

out1 = VALUE1 ‖ pre ‖ buyerPub ‖ suffix (replica to buyer)

At `op(OP.OP_CAT),`:

out0 ‖ out1

At `pushData(OUT2), op(OP.OP_CAT),`:

‖ out2 (publisher fee, constant)

At `pushData([2]), op(OP.OP_PICK), op(OP.OP_HASH160), op(OP.OP_CAT),`:

‖ HASH160(ownerPub)

At `pushData(C3suf), op(OP.OP_CAT),`:

→ out3 (holder fee)

At `pushData([5]), op(OP.OP_ROLL), op(OP.OP_CAT),`:

‖ buyerChange → expected

At `op(OP.OP_TOALTSTACK), op(OP.OP_2DROP), op(OP.OP_2DROP),`:

stash expected; drop 4 leftover pieces

## transferTailOps

```ts
export function transferTailOps(p: { tokenSats?: number }): ScriptChunk[]
```

Transfer tail (owner-signed, enforced). Stack on entry:
[ change, newOwnerPub, ownerSig, pre, ownerPub, suffix ], alt = [ hashOutputs ].
Verifies the current owner authorized the move (OP_CHECKSIGVERIFY against the extracted ownerPub),
then forces out[0] to re-create the covenant with owner = newOwnerPub (value preserved), out[1+] change.

At `pushData([1]), op(OP.OP_PICK),`:

authenticate current owner: <ownerSig> <ownerPub> OP_CHECKSIGVERIFY

At `pushData([1]), op(OP.OP_PICK),`:

copy ownerPub

At `pushData([4]), op(OP.OP_PICK),`:

copy ownerSig

At `pushData(VALUE1),`:

out0 = VALUE1 ‖ pre ‖ newOwnerPub ‖ suffix

At `pushData([3]), op(OP.OP_PICK), op(OP.OP_CAT),`:

‖ pre

At `pushData([5]), op(OP.OP_PICK), op(OP.OP_CAT),`:

‖ newOwnerPub

At `pushData([1]), op(OP.OP_PICK), op(OP.OP_CAT),`:

‖ suffix → out0

At `pushData([6]), op(OP.OP_ROLL), op(OP.OP_CAT),`:

‖ change → expected

At `op(OP.OP_TOALTSTACK), op(OP.OP_2DROP), op(OP.OP_2DROP), op(OP.OP_DROP),`:

drop 5 leftover pieces

## burnTailOps

```ts
export function burnTailOps(): ScriptChunk[]
```

Burn tail (owner-signed, NO output enforcement). Stack on entry (after the dispatch drops the selector):
[ ownerSig, pre, ownerPub, suffix ], alt = [ hashOutputs ]. Authenticates the current owner EXACTLY like
transfer (the ownerPub/ownerSig stack depths are identical — newOwnerPub/change just sit below ownerSig),
then succeeds. The owner's SIGHASH-ALL signature already commits to their chosen outputs, so they sweep the
bonded sats anywhere and the token is destroyed (no covenant output is re-created). Only the current owner
can produce a valid ownerSig against the script-embedded ownerPub, so only they can burn.

At `pushData([1]), op(OP.OP_PICK),`:

authenticate current owner: <ownerSig> <ownerPub> OP_CHECKSIGVERIFY  (same auth as transferTailOps)

At `pushData([1]), op(OP.OP_PICK),`:

copy ownerPub

At `pushData([4]), op(OP.OP_PICK),`:

copy ownerSig

At `op(OP.OP_2DROP), op(OP.OP_2DROP),`:

burn: enforce nothing — the owner authorised their outputs by signing. Clean up + succeed.

At `op(OP.OP_2DROP), op(OP.OP_2DROP),`:

drop suffix, ownerPub, pre, ownerSig

At `op(OP.OP_FROMALTSTACK), op(OP.OP_DROP),`:

discard hashOutputs (unused by burn)

## replicateBranchOps

```ts
export function replicateBranchOps(p: ReplicateParams): ScriptChunk[]
```

Standalone replicate covenant (L4 test/reference): prefix + replicate tail. Entry [change, buyerPub, preimage].

## EDITION_SCOPE

```ts
export const EDITION_SCOPE = 0xc1
```

--- L5: the real edition token (data fields + transfer/replicate branches) ---

SIGHASH used for the covenant's OP_PUSH_TX introspection: ANYONECANPAY|ALL|FORKID (0xc1).

## RECORD_EDITION

```ts
export const RECORD_EDITION = 0x05
```

Record type byte for a covenant edition token (0x01-0x04 are TEMPLATE/TOKEN/FILE/MESSAGE).

## serializedPushLen

```ts
function serializedPushLen(data: number[]): number
```

Serialized byte length of a minimal-length-prefixed data push (matches `pushData`).

## EditionFields

```ts
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
```

## EditionParams

```ts
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
```

## editionFieldChunks

```ts
function editionFieldChunks(f: EditionFields): ScriptChunk[]
```

v1 edition data-field chunks (lean): [P, version, RECORD_EDITION, tx1Ref, ownerPubKey].
 ⚠ FIVE FIELDS, AND THE TWO THAT ARE ABSENT WERE NEVER USEFUL. A price field was only ever read by a
 covenant version that was never minted. A stateData field is covenant-PINNED — reproduced verbatim in
 the suffix on every spend, so immutable, and always minted empty — meaning it carried no information.
 ★ The owner pubkey stays at offset 40 because both absent fields sat AFTER it, so every offset in this
 file is unchanged by their removal.

## editionLockOps

```ts
export function editionLockOps(p: EditionParams): ScriptChunk[]
```

Full edition-token locking script ops:
  <5 data fields> OP_2DROP OP_2DROP OP_DROP    (carry token metadata on-chain, then clear the stack)
  <shared covenant prefix>                     (verify preimage; extract hashOutputs + scriptCode pieces)
  <selector> 3-way dispatch: 2 → burn, 1 → transfer, 0 → replicate
Use `buildEditionLock` instead of calling this directly — it computes `fieldPubkeyOffset` for you.

At `op(OP.OP_2DROP), op(OP.OP_2DROP), op(OP.OP_DROP),`:

5 fields

At `pushData([3]), op(OP.OP_ROLL),`:

bring the branch selector to the top

At `op(OP.OP_DUP), op(OP.OP_2), op(OP.OP_NUMEQUAL), op(OP.OP_IF),`:

selector == 2 → burn

At `op(OP.OP_DROP),`:

drop the selector

At `op(OP.OP_ELSE),`:

selector 1 → transfer, 0 → replicate

## buildEditionLock

```ts
export function buildEditionLock(p: Omit<EditionParams, 'fieldPubkeyOffset'>): LockingScript
```

Build the edition-token locking script, computing the owner-pubkey offset from the field layout.
The owner pubkey sits before the variable-length stateData, so its offset is constant for a
collection. (Two-pass: the offset push is the same byte-width whether the script is being probed
or finalised, so the length used to size the scriptCode varint is stable.)

At `const O = before.reduce((s, f) => s + serializedPushLen(f), 0) + 1`:

+1 for the ownerPubKey push opcode

## editionSupportsBurn

```ts
export function editionSupportsBurn(lockBytes: number[]): boolean
```

Whether an edition lock has the burn branch (3-way dispatch). A v1 edition's only OP_NUMEQUAL is in the
 burn dispatch, so its presence cleanly distinguishes burn-capable (bonded) editions from older ones.

## EDITION_OWNER_SCRIPT_OFFSET

```ts
export const EDITION_OWNER_SCRIPT_OFFSET = 40
```

Byte offset of the 33-byte owner pubkey within the edition locking script, for the canonical field
layout (prefix/version/record are 1-byte: P(2)+ver(2)+record(2)+tx1Ref(33)+pushOpcode(1) = 40).

## swapEditionOwner

```ts
export function swapEditionOwner(lockBytes: number[], newOwnerPub: number[]): number[]
```

Return a copy of an edition locking script with the owner pubkey replaced (JS mirror of the in-script swap).

## EDITION_TX1REF_SCRIPT_OFFSET

```ts
export const EDITION_TX1REF_SCRIPT_OFFSET = 7
```

Byte offset of the 32-byte tx1Ref (Collection ID) within the edition locking script:
P(2) + ver(2) + record(2) + push-opcode(1) = 7 (the 32 ref bytes sit at [7, 39)).

## buildHolderEditionScript

```ts
export function buildHolderEditionScript(templateCovenantBytes: number[], tx1Ref: number[], ownerPub: number[]): number[]
```

Reconstruct a holder's exact edition locking script from a collection's covenant TEMPLATE.

Every edition of a collection shares one covenant body — identical stateData (immutable storefront),
fees, and tokenSats — differing only in the two identity fields the covenant fills in: tx1Ref (the
Collection ID, at offset 7) and the owner pubkey (at offset 40). TX1 commits that template with both
zeroed. So splicing a real tx1Ref + owner into the template bytes yields the byte-for-byte script of
that holder's edition — which is exactly what genesis/replicate produce. This makes the holder's
edition deterministically derivable (and thus its UTXO findable by script hash) without any history walk.

## editionOwnerPubKey

```ts
export function editionOwnerPubKey(lockBytes: number[]): number[]
```

Extract the 33-byte owner pubkey from an edition locking script.

## ParsedEdition

```ts
export interface ParsedEdition {
  /** Collection id = TX1 txid (hex). */
  tx1RefHex: string
  /** 33-byte owner pubkey (hex). */
  ownerPubKeyHex: string
  stateDataHex: string
  /** Economic terms recovered from the covenant body (no out-of-band data needed). */
  terms: { publisherPubKeyHash: number[]; publisherFeeSats: number; holderFeeSats: number }
}
```

## chunkBytes

```ts
function chunkBytes(c: ScriptChunk): number[] | null
```

At `if (c.op >= 0x51 && c.op <= 0x60) return [c.op - 0x50]`:

OP_1..OP_16

## leToNum

```ts
function leToNum(b: number[]): number
```

## parseEditionScript

```ts
export function parseEditionScript(script: LockingScript): ParsedEdition | null
```

Parse an edition covenant locking script into its data fields + economic terms, or null if the
script is not a PHAR LAP edition. The terms are recovered from the covenant body itself (the
publisher-fee and holder-fee output constants), so a recipient can replicate/transfer with no
out-of-band metadata. Structural parse only — lineage/authenticity is a separate verify step.

At `if (ch[5].op !== OP.OP_2DROP || ch[6].op !== OP.OP_2DROP || ch[7].op !== OP.OP_DROP) return null`:

v1 lean layout: 5 fields, then OP_2DROP OP_2DROP OP_DROP (no price/stateData fields).

At `let publisherFeeSats = 0, holderFeeSats = 0`:

Recover fees/publisher from the OUT2 (34B) and C3pre (12B) constants — both carry the P2PKH
signature 0x19 0x76 0xa9 0x14 (varint(25) ‖ OP_DUP OP_HASH160 PUSH20) at offset 8.

## editionReplicateUnlockChunks

```ts
export function editionReplicateUnlockChunks(p: {
  buyerPubKey: number[]; buyerChange: number[]; preimage: number[]
}): ScriptChunk[]
```

⛔ `parseEditionAny` STOOD HERE, dispatching to a second covenant version before falling back to this
one. There is only one version, so `parseEditionScript` is the parser and there is no "any" to choose
between. ⚠ Kept as a note rather than silently deleted: callers imported the old name, and a reader
who finds it in an older file should know it was removed on purpose, not lost.

Unlock for a permissionless replicate (no signature): [ buyerChange, buyerPub, OP_0, preimage ].

## editionTransferUnlockChunks

```ts
export function editionTransferUnlockChunks(p: {
  newOwnerPubKey: number[]; ownerSig: number[]; change: number[]; preimage: number[]
}): ScriptChunk[]
```

Unlock for an owner-signed transfer: [ change, newOwnerPub, ownerSig, OP_1, preimage ].

## editionBurnUnlockChunks

```ts
export function editionBurnUnlockChunks(p: { ownerSig: number[]; preimage: number[] }): ScriptChunk[]
```

Unlock for an owner-signed burn (selector 2): [ ownerSig, OP_2, preimage ]. The owner sweeps the bonded
 sats via outputs of their choosing (committed by the SIGHASH-ALL ownerSig); the token is destroyed.

## outputPrefixCovenantOps

```ts
export function outputPrefixCovenantOps(enforcedPrefixBytes: number[], c: PushTxConstants = pushTxConstants()): ScriptChunk[]
```

L1 covenant body. Stack on entry (top last): [ spenderOutputs, preimage ].
  - `spenderOutputs` = serialized trailing outputs the spender is free to choose (their change).
  - `preimage`       = the sighash preimage of this input.
Leaves a boolean: true iff the spending tx's outputs are exactly
  `enforcedPrefixBytes ‖ spenderOutputs`.

At `...pushTxVerifyOps(c),`:

[ spenderOutputs, preimage ]  (preimage verified genuine)

At `...extractHashOutputsOps(),`:

[ spenderOutputs, hashOutputs ]

At `op(OP.OP_SWAP),`:

[ hashOutputs, spenderOutputs ]

At `pushData(enforcedPrefixBytes),`:

[ hashOutputs, spenderOutputs, prefix ]

At `op(OP.OP_SWAP), op(OP.OP_CAT),`:

[ hashOutputs, prefix ‖ spenderOutputs ]

At `op(OP.OP_HASH256),`:

[ hashOutputs, HASH256(expected) ]

At `op(OP.OP_EQUAL),`:

[ bool ]
