# src/bundleCovenant.js

PHAR LAP — Bundle covenant (NEW, standalone; does NOT modify the edition covenant).

A bundle coin is a single covenant UTXO that resells a BUNDLE of on-chain assets and, on EVERY resale,
pays each referenced component's ORIGINAL creator — a fixed payout bound to that component's immutable
genesis address. One coin pays many, so there is no multi-coin "output 0" conflict.

It reuses the shipped covenant primitives (OP_PUSH_TX introspection + the quine self-replication in
`./covenant`) and simply generalizes the edition's single publisher-fee output to an N-payee,
genesis-bound list. The resale forces:

  out0      = the bundle coin re-locked to the SAME covenant, with the NEW holder pubkey  (bond value)
  out1..N   = P2PKH(creatorAddr_i) paying feeSats_i                                       (genesis-bound)
  out(N+1)+ = the spender's change                                                        (free)

and checks `HASH256(out0 ‖ fee_1 ‖ … ‖ fee_N ‖ change) == hashOutputs`. The current holder must sign.

NOT yet wired into the app. The mint flow (bake genesis-verified payees), the wallet verify pass
(confirm each payout address == its component's genesis publisher), the resale/marketplace plumbing,
and two deferred knobs (publisher-set bond; referencing a component's CURRENT price) come later.
Full design + rationale: ~/Documents/bundle-covenant-design.md.

## ScriptChunk

```ts
interface ScriptChunk {
  op: number
  data?: number[]
}
```

Chunks are assembled in `number[]`, as in `covenant.ts`; the conversion to the core script type happens once,
 in `LockingScript.from` below.

## op

```ts
const op = (code: number): ScriptChunk =>
```

## RECORD_BUNDLE

```ts
export const RECORD_BUNDLE = 0x0b
```

Record byte marking a bundle covenant (distinct from the edition RECORD).

## BUNDLE_OWNER_OFFSET

```ts
export const BUNDLE_OWNER_OFFSET = 40
```

Byte offset of the 33-byte holder pubkey within the bundle script.
 P(2)+ver(2)+record(2)+manifestRef(33)+ownerPushOpcode(1) = 40 (same field layout as the edition).

## BundlePayee

```ts
export interface BundlePayee { pubKeyHash: number[]; feeSats: number }
```

One genesis-bound creator payout: pay `feeSats` to `pubKeyHash` — the component's immutable publisher address.

## BundleParams

```ts
export interface BundleParams {
  /** 32-byte reference to the bundle's manifest (e.g. the .bmf content hash). Committed, part of the quine. */
  manifestRef: number[]
  /** 33-byte current holder (owner) pubkey — the quine's mutable slot. */
  ownerPubKey: number[]
  /** Genesis-bound creator payouts, forced on every resale. */
  payees: BundlePayee[]
  /** Satoshis carried on the bundle coin (the publisher-set bond). Default 1. */
  tokenSats?: number
  /** Offset of the owner pubkey within the scriptCode FIELD (varIntSize + BUNDLE_OWNER_OFFSET). */
  fieldPubkeyOffset: number
  c?: PushTxConstants
}
```

## bundleTailOps

```ts
export function bundleTailOps(payees: BundlePayee[], tokenSats = 1): ScriptChunk[]
```

Resale tail. Stack on entry (after `covenantPrefixOps`):
  [ change, newOwnerPub, ownerSig, pre, ownerPub, suffix ], alt = [ hashOutputs ].
Authenticates the current holder, rebuilds out0 (self-replica with the new holder), forces the N fixed
creator-fee outputs, appends the spender's change, and asserts `HASH256(expected) == hashOutputs`.
(Generalizes `transferTailOps` from one publisher fee to N genesis-bound creator fees.)

At `pushData([1]), op(OP.OP_PICK),`:

authenticate the current holder: <ownerSig> <ownerPub> OP_CHECKSIGVERIFY

At `pushData([1]), op(OP.OP_PICK),`:

copy ownerPub (extracted from scriptCode)

At `pushData([4]), op(OP.OP_PICK),`:

copy ownerSig (from the unlock)

At `pushData(VALUE1),`:

out0 = VALUE1 ‖ pre ‖ newOwnerPub ‖ suffix   (bundle re-locked to the new holder)

At `pushData([3]), op(OP.OP_PICK), op(OP.OP_CAT),`:

‖ pre

At `pushData([5]), op(OP.OP_PICK), op(OP.OP_CAT),`:

‖ newOwnerPub

At `pushData([1]), op(OP.OP_PICK), op(OP.OP_CAT),`:

‖ suffix → out0

At `...feeCats,`:

‖ FEE_1 ‖ … ‖ FEE_N (constant, genesis-bound)

At `pushData([6]), op(OP.OP_ROLL), op(OP.OP_CAT),`:

‖ change → expected

## bundleLockOps

```ts
export function bundleLockOps(p: BundleParams): ScriptChunk[]
```

The full bundle locking-script op list: committed state fields (dropped at runtime), the covenant prefix, the tail.

At `op(OP.OP_2DROP), op(OP.OP_2DROP), op(OP.OP_DROP),`:

5 state fields — present in the script bytes (quine), no-op at runtime

## buildBundleLock

```ts
export function buildBundleLock(p: Omit<BundleParams, 'fieldPubkeyOffset'>): CoreLockingScript
```

Build the bundle locking script, computing the holder-pubkey offset from the fixed field layout
 (two-pass, like `buildEditionLock`: the offset push is a stable width, so the scriptCode varint is stable).

## bundleTransferUnlockChunks

```ts
export function bundleTransferUnlockChunks(p: { newOwnerPubKey: number[]; ownerSig: number[]; change: number[]; preimage: number[] }): ScriptChunk[]
```

Unlock a bundle resale. Stack it leaves (bottom→top): change, newOwnerPub, ownerSig, preimage.

## swapBundleOwner

```ts
export function swapBundleOwner(lockBytes: number[], newOwnerPub: number[]): number[]
```

Swap the 33-byte holder pubkey in a copy of a bundle script (the quine's mutable slot) — used to build out0.
