# src/collectionBuilder.js

PHAR LAP collection builder (genesis).

A collection is created with two transactions (PLAN.md Addendum C):
  TX1 (template): a PushDrop TEMPLATE output (+ optional FILE output) committing all
       immutable collection data, locked to the publisher and kept unspent. TX1's txid is
       the Collection ID.
  TX2 (genesis):  PushDrop TOKEN outputs that reference TX1 by txid, locked to the owner.

The low-level `buildTemplateTx` / `buildGenesisTx` are pure and offline (they take explicit
funding inputs), so the construction is unit-testable without the network. `createCollection`
is the network wrapper that selects funding, builds both txs (TX2 funded by TX1's change),
and broadcasts them.

Reuses the WhatsOnChain client (walletProvider) and the field codec (tokenCodec) over the
raw-key PushDrop template (pushDrop). Verification (lineage, covenant match) is Phase 4.

## UNLOCK_P2PKH

```ts
export const UNLOCK_P2PKH = 108
```

⚠⚠⚠ THIS FILE IS WHERE THE BUILD SHAPE CHANGED, so the two helpers below carry the whole of it.

  was                                     now
  ──────────────────────────────────────  ─────────────────────────────────────────────────────────
  an input holding its parent transaction the outpoint and the value, stated
  an output flagged as "the change"       a change output whose value `applyFee` settles
  a fee pass that mutates the transaction applyFee(tx, { inputValues, changeVout, satPerKb })
  a transaction that signs itself         signFunding(tx, signer, funding)

★ The transaction no longer signs itself from parent transactions it was handed. A BIP-143 signature
  commits to a script and an amount the spending transaction does not contain, so those are now
  arguments rather than a lookup, and a wrong one is visible at the call site.

⚠ Funding always pays THIS wallet's own address - `getSafeUtxos` reads one address - so the script
  being spent is the signer's own locking script. That is why `sourceTx` is no longer needed to sign,
  even though the interface still carries it for callers that use it elsewhere.

⚠⚠⚠ 108, AND THE ONE THAT IS ARGUABLY CORRECT IS 107. This was found by byte-identity testing: a
  three-input payment came out ONE SATOSHI cheaper than the deployed wallet's, because 107 × 3 and
  108 × 3 fall either side of a rounding boundary. One and two input transactions matched exactly, so
  nothing short of comparing raw bytes on a multi-input transaction would have shown it.

  ★ Why 107 is defensible: we always sign LOW-S, so `s < N/2`, so its top bit is clear and DER never
    needs a padding byte for it. That caps a signature at 71 DER + 1 sighash = 72, giving
    `1 + 72 + 1 + 33 = 107`. A 108-byte unlocking script cannot occur for a signature we produce.
  ⛔ Why we use 108 anyway: it is what is deployed, and matching it keeps every fee identical. The
    saving is under a satoshi per input; changing the fee behaviour of a live wallet is not worth it,
    and over-estimating a fee is the safe direction while under-estimating silently never confirms.

## addFunding

```ts
export function addFunding(tx: Tx, funding: FundingInput[]): void
```

Add the funding UTXOs as unsigned inputs, in order. ★ Shared with the payment path.

## signFunding

```ts
export function signFunding(tx: Tx, signer: Signer, funding: FundingInput[], firstInput = 0): void
```

Sign those inputs. ⚠ They are inputs 0..n-1; anything else in the transaction signs itself.

⚠⚠ `firstInput` EXISTS BECAUSE FUNDING IS NOT ALWAYS AT INDEX 0. A covenant spend puts the covenant
  input first and the payer's funding after it. Signing `tx.inputs[i]` for funding entry `i` would
  then sign the COVENANT input with a P2PKH unlock and leave the real funding input empty.
⛔ The failure is not loud: the transaction serializes, broadcasts, and is rejected by the network for
  a bad script — with nothing locally to say the indexes were off by one. Hence the parameter, and
  hence it is required to be correct rather than inferred.

## PHARLAP_OUTPUT_SATS

```ts
export const PHARLAP_OUTPUT_SATS = 1
```

Satoshi value of each PushDrop record output (token / template / file).

## DEFAULT_FEE_PER_KB

```ts
export const DEFAULT_FEE_PER_KB = 101
```

Default fee rate (satoshis per kilobyte) — current BSV standard is 100 sat/KB.

101, not 100: the official minimum is 100 sats/KB, and the extra 1 sat/KB is a safety hair so a tx can never
round or estimate its way *under* the floor. This is NOT ARC's inflated 500 — we hold at the true minimum
(miners mine 100 sats/KB fine; see [[fee-rate-policy]]); the +1 is belt-and-braces only.

## FundingInput

```ts
export interface FundingInput {
  utxo: Utxo
  /** ⚠ No longer needed to SIGN - the script and amount are passed explicitly. Kept for callers. */
  sourceTx?: Tx
}
```

## getSafeUtxos

```ts
export async function getSafeUtxos(provider: WalletProvider): Promise<Utxo[]>
```

─── Funding selection / quarantine ─────────────────────────────────

Funding UTXOs safe to spend: never spend a PHAR LAP record output as fee funding.
All PHAR LAP outputs are PHARLAP_OUTPUT_SATS (1 sat), so the ≤1-sat quarantine protects
them (and any other ≤1-sat token/ordinal). A script-aware quarantine (classifyRecord) is a
Phase 5 hardening once UTXO scripts are available from the provider.

## selectFunding

```ts
export function selectFunding(utxos: Utxo[], target: number): Utxo[]
```

Greedy funding selection (largest first) covering `target` satoshis.

## sha256Hex

```ts
export function sha256Hex(bytes: number[]): string
```

SHA-256(bytes) as hex — used for the optional template fileHash.

## TemplateTxResult

```ts
export interface TemplateTxResult {
  tx: Tx
  tx1Id: string
  templateVout: number
  fileVout: number | null
  storefrontVout: number | null
  mockupVout: number | null
  changeVout: number | null
  changeSats: number
}
```

─── TX1: template (+ optional file) ────────────────────────────────

## buildTemplateTx

```ts
export async function buildTemplateTx(opts: {
  key: Signer
  funding: FundingInput[]
  template: TemplateFields
  file?: FileFields
  /** Optional immutable storefront record (description + optional cover image), TX1-resident. */
  storefront?: StorefrontFields
  /** Optional packed mockup-cover manifest (mockup.ts packCover) — carried as its own TX1 output. */
  mockup?: number[]
  outputSats?: number
  feePerKb?: number
}): Promise<TemplateTxResult>
```

At `const changeVout = tx.outputs.length`:

⚠ value 0 for now: `applyFee` settles it once the size is known. The output is always PRESENT,
  never dropped as dust - measured against the deployed behaviour, which keeps it too.

## GenesisTxResult

```ts
export interface GenesisTxResult {
  tx: Tx
  tx2Id: string
  tokenVouts: number[]
  changeVout: number | null
  changeSats: number
}
```

─── TX2: genesis mint ──────────────────────────────────────────────

## buildGenesisTx

```ts
export async function buildGenesisTx(opts: {
  key: Signer
  funding: FundingInput[]
  tx1Id: string
  mintCount: number
  stateData?: string
  outputSats?: number
  feePerKb?: number
}): Promise<GenesisTxResult>
```

## CollectionParams

```ts
export interface CollectionParams {
  tokenName: string
  /** Declared supply for tokenRules (0 = unlimited / replicable). */
  supply?: number
  divisibility?: number
  restrictions?: number
  rulesVersion?: number
  /** Covenant script bytes (hex). Empty = no covenant. */
  covenantScript?: string
  file?: { mimeType: string; fileName: string; bytes: number[] }
  /** Tier-1 encrypt the embedded file (Addendum F). Requires `file`. The FILE output holds ciphertext; the
   *  wrapped content key rides in the template so only the publisher's key (and buyers it's shared with) can
   *  decrypt. This is the "encrypted product atom" — never mint a paid design in the clear. */
  encrypt?: boolean
  /** Immutable storefront blurb shown on the collection / sales page (the public "what you're buying" face,
   *  visible even when the content is encrypted). */
  description?: string
  /** Optional public (unencrypted) cover image — the storefront's face. For paid designs this should be the
   *  WATERMARKED PREVIEW, not the clean product (which lives encrypted in the FILE output). */
  cover?: { mimeType: string; fileName: string; bytes: number[] }
  /** Optional public BACK cover image (flippable on the sales page). Requires a front `cover`. */
  backCover?: { mimeType: string; fileName: string; bytes: number[] }
  /** Optional IMMUTABLE licence code (fixed at mint, travels with the coin) — e.g. "TS-COM-1", "CC-BY-4.0", "ARR". */
  license?: string
  /** Optional 64-hex txid pointing at the full licence text minted on-chain. */
  licenseRef?: string
  /** Optional packed mockup-cover manifest (mockup.ts packCover) — a TX1 output; the curator composites the
   *  public cover onto the referenced prop. */
  mockupManifest?: number[]
  /** How many token outputs to mint in TX2. Default: supply if > 0, else 1. */
  mintCount?: number
  /** Initial per-token stateData (hex). */
  initialStateData?: string
  outputSats?: number
  feePerKb?: number
  /** Optional spend gate: called with the EXACT total sats to be spent (built tx fee + outputs, minus change)
   *  AFTER both txs are built but BEFORE broadcast. Return false to abort (throws SPEND_CANCELLED). */
  confirmSpend?: (totalSats: number) => boolean | Promise<boolean>
}
```

─── createCollection: build both + broadcast ───────────────────────

## SPEND_CANCELLED

```ts
export const SPEND_CANCELLED = 'SPEND_CANCELLED'
```

Thrown by a builder when the caller's confirmSpend gate returns false — nothing was broadcast.

## spentSats

```ts
export function spentSats(selected: Array<{ satoshis: number }>, finalChangeSats: number): number
```

Net sats leaving the wallet for a flow = the selected funding minus the final change output.

## CollectionResult

```ts
export interface CollectionResult {
  collectionId: string // = tx1Id
  tx1Id: string
  tx2Id: string
  tokenOutpoints: Array<{ txId: string; outputIndex: number }>
}
```

## createCollection

```ts
export async function createCollection(
  provider: WalletProvider,
  key: Signer,
  params: CollectionParams,
): Promise<CollectionResult>
```

At `const encrypt = params.encrypt === true && params.file != null`:

Smart-compress (keep only if smaller), then optionally Tier-1 encrypt. Order matters: compress BEFORE
encrypt (ciphertext is incompressible). The FILE output stores the final bytes; fileHash binds them.
Unlike the covenant edition path this does NOT set RESTRICTION_REPLICABLE — a capped/limited mint has a
fixed supply, not unlimited replication.

At `fileHash: params.file == null ? undefined : encrypt ? sha256Hex(storedBytes) : sha256Hex(params.f...`:

PUBLIC content binds the plaintext hash (provenance); ENCRYPTED content binds the ciphertext hash (privacy —
a public plaintext hash would be a confirmation oracle). Mirrors the edition path.

At `const hasStorefront = (params.description != null && params.description.length > 0) || params.cov...`:

Immutable storefront record (description + optional public cover/back-cover), carried as a TX1 output — the
public "what you're buying" face, shown even when the content is encrypted. For paid designs the cover is the
WATERMARKED PREVIEW (the clean product stays encrypted in the FILE output).

At `backCoverMimeType: params.cover != null ? params.backCover?.mimeType : undefined,`:

A back cover only makes sense alongside a front cover (the codec keys "has back" off the bytes).

At `const numOutputs = 1 + (file ? 1 : 0) + (storefront ? 1 : 0) + (params.mockupManifest?.length ? 1...`:

Select funding to cover BOTH txs' outputs + fees (applyFee computes exact fees afterwards;
selection just needs to pick enough UTXOs, and TX1 must leave enough change to fund TX2).
TX1 carries any embedded file, so its fee scales with file size — keep a healthy margin so a
large file never eats all the funding and starves the genesis mint.

At `const target = numOutputs * sats + estFee + Math.max(1000, Math.ceil(estFee * 0.1))`:

Margin: 10% of the estimate (absorbs file-encoding overhead on big files) or 1000 sat, whichever larger.

At `const funding = selected.map(u => ({ utxo: u }))`:

★★ ONE NETWORK CALL PER INPUT SAVED, and it is the shape change that removes them. The parent
  transactions were fetched only so the signer could read the script and the amount back out of
  them; both are now passed explicitly, so nothing needs the parents at all. On a mint funded by
  several UTXOs that is several fewer round trips before anything can be signed.

At `const t1 = await buildTemplateTx({ key, funding, template, file, storefront, mockup: params.mocku...`:

Build BOTH transactions offline first. Only broadcast once both succeed, so a failure (e.g.
insufficient change for the genesis mint) never leaves an orphaned template tx on-chain.

At `if (params.confirmSpend != null && !(await params.confirmSpend(spentSats(selected, t2.changeSats)...`:

Spend gate (exact total now known): give the caller a chance to confirm before any sats move.

At `await provider.broadcast(t1.tx.hex(), { awaitSeen: true })`:

Both built — broadcast TX1, wait until it's actually visible in a relay mempool, THEN TX2 (which spends TX1's
change). The awaitSeen gate stops TX2 racing ahead of its unconfirmed parent → "Missing inputs"; it throws
(aborting) if TX1 never surfaces, so there's no orphaned TX2. See walletProvider.awaitInMempool.

## `export { classifyRecord }`

Re-export for convenience at call sites.
