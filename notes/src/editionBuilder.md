# src/editionBuilder.js

PHAR LAP edition-token transaction builder (experimental covenant path).

Editions are the "unlimited mints" covenant tokens (Addendum A), kept SEPARATE from the plain
collectionBuilder so the mainnet-validated plain-token path stays untouched. Three operations:

  GENESIS   — mint edition covenant output(s) from a collection (tx1Ref), funded by the publisher.
  REPLICATE — anyone permissionlessly mints a copy: spends a holder edition UTXO via the replicate
              branch (+ funding) → token back to holder, replica to buyer, publisher fee, holder fee,
              change. No holder signature.
  TRANSFER  — the owner moves the token, re-creating the covenant for a new owner (owner-signed).

The covenant inputs are spent with unlocking-script TEMPLATES: the sighash preimage / owner sig is
built from the finalised transaction at sign time (after `tx.fee()` sets the change output), so
`hashOutputs` always matches. Spend/replicate/transfer txs are version 2 (Chronicle relaxed rules).

Low-level builders are pure/offline (explicit funding) so every input can be Spend-validated without
the network, exactly like collectionBuilder. Network wrappers select funding + broadcast.

## UnlockingScript

```ts
const UnlockingScript = {
```

★ A BOUNDARY, NOT A DUPLICATE. `covenant.ts` hand-assembles chunks whose `data` is `number[]`; the
core script class carries `Uint8Array`. Converting here keeps that conversion in ONE place instead of
scattering `Uint8Array.from` through every unlock. `covenant.ts` has the same shim for locking
scripts, deliberately — see the note there.

## EditionTerms

```ts
export interface EditionTerms {
  /** 20-byte hash160 of the immutable publisher fee address. */
  publisherPubKeyHash: number[]
  publisherFeeSats: number
  holderFeeSats: number
  tokenSats?: number
}
```

Common economic parameters of an edition collection (fixed forever at genesis).

## pubKeyBytes

```ts
function pubKeyBytes(key: Signer): number[]
```

## EditionGenesisResult

```ts
export interface EditionGenesisResult {
  tx: Tx
  txId: string
  editionVouts: number[]
  changeVout: number | null
  changeSats: number
}
```

─── GENESIS ────────────────────────────────────────────────────────

## buildEditionGenesisTx

```ts
export async function buildEditionGenesisTx(opts: {
  key: Signer
  funding: FundingInput[]
  /** Collection id (TX1 txid), hex. Carried as tx1Ref in every edition. */
  tx1Ref: string
  terms: EditionTerms
  /** Owner of the minted editions. Default: the funding key's pubkey. */
  ownerPubKey?: number[]
  mintCount?: number
  feePerKb?: number
}): Promise<EditionGenesisResult>
```

At `const tx = new Tx(2, [], [], 0)`:

⚠ VERSION 2. Not cosmetic: it is what opts the transaction into the restored rules the covenant
needs. A version-1 covenant spend is rejected by consensus, not by policy.

At `const lock = buildEditionLock({`:

⚠ `stateData` IS NOT PASSED, AND THAT IS DELIBERATE. The deployed builder passed one and the field
builder never read it — see the note in `covenant.ts`. Dropping an ignored argument cannot change
a byte, and the byte-identity vectors confirm it.

## otherInputsOf

```ts
const otherInputsOf = (tx: Tx, inputIndex: number) =>
```

─── Covenant unlocks (the preimage is built from the FINALISED transaction) ───

★★★ THE SHAPE CHANGED HERE, AND THE CHANGE IS THE POINT OF THIS PORT. Previously an input carried an
  unlocking-script TEMPLATE — an object the transaction called back into, once to guess the unlock's
  length so the fee could be set, and again to build it for real. Here the unlock is just a function
  the caller invokes, in the open, after the fee is settled.

⚠⚠ THE TWO-PASS DANCE IS STILL REQUIRED, because a covenant unlock CONTAINS the preimage of the very
  transaction it is part of, and the preimage commits to the outputs, one of which is the change the
  fee decides. ⇒ The order is: build outputs → measure the unlock → `applyFee` → build the unlock for
  real. What makes that sound is that the LENGTH does not move: `hashOutputs` is 32 bytes whatever the
  change is, and a serialized output's value is 8 bytes whatever the number. **`assertStableLength`
  below checks that rather than trusting it**, because if it ever stopped being true the fee would be
  wrong and the only symptom would be a transaction that never confirms.

⚠ ANYONECANPAY is not used here, so every other input is committed to.

## covenantPreimage

```ts
const covenantPreimage = (tx: Tx, inputIndex: number, subscript: number[], sourceSatoshis: number, scope: number): number[] =>
```

The covenant sighash preimage for this input — the same bytes the unlock will carry.

## enforcedSliceBytes

```ts
const enforcedSliceBytes = (tx: Tx, enforced: number): number[] =>
```

Serialized bytes of the outputs BEYOND the covenant-enforced ones — the unlock carries them verbatim.

## assertExactLength

```ts
function assertExactLength(sized: number, actual: number, what: string): void
```

⚠⚠⚠ THE INVARIANT THE FEE RESTS ON, AND IT IS NOT THE SAME FOR EVERY UNLOCK.

  | REPLICATE | ⚠ carries NO signature, so its length is EXACT and must not move by a single byte.  |
  | TRANSFER · BURN | ⚠⚠ carry an owner signature, and a DER signature is 70, 71 or 72 bytes
    depending on whether `r` or `s` needs a leading zero. ⇒ Its length is NOT knowable before it
    exists, so it is sized against a maximum and the real one comes out equal or SHORTER.           |

⇒ Hence two checks rather than one. **Over-estimating is safe and under-estimating is not**: a fee
  computed from too small a size produces a transaction that is well-formed, under-paid, and simply
  never confirms — with nothing in it to say why.

## assertNotLonger

```ts
function assertNotLonger(sized: number, actual: number, what: string): void
```

## MAX_SIG_LEN

```ts
const MAX_SIG_LEN = 73
```

⚠ A DER signature plus its sighash byte, at its longest. Sizing against this can only over-pay.

## replicateUnlock

```ts
export function replicateUnlock(tx: Tx, inputIndex: number, opts: {
  buyerPubKey: number[]
  lockBytes: number[]
  sourceSatoshis: number
  enforcedOutputCount?: number
}): Uint8Array
```

REPLICATE — permissionless. No signature at all: the covenant is satisfied by proving the outputs, so
anyone may mint a copy provided they pay the enforced fees.

## transferUnlock

```ts
export function transferUnlock(tx: Tx, inputIndex: number, opts: {
  ownerKey: Signer
  newOwnerPubKey: number[]
  lockBytes: number[]
  sourceSatoshis: number
  enforcedOutputCount?: number
  forSizing?: boolean
}): Uint8Array
```

TRANSFER — owner-signed. Two preimages of the SAME transaction under DIFFERENT sighash scopes: one the
covenant introspects, one the owner signs. ⚠ They are not interchangeable.

At `const ownerSig = opts.forSizing === true`:

⚠ `forSizing` substitutes a maximum-length signature so the fee can be computed before the real one
exists. It must never reach a broadcast transaction — the builders call it once to measure, then
again for real.

## burnUnlock

```ts
export function burnUnlock(tx: Tx, inputIndex: number, opts: {
  ownerKey: Signer
  lockBytes: number[]
  sourceSatoshis: number
  forSizing?: boolean
}): Uint8Array
```

BURN — owner-signed, no outputs enforced: the owner sweeps the bonded satoshis and the token is gone.

## EditionUtxo

```ts
export interface EditionUtxo {
  txId: string
  outputIndex: number
  satoshis: number
  /** The edition locking script bytes (the covenant being spent). */
  lockBytes: number[]
  /* ⛔ `sourceTx` STOOD HERE. Nothing reads it any more — the builders take the outpoint, the value and
     the script, which is everything a BIP-143 signature commits to. ⚠ The callers below still FETCH the
     parent, because that is where the edition's bonded value is read from; they simply no longer carry
     it around afterwards. */
}
```

⚠ SIZING AN OWNER-SIGNED UNLOCK BEFORE THE SIGNATURE EXISTS. A DER signature is 71 or 72 bytes plus the
sighash byte, and which one depends on the value of `s`. ⇒ We sign LOW-S, so `s < N/2`, its top bit is
clear, and DER never pads it — but the r value can still need a pad. Measuring with the REAL signature
is exact and costs one signing operation, so that is what the builders do; there is no placeholder and
no 73-byte worst case to over-pay for.

─── REPLICATE ──────────────────────────────────────────────────────

A spendable edition UTXO (the output being replicated/transferred).

## ReplicateResult

```ts
export interface ReplicateResult {
  tx: Tx
  txId: string
  /** outpoint of the token returned to the holder (verbatim). */
  holderTokenVout: number
  /** outpoint of the buyer's new replica. */
  replicaVout: number
  changeVout: number | null
}
```

## buildReplicateTx

```ts
export async function buildReplicateTx(opts: {
  edition: EditionUtxo
  terms: EditionTerms
  /** Key that SIGNS the funding inputs (the payer). For a gift claim this is the voucher key. */
  buyerKey: Signer
  /** Buyer funding inputs (P2PKH), signed with buyerKey. */
  funding: FundingInput[]
  /** Owner of the replica (decoupled from the payer). Default: the buyerKey's pubkey. A gift claim sets this
   *  to the recipient's wallet so the voucher funds the tx but the recipient owns the copy. */
  ownerPubKey?: number[]
  /** Where change goes. Default: the buyerKey's address. A gift claim sends it to the recipient. */
  changeAddress?: string
  /** Seller's note (promo + optional bonus) to echo onto the sale — hands-off propagation. */
  note?: SellerNote
  feePerKb?: number
}): Promise<ReplicateResult>
```

At `const bond = opts.edition.satoshis`:

The bond rides forward consensus-enforced (VALUE1 = the edition UTXO value) onto out0 (token→holder)
and out1 (replica→buyer). Read it from the UTXO so old (1-sat) and new (bonded) collections both work.

At `tx.inputs.push({ txid: txidToWire(opts.edition.txId), vout: opts.edition.outputIndex, script: new...`:

input 0: the holder's edition UTXO, spent via the permissionless replicate branch

At `tx.outputs.push({ value: bond, script: Uint8Array.from(lockBytes) })`:

Enforced outputs, in the order the covenant requires, then the buyer's change.

At `tx.outputs.push({ value: bond, script: Uint8Array.from(lockBytes) })`:

[0] token → holder, verbatim

At `tx.outputs.push({ value: bond, script: Uint8Array.from(swapEditionOwner(lockBytes, buyerPub)) })`:

[1] replica → buyer

At `tx.outputs.push({ value: opts.terms.publisherFeeSats, script: Uint8Array.from(p2pkhScript(opts.te...`:

[2] publisher fee

At `tx.outputs.push({ value: opts.terms.holderFeeSats, script: Uint8Array.from(p2pkhScript(hash160Byt...`:

[3] holder fee

At `if (opts.note && tx1RefHex != null && noteHasContent(opts.note)) {`:

[4] optional seller-note echo, locked to the buyer. ⚠ A SPENDER-SUPPLIED TRAILING OUTPUT the covenant
appends verbatim — it is outside the enforced region, so carrying it changes no covenant rule. Not
bonded: it is a carrier, not a token.

At `const unlockOpts = { buyerPubKey: buyerPub, lockBytes, sourceSatoshis: bond }`:

⚠⚠ TWO PASSES, AND THE FIRST ONE IS NOT A GUESS. The covenant unlock carries this transaction's own
preimage, so it cannot exist until the outputs do — but the fee needs its size first. Build it once
to measure, apply the fee, then build it again for real, and CHECK the length did not move.

## TransferResult

```ts
export interface TransferResult {
  tx: Tx
  txId: string
  tokenVout: number
  changeVout: number | null
}
```

─── TRANSFER ───────────────────────────────────────────────────────

## buildEditionTransferTx

```ts
export async function buildEditionTransferTx(opts: {
  edition: EditionUtxo
  /** Current owner's key (must match the owner pubkey in the edition script). */
  ownerKey: Signer
  newOwnerPubKey: number[]
  /** Owner funding inputs (P2PKH) for the miner fee, signed with ownerKey. */
  funding: FundingInput[]
  /** Seller-note (promo + optional bonus) to carry to the new owner — hands-off propagation. */
  note?: SellerNote
  tokenSats?: number
  feePerKb?: number
}): Promise<TransferResult>
```

At `const bond = opts.edition.satoshis`:

out0 re-creates the token with the bond preserved (covenant-enforced VALUE1 = the UTXO value).

At `tx.outputs.push({ value: bond, script: Uint8Array.from(swapEditionOwner(lockBytes, opts.newOwnerP...`:

[0] token → new owner

At `tx.outputs.push({ value: 1, script: scriptForAddress(addressFromPubHex(hexOf(opts.newOwnerPubKey)...`:

[1] ⚠ A 1-SATOSHI BREADCRUMB, AND IT IS NOT DECORATION. The edition covenant output is not indexed by
address, so without this the new owner has no way to DISCOVER that they were sent something. It sits
in the covenant's free trailing region, so it costs a satoshi and enforces nothing.

## toFundingInputs

```ts
export async function toFundingInputs(_provider: WalletProvider, utxos: Utxo[]): Promise<FundingInput[]>
```

─── Network wrappers (funding selection + broadcast) ───────────────

At `return utxos.map(u => ({ utxo: u }))`:

⚠ THE PARENT TRANSACTIONS ARE NO LONGER FETCHED. The deployed version pulled one per input, because
the old unlocking template read the amount out of the parent. A BIP-143 signature commits to the
amount directly, so it is passed explicitly and the parent is never consulted — one network round
trip per funding input, gone. ⚠ `provider` is kept in the signature: callers pass it, and the shape
of this helper is not worth churning for one unused argument.

## CreateEditionResult

```ts
export interface CreateEditionResult {
  collectionId: string
  tx1Id: string
  tx2Id: string
  editions: Array<{ txId: string; outputIndex: number; lockHex: string }>
}
```

## createEdition

```ts
export async function createEdition(provider: WalletProvider, key: Signer, params: {
  tokenName: string
  terms: EditionTerms
  mintCount?: number
  ownerPubKey?: number[]
  stateData?: number[]
  /** Optional file embedded (hash-bound) in TX1, viewable by token holders. */
  file?: { mimeType: string; fileName: string; bytes: number[] }
  /** Tier-1 encrypt the embedded file (Addendum F). Requires `file`. */
  encrypt?: boolean
  /** Immutable storefront blurb shown on the collection / sales page (PLAN.md Step 2, D3). */
  description?: string
  /** Optional public (unencrypted) cover image — the storefront's face, shown even when content is encrypted. */
  cover?: { mimeType: string; fileName: string; bytes: number[] }
  /** Optional public BACK cover image (flippable on the sales page). Requires a front `cover`. */
  backCover?: { mimeType: string; fileName: string; bytes: number[] }
  /** Optional IMMUTABLE licence code (fixed at mint, travels with the coin) — template metadata only; the covenant
   *  script is unaffected. e.g. "TS-COM-1", "CC-BY-4.0", "ARR". */
  license?: string
  /** Optional 64-hex txid pointing at the full licence text minted on-chain. */
  licenseRef?: string
  /** Optional packed mockup-cover manifest (mockup.ts packCover) — a TX1 output; the curator composites the
   *  public cover onto the referenced prop. */
  mockupManifest?: number[]
  feePerKb?: number
  /** Spend gate: called with the EXACT total sats to spend, after build and before broadcast. False aborts. */
  confirmSpend?: (totalSats: number) => boolean | Promise<boolean>
}): Promise<CreateEditionResult>
```

Create an edition collection on-chain: TX1 template (commits name, replicable rules, and the covenant
template with a zeroed tx1Ref/owner for later verification) + TX2 that mints the edition covenant
outputs referencing TX1. Mirrors collectionBuilder.createCollection's funding/broadcast pattern.

At `const templateLock = buildEditionLock({`:

Covenant template committed in TX1: structurally identical to an edition but with identity zeroed.

At `const encrypt = params.encrypt === true && params.file != null`:

Smart-compress (keep only if smaller), then optionally Tier-1 encrypt. Order matters: compress BEFORE
encrypt (ciphertext is incompressible). The FILE output stores the final bytes; fileHash binds them.

At `storedBytes = await encryptContent(storedBytes, K)`:

⚠⚠ AWAITED, AND THE DEPLOYED CALLS WERE NOT. These now go through the browser's own AES-GCM,
which is async. Without the await, `storedBytes` becomes a PROMISE — and a Promise serializes
into the file output as garbage rather than failing, so the mint would succeed and the content
would be unreadable forever. Caught by type-checking, not by running it.

At `tokenRules: encodeTokenRules(0, 0, restrictions, 1),`:

supply 0 = unlimited / replicable

At `fileHash: params.file == null ? undefined : encrypt ? sha256Hex(storedBytes) : sha256Hex(params.f...`:

fileHash semantics: PUBLIC content binds the ORIGINAL plaintext (provenance — a verifier decompresses
the on-chain blob and matches H(plaintext); DEFLATE decompression is deterministic so the proof is
independent of the non-reproducible gzip encoding). ENCRYPTED content binds the ciphertext (privacy —
a public plaintext hash would be a confirmation oracle).

At `const hasStorefront = (params.description != null && params.description.length > 0) || params.cov...`:

Immutable storefront record (description + optional public cover image), carried as a TX1 output.

At `backCoverMimeType: params.cover != null ? params.backCover?.mimeType : undefined,`:

A back cover only makes sense alongside a front cover (the codec keys "has back" off the bytes).

At `const editionBytes = 800`:

Fund both txs. TX1 carries any embedded file + cover, so its fee scales with their size; keep a healthy margin.

At `const tx1Bytes = 500 + templateLock.toBinary().length`:

⚠ Every byte TX1 carries must be in this estimate, or the coins selected fall short of the fee the build
then computes. The back cover and the mockup manifest ride in TX1's storefront and mockup outputs and
were missing here; a 200 KB back cover selected one coin and the build asked for 25,684 sat.

At `const t1 = await buildTemplateTx({ key, funding, template, file, storefront, mockup: params.mocku...`:

Build both offline, broadcast only if both succeed (no orphaned template).

At `await provider.broadcast(t1.tx.hex(), { awaitSeen: true })`:

Gate: block until TX1 is actually in a relay mempool before broadcasting TX2 (which spends TX1's change),
so TX2 can't race ahead of its unconfirmed parent → "Missing inputs". Throws (aborting the mint) if TX1
never surfaces, leaving no orphaned TX2. See walletProvider.awaitInMempool.

## replicateEdition

```ts
export async function replicateEdition(provider: WalletProvider, buyerKey: Signer, params: {
  editionTxId: string
  editionOutputIndex: number
  editionLockHex: string
  terms: EditionTerms
  /** Seller's note (promo + optional bonus) to echo onto the buyer's copy (hands-off propagation). */
  note?: SellerNote
  feePerKb?: number
  /** Spend gate: called with the EXACT total sats to spend, after build and before broadcast. False aborts. */
  confirmSpend?: (totalSats: number) => boolean | Promise<boolean>
}): Promise<{ txId: string; replicaOutpoint: { txId: string; outputIndex: number }; lockHex: string }>
```

Replicate (permissionlessly mint a copy of) an on-chain edition. The caller is the buyer.

At `const bond = sourceTx.outputs[params.editionOutputIndex]?.value ?? PHARLAP_OUTPUT_SATS`:

the edition's enforced bond

At `const noteSats = params.note ? PHARLAP_OUTPUT_SATS : 0`:

Buyer funds: the replica's bond (out1), both fees, the optional note carrier, miner fee, margin. The
holder's returned token (out0) rides forward from the spent edition input.

## deriveVoucherKey

```ts
export function deriveVoucherKey(publisherKey: Signer, tx1RefHex: string, index: number): Signer
```

─── Covenant v2 network wrappers (Addendum G) ──────────────────────

─── Free-gift vouchers (publisher pre-funds claims; recipients claim for ~a miner fee) ──────────

Deterministic voucher key from the publisher's private key + collection + index. Because it uses the
publisher's PRIVATE key, only they can regenerate the batch — so gift links (and any unclaimed funds) are
always recoverable from the publisher's WIF + chain, with no separate backup. (The WIF is meant to be
handed out in the link anyway; the one-way hash never leaks the publisher's key.)

At `const seed = [...Array.from(beBytes(publisherKey.d, 32)), ...hexBytes(tx1RefHex), ...idx]`:

⚠⚠⚠ BYTE-IDENTICAL DERIVATION IS A HARD REQUIREMENT, NOT A PREFERENCE. Vouchers already handed out
were derived by the deployed wallet; if this produces a different key the publisher cannot sweep an
unclaimed voucher and the recipient cannot claim it. The seed is the private key as 32 big-endian
bytes, then the collection id, then the index as 4 little-endian bytes — unchanged.

## createGiftVouchers

```ts
export async function createGiftVouchers(provider: WalletProvider, publisherKey: Signer, params: {
  tx1RefHex: string
  startIndex: number
  count: number
  fundEachSats: number
  feePerKb?: number
}): Promise<{ fundingTxId: string; voucherWifs: string[] }>
```

Publisher: mint `count` funded voucher outputs in ONE tx, each holding `fundEachSats`, using DETERMINISTIC
keys derived at `startIndex..startIndex+count-1` (so they're recoverable from the publisher's key). Returns
the funding txid + the voucher WIFs (the app turns each into a `&g=` claim link).

## GiftVoucherScan

```ts
export interface GiftVoucherScan {
  /** First never-funded index — where the next batch starts. */
  nextIndex: number
  /** Funded + unspent vouchers = live, unclaimed links (with their WIF, to rebuild the link). */
  live: Array<{ index: number; wif: string }>
  /** Funded but already spent = claimed. */
  claimedCount: number
}
```

## scanGiftVouchers

```ts
export async function scanGiftVouchers(
  provider: WalletProvider, publisherKey: Signer, tx1RefHex: string, opts?: { gapLimit?: number; max?: number },
): Promise<GiftVoucherScan>
```

Recover a collection's gift vouchers from the publisher's key alone: regenerate the deterministic keys and
gap-scan the chain. Funded-and-unspent = a live unclaimed link; funded-and-spent = claimed; never funded =
the end of the batch. No local state needed — pure recover-from-WIF + chain.

At `let unspent = []`:

Check the MEMPOOL-AWARE unspent set first — a just-funded (unconfirmed) live voucher appears here but
NOT in confirmed-only getAddressHistory. If it's unspent → live. If not, it may be funded-then-claimed,
so fall back to history (confirmed) + recent (mempool) to keep the gap scan from bailing early.

At `try { unspent = await provider.getUnspentByScriptHash(wocScriptHash(script)) } catch {`:

best-effort

At `try { funded = (await provider.getAddressHistory(k.address())).length > 0 } catch {`:

best-effort

At `if (!funded) { try { funded = (await provider.getRecentTxIdsForAddress(k.address())).length > 0 }...`:

best-effort

## scanVoucherHashes

```ts
export async function scanVoucherHashes(
  provider: WalletProvider, publisherKey: Signer, tx1RefHex: string, opts?: { gapLimit?: number; max?: number },
): Promise<Set<string>>
```

Derive the FUNDED gift-voucher pubkey-hashes (hex, lowercase) for a collection — the same gap-scan as
 scanGiftVouchers, but returns the address hashes (any spend state) so a sale can be matched back to a gift
 claim: a claim is funded by its voucher UTXO, so a sale whose funding key hashes into this set was gifted.
 This is what makes gift counting EXACT (a swept/reclaimed voucher never funds a sale, so it isn't counted).

At `try { funded = (await provider.getUnspentByScriptHash(wocScriptHash(p2pkhScript(pkh)))).length > ...`:

try history

At `try { funded = (await provider.getAddressHistory(k.address())).length > 0 } catch {`:

try recent

At `if (!funded) { try { funded = (await provider.getRecentTxIdsForAddress(k.address())).length > 0 }...`:

unknown → treat as empty

## sweepGiftVouchers

```ts
export async function sweepGiftVouchers(
  provider: WalletProvider, publisherKey: Signer, live: Array<{ wif: string }>, opts?: { feePerKb?: number },
): Promise<{ swept: number; reclaimedSats: number; txId: string } | null>
```

Publisher: reclaim UNCLAIMED gift vouchers — sweep each live voucher's funding back to your wallet in one
tx (invalidating those links). Pass the `live` list from scanGiftVouchers (each carries its voucher WIF).
Already-claimed gifts have no unspent funding, so they're untouched. Returns null if nothing to reclaim.

At `const tx = new Tx(1, [], [], 0)`:

⚠⚠ EVERY INPUT HERE IS SIGNED BY A DIFFERENT KEY — one per unclaimed voucher — so `signFunding`,
which signs a whole run with one signer, does not apply. Each input is signed on its own below,
against ITS OWN key and ITS OWN amount. ⚠ Getting either wrong produces a transaction that looks
complete and is refused by the network for a bad script.

At `tx.outputs.push({ value: 0, script: publisherKey.lockingScript() })`:

everything back to you, minus the fee

## claimGiftEdition

```ts
export async function claimGiftEdition(provider: WalletProvider, ownerKey: Signer, params: {
  giftWif: string
  editionTxId: string
  editionOutputIndex: number
  editionLockHex: string
  editionSourceTx?: Tx
  note?: SellerNote
  feePerKb?: number
}): Promise<{ txId: string; replicaOutpoint: { txId: string; outputIndex: number }; lockHex: string }>
```

Recipient: claim a gift edition with a funded voucher key. The voucher signs the funding (pays the fee +
price), but the replica is owned by `ownerKey` (the recipient's own wallet) and change tops them up.
Works for a brand-new OR existing wallet. Throws if the voucher has already been spent (single-use).

At `let rep`:

⚠ THIS USED TO BRANCH ON THE COVENANT VERSION. There is one version, so there is one path.

## transferEdition

```ts
export async function transferEdition(provider: WalletProvider, ownerKey: Signer, params: {
  editionTxId: string
  editionOutputIndex: number
  editionLockHex: string
  newOwnerPubKey: number[]
  /** Seller-note (promo + optional bonus) to carry to the new owner (hands-off propagation). */
  note?: SellerNote
  tokenSats?: number
  feePerKb?: number
}): Promise<{ txId: string; tokenOutpoint: { txId: string; outputIndex: number }; lockHex: string }>
```

Transfer (owner-signed) an on-chain edition to a new owner, re-creating the covenant.

At `const noteSats = params.note ? PHARLAP_OUTPUT_SATS : 0`:

The bond rides forward from the spent input onto out0, so funding only covers the note carrier + fee + margin.

## buildEditionBurnTx

```ts
export async function buildEditionBurnTx(opts: {
  edition: EditionUtxo
  ownerKey: Signer
  reclaimAddress?: string
  feePerKb?: number
}): Promise<{ tx: Tx; txId: string; reclaimVout: number; reclaimSats: number }>
```

─── BURN (reclaim the bond, destroy the token) ─────────────────────

Build an owner-signed burn tx: spend the bonded edition UTXO via the burn branch, sweeping its sats
 (minus the network fee) to the owner's address. The covenant re-creates NO output — the token is gone.

At `tx.outputs.push({ value: 0, script: scriptForAddress(reclaimAddress) })`:

the bond, less the fee, back to the owner

At `const unlockOpts = { ownerKey: opts.ownerKey, lockBytes, sourceSatoshis: opts.edition.satoshis }`:

⚠ THE ONLY INPUT IS THE COVENANT ITSELF — a burn is funded by the bond it releases. So the fee comes
out of the reclaimed amount, and if the bond cannot cover it `applyFee` is the thing that must say
so rather than emitting a negative output.

## burnEdition

```ts
export async function burnEdition(provider: WalletProvider, ownerKey: Signer, params: {
  editionTxId: string
  editionOutputIndex: number
  editionLockHex: string
  feePerKb?: number
}): Promise<{ txId: string; reclaimSats: number }>
```

Burn (destroy) an edition you own and reclaim its bonded sats. Owner-signed; works only on burn-capable
 (bonded) editions — use `editionSupportsBurn` to check before offering it.

## wocScriptHash

```ts
export function wocScriptHash(scriptBytes: number[]): string
```

WoC script hash for an output: SHA-256(scriptBytes) byte-reversed (Electrum/WoC convention).

## ResolvedEdition

```ts
export interface ResolvedEdition {
  txId: string
  outputIndex: number
  /** The exact edition locking script (hex) — feeds straight into replicateEdition. */
  lockHex: string
  terms: EditionTerms
  tokenSats: number
}
```

## resolveHolderEdition

```ts
export async function resolveHolderEdition(provider: WalletProvider, params: {
  tx1RefHex: string
  holderPubKeyHex: string
  /** The collection's covenant template bytes (hex) — TX1 template.covenantScript. */
  templateCovenantHex: string
}): Promise<ResolvedEdition | null>
```

Resolve a holder's CURRENT spendable edition of a collection, given the collection's covenant template
(from TX1) and the holder's pubkey — the "sales link" tip resolution (PLAN.md Step 2, D2).

The holder's edition script is deterministic (buildHolderEditionScript: template + tx1Ref + owner), so
we derive it and ask WoC for its unspent UTXO(s) by script hash — no address-history walk. Returns the
tip to replicate from, or null if the holder currently holds no edition of this collection.

At `const pick = unspent.find(u => u.satoshis > 0) ?? unspent[0]`:

Any unspent edition of this holder is an interchangeable sale source; prefer a confirmed one.

## IncomingEdition

```ts
export interface IncomingEdition {
  txId: string
  outputIndex: number
  lockHex: string
  tx1RefHex: string
  terms: EditionTerms
  /** Seller-note (promo + optional bonus) that rode in on the carrying tx (on-chain echo), if any. */
  sellerNote?: SellerNote
  /** Block height of the acquiring tx (0/undefined = unconfirmed) — for ordering recovered holdings. */
  height?: number
}
```

## scanIncomingEditions

```ts
export async function scanIncomingEditions(
  provider: WalletProvider, pubKeyHex: string,
  /** Incremental cache (curator): seed `scripts` from a prior run and skip re-fetching candidates CONFIRMED at or
   *  below `sinceHeight` (their edition scripts are already known). Unconfirmed (height 0) + anything above the
   *  watermark are always re-scanned, so a fresh onboard is never missed. `scripts` is mutated with new discoveries
   *  for the caller to persist. Pass 2 (below) still runs over ALL scripts every time, so live holdings stay exact. */
  cache?: { scripts: Map<string, string>; sinceHeight: number },
  /** Transactions to read whatever the history says: the wallet's marker backup. Always read, never skipped. */
  extraTxIds: string[] = [],
): Promise<IncomingEdition[]>
```

Find the edition covenant outputs CURRENTLY held by `pubKeyHex` (unspent). Two passes:
  1) Discover which collections this pubkey has held, by scanning the wallet's address history (the
     change / notification breadcrumbs land there) for edition outputs locked to it.
  2) For each distinct edition script (one per collection+owner, deterministic), ask WoC for its current
     UNSPENT outputs by script hash — so editions already sold/transferred away are excluded.
This makes the result a true snapshot of live holdings, which is what both "check incoming" and
recover-from-WIF need (the local store is a rebuildable cache; the chain is the source of truth).
Terms come from the covenant script itself, and any seller-note that rode in is read from each tx.

At `const cand = new Map(extraTxIds.map(id => [id, 0]))`:

Pass 1 — discover distinct edition scripts (lockHex) this pubkey holds/held, from address breadcrumbs.

At `const cand = new Map(extraTxIds.map(id => [id, 0]))`:

txId -> height (0 = unconfirmed/unknown)

At `try { for (const e of await provider.getFullAddressHistory()) cand.set(e.txId, e.blockHeight || 0...`:

best-effort

At `try { for (const u of await provider.getUtxos()) if (!cand.has(u.txId)) cand.set(u.txId, u.height...`:

best-effort

At `const scripts = new Map(cache?.scripts ?? [])`:

lockHex -> tx1RefHex (seeded from cache)

At `const alwaysRead = new Set(extraTxIds)`:

⚠ The history gives a height to every transaction it lists, the backup's included, so the watermark below
  would skip a backup transaction as "already discovered" when this list has never seen it.

At `const spentByRead = new Set()`:

Every output a transaction read here spends: never a live holding, whatever an unspent list says.

At `if (!alwaysRead.has(txId) && since >= 0 && h > 0 && h <= since) continue`:

confirmed at/below the watermark — already discovered

At `if (cache) for (const [k, v] of scripts) cache.scripts.set(k, v)`:

persist merged discoveries

At `const found = []`:

Pass 2 — for each distinct script, the current UNSPENT outputs are the live holdings (mempool-aware).
Asked in bulk when the provider can, 20 scripts to a request; it re-asks one at a time wherever a bulk
answer may be cut short or may still list an output spent in the mempool.

At `try { note = readNoteFromTx(await provider.getSourceTransaction(u.txId), tx1RefHex) } catch {`:

best-effort

## BuyerRecord

```ts
export interface BuyerRecord {
  /** The buyer's full public key (hex) — owner of the replica that was minted to them. */
  pubKeyHex: string
  /** How many copies this buyer replicated (separate sales to the same key). */
  count: number
  /** Block heights of their first and most-recent purchase (0 = unconfirmed/unknown). */
  firstHeight: number
  lastHeight: number
}
```

## scanCollectionBuyers

```ts
export async function scanCollectionBuyers(
  provider: WalletProvider,
  params: { collectionId: string; publisherPubKeyHashHex: string; maxTxs?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ buyers: BuyerRecord[]; scanned: number; capped: boolean }>
```

List the buyers of a collection you publish — everyone a replica was minted TO, **at point of sale**.
Every replication pays your publisher fee to your address, so each sale lands in your address history;
the buyer's full pubkey is the owner of the replica output (`out[1]`). A replication puts an edition there;
a transfer puts a 1-sat P2PKH notification, so reading `out[1]` as an edition naturally selects sales only.

HONEST LIMIT: this captures buyers at the moment they replicated, NOT onward transfers (those are
owner-signed, free, and never touch your address) — so it is "buyers", not guaranteed "current holders".
Your own genesis/self copies are excluded (their owner hashes to your publisher key).

At `const candidates = new Map()`:

Candidate txs = confirmed history (most-recent `cap`) UNIONED with the mempool-aware UTXO set. The union
matters: getAddressHistory() is confirmed-only, so an UNCONFIRMED sale would be invisible until mined —
but its publisher-fee output sits in our unspent set, so getUtxos() surfaces it immediately.

At `const candidates = new Map()`:

txId -> blockHeight (0 = unconfirmed/unknown)

At `} catch {`:

best-effort

At `} catch {`:

best-effort

At `if (hexOf(hash160Bytes(buyerBytes)).toLowerCase() === want) continue`:

skip your own genesis/self copies

At `const buyers = [...byBuyer.values()].sort((a, b) => (b.lastHeight || Infinity) - (a.lastHeight ||...`:

newest/unconfirmed first

## SalesGroup

```ts
export interface SalesGroup {
  collectionId: string
  /** Total replications (sum of buyer purchase counts). */
  sales: number
  /** Sats you earned from this group (publisher fees as creator, holder fees as reseller). */
  earnings: number
  /** Unique buyers, newest-first. */
  buyers: BuyerRecord[]
}
```

## SaleEvent

```ts
export interface SaleEvent {
  collectionId: string
  role: 'creator' | 'reseller'
  /** Sats you earned on this sale (the fee output paid to you). */
  feeSats: number
  /** Block height of the sale (0 = unconfirmed/unknown). */
  height: number
  buyerPubKeyHex: string
}
```

One sale you were paid on, for time-bucketed stats.

## UnifiedSale

```ts
export interface UnifiedSale {
  txId: string
  collectionId: string
  /** The buyer's public key (owner of the replica minted to them). */
  buyerPubKeyHex: string
  height: number
  /** Block time (unix seconds); 0 if unconfirmed or unknown. */
  time: number
  /** Publisher fee you earned on this sale (>0 only if you publish this collection). */
  publisherFeeSats: number
  /** Holder fee you earned on this sale (>0 only if you were the cloning source). */
  holderFeeSats: number
  /** True once verified this sale was funded by one of your gift vouchers (a claimed gift, not a paid buy). */
  isGift?: boolean
}
```

One row per actual sale transaction (de-duplicated across roles) — the honest per-sale view.

## MySales

```ts
export interface MySales {
  /** One row per real sale (each transaction once), with the fees you earned — the de-duplicated truth. */
  sales: UnifiedSale[]
  /** Collections you PUBLISH — every sale across the whole tree (you earn the publisher fee on each). */
  asCreator: SalesGroup[]
  /** Items where YOU were the cloning source — your direct buyers (you earned the holder fee). */
  asReseller: SalesGroup[]
  /** Flat per-sale list (both roles) for time-bucketed statistics. */
  events: SaleEvent[]
  scanned: number
  capped: boolean
}
```

## scanMySales

```ts
export async function scanMySales(
  provider: WalletProvider,
  /** `sinceHeight` (curator, incremental): skip candidates CONFIRMED at or below it — return only NEW/unconfirmed
   *  sales, which the caller accumulates idempotently by txId. Unconfirmed (height 0) are always included. */
  params: { myPubKeyHex: string; myHash: string; maxTxs?: number; sinceHeight?: number; onProgress?: (done: number, total: number) => void },
): Promise<MySales>
```

One pass over YOUR address history → your whole sales picture. Every replication pays the publisher fee to
the publisher and the holder fee to the source (returning their token on out[0]), so a single scan of your
address surfaces both roles: sales of collections you publish (publisherHash == you) and resales where you
were the source (out[0] owner == you). Grouped per collection, buyers deduped with counts.

Honest limit (as elsewhere): buyers at point of sale; onward transfers aren't visible. Capped to the most
recent `maxTxs` history txs (unioned with the mempool-aware UTXO set so unconfirmed sales show immediately).

At `} catch {`:

best-effort

At `try { for (const u of await provider.getUtxos()) if (!candidates.has(u.txId)) candidates.set(u.tx...`:

best-effort

At `const entries = [...candidates.entries()].filter(([, h]) => !(since >= 0 && h > 0 && h <= since))`:

Incremental: drop candidates confirmed at/below the watermark (already counted); keep unconfirmed + newer.

At `const OUT_CAP = 256 * 1024`:

── Pass 1: find sales cheaply. A sale = a replicate tx; the replica is out[1], the source edition is out[0].
We only ever fetch those two SMALL outputs (capped) — NEVER the content output [2], which can be tens of MB
(a mint's TX1 sits in the publisher's own history). Fees come from the edition's covenant-committed terms,
which the miners enforce to equal the paid out[2]/out[3] amounts — so no need to read output satoshis.

At `if (hex1 == null || hex1 === 'oversized') continue`:

no replica at out[1] (or it's too big to be one) → not a sale

At `if (hexOf(hash160Bytes(hexBytes(buyerHex))).toLowerCase() === publisherHash) continue`:

genesis/self

At `} catch {`:

out[0] unreadable — treat as not-my-source

At `if (!iPublish && !iSourced) continue`:

a sale, but none of the fees came to me

At `await Promise.all(sales.map(async s => { try { const c = await provider.getTxConfirmation(s.txId)...`:

── Pass 2: date each sale (block time). Only the sale txs — a handful — not every candidate.

At `await Promise.all(sales.map(async s => { try { const c = await provider.getTxConfirmation(s.txId)...`:

date best-effort

At `const creator = new Map()`:

── Derive the role groups (backward-compat: the curator + stats read these) from the de-duplicated sales.
