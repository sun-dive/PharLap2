// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP edition-token transaction builder (experimental covenant path).
 *
 * Editions are the "unlimited mints" covenant tokens (Addendum A), kept SEPARATE from the plain
 * collectionBuilder so the mainnet-validated plain-token path stays untouched. Three operations:
 *
 *   GENESIS   — mint edition covenant output(s) from a collection (tx1Ref), funded by the publisher.
 *   REPLICATE — anyone permissionlessly mints a copy: spends a holder edition UTXO via the replicate
 *               branch (+ funding) → token back to holder, replica to buyer, publisher fee, holder fee,
 *               change. No holder signature.
 *   TRANSFER  — the owner moves the token, re-creating the covenant for a new owner (owner-signed).
 *
 * The covenant inputs are spent with unlocking-script TEMPLATES: the sighash preimage / owner sig is
 * built from the finalised transaction at sign time (after `tx.fee()` sets the change output), so
 * `hashOutputs` always matches. Spend/replicate/transfer txs are version 2 (Chronicle relaxed rules).
 *
 * Low-level builders are pure/offline (explicit funding) so every input can be Spend-validated without
 * the network, exactly like collectionBuilder. Network wrappers select funding + broadcast.
 */
import { Tx } from '../impl/js/transaction.mjs'
import { preimage, SIGHASH } from '../impl/js/transaction.mjs'
import { LockingScript, UnlockingScript as CoreUnlockingScript } from '../impl/js/script.mjs'

/* ★ A BOUNDARY, NOT A DUPLICATE. `covenant.ts` hand-assembles chunks whose `data` is `number[]`; the
   core script class carries `Uint8Array`. Converting here keeps that conversion in ONE place instead of
   scattering `Uint8Array.from` through every unlock. `covenant.ts` has the same shim for locking
   scripts, deliberately — see the note there. */
const UnlockingScript = {
  from: (chunks: Array<{ op: number; data?: number[] }>) =>
    new CoreUnlockingScript(chunks.map(c => ({ op: c.op, data: c.data === undefined ? undefined : Uint8Array.from(c.data) }))),
}
import { applyFee } from '../impl/js/coins.mjs'
import { toHex, fromHex } from '../impl/js/bytes.mjs'
import { hexBytes, hexOf, sha256Bytes, hash160Bytes, addressFromPubHex } from './bytes.ts'
import { beBytes } from '../impl/js/bytes.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { Signer, txidToWire } from '../impl/js/signer.mjs'
import {
  buildEditionLock, swapEditionOwner, editionOwnerPubKey, p2pkhScript, serializeOutput,
  editionReplicateUnlockChunks, editionTransferUnlockChunks, editionBurnUnlockChunks, EDITION_SCOPE, parseEditionScript,
  buildHolderEditionScript, type ParsedEdition,
} from './covenant.ts'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, buildTemplateTx, sha256Hex,
  SPEND_CANCELLED, spentSats, addFunding, signFunding, UNLOCK_P2PKH, type FundingInput,
} from './collectionBuilder.ts'
import { encodeTokenRules, buildNoteScript, RESTRICTION_REPLICABLE, RESTRICTION_ENCRYPTED, RESTRICTION_COMPRESSED } from './tokenCodec.ts'
import { compressIfSmaller } from './compress.ts'
import { readNoteFromTx, noteHasContent, type SellerNote } from './sellerNote.ts'
import { newContentKey, newKeySalt, encryptContent, wrapContentKey } from './contentCrypto.ts'
import type { WalletProvider, Utxo } from './walletProvider.ts'

/** Common economic parameters of an edition collection (fixed forever at genesis). */
export interface EditionTerms {
  /** 20-byte hash160 of the immutable publisher fee address. */
  publisherPubKeyHash: number[]
  publisherFeeSats: number
  holderFeeSats: number
  tokenSats?: number
}

function pubKeyBytes(key: Signer): number[] {
  return Array.from(key.publicKey())
}

// ─── GENESIS ────────────────────────────────────────────────────────

export interface EditionGenesisResult {
  tx: Tx
  txId: string
  editionVouts: number[]
  changeVout: number | null
  changeSats: number
}

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
}): Promise<EditionGenesisResult> {
  const tokenSats = opts.terms.tokenSats ?? PHARLAP_OUTPUT_SATS
  const ownerPub = opts.ownerPubKey ?? pubKeyBytes(opts.key)
  const tx1Ref = hexBytes(opts.tx1Ref)
  if (tx1Ref.length !== 32) throw new Error('buildEditionGenesisTx: tx1Ref must be a 32-byte txid hex')

  /* ⚠ VERSION 2. Not cosmetic: it is what opts the transaction into the restored rules the covenant
     needs. A version-1 covenant spend is rejected by consensus, not by policy. */
  const tx = new Tx(2, [], [], 0)
  addFunding(tx, opts.funding)

  const editionVouts: number[] = []
  for (let i = 0; i < (opts.mintCount ?? 1); i++) {
    /* ⚠ `stateData` IS NOT PASSED, AND THAT IS DELIBERATE. The deployed builder passed one and the field
       builder never read it — see the note in `covenant.ts`. Dropping an ignored argument cannot change
       a byte, and the byte-identity vectors confirm it. */
    const lock = buildEditionLock({
      tx1Ref, ownerPubKey: ownerPub,
      publisherPubKeyHash: opts.terms.publisherPubKeyHash, publisherFeeSats: opts.terms.publisherFeeSats,
      holderFeeSats: opts.terms.holderFeeSats, tokenSats,
    })
    editionVouts.push(tx.outputs.length)
    tx.outputs.push({ value: tokenSats, script: Uint8Array.from(lock.toBinary()) })
  }

  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: opts.key.lockingScript() })
  applyFee(tx, {
    inputValues: opts.funding.map(f => f.utxo.satoshis),
    unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
    changeVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  signFunding(tx, opts.key, opts.funding)

  const changeSats = tx.outputs[changeVout]?.value ?? 0
  return { tx, txId: tx.txid(), editionVouts, changeVout: changeSats > 0 ? changeVout : null, changeSats }
}



// ─── Covenant unlocks (the preimage is built from the FINALISED transaction) ───
//
// ★★★ THE SHAPE CHANGED HERE, AND THE CHANGE IS THE POINT OF THIS PORT. Previously an input carried an
//   unlocking-script TEMPLATE — an object the transaction called back into, once to guess the unlock's
//   length so the fee could be set, and again to build it for real. Here the unlock is just a function
//   the caller invokes, in the open, after the fee is settled.
//
// ⚠⚠ THE TWO-PASS DANCE IS STILL REQUIRED, because a covenant unlock CONTAINS the preimage of the very
//   transaction it is part of, and the preimage commits to the outputs, one of which is the change the
//   fee decides. ⇒ The order is: build outputs → measure the unlock → `applyFee` → build the unlock for
//   real. What makes that sound is that the LENGTH does not move: `hashOutputs` is 32 bytes whatever the
//   change is, and a serialized output's value is 8 bytes whatever the number. **`assertStableLength`
//   below checks that rather than trusting it**, because if it ever stopped being true the fee would be
//   wrong and the only symptom would be a transaction that never confirms.

/** ⚠ ANYONECANPAY is not used here, so every other input is committed to. */
const otherInputsOf = (tx: Tx, inputIndex: number) => tx.inputs.filter((_, i) => i !== inputIndex)

/** The covenant sighash preimage for this input — the same bytes the unlock will carry. */
const covenantPreimage = (tx: Tx, inputIndex: number, subscript: number[], sourceSatoshis: number, scope: number): number[] =>
  Array.from(preimage(tx, inputIndex, Uint8Array.from(subscript), sourceSatoshis, scope))

/** Serialized bytes of the outputs BEYOND the covenant-enforced ones — the unlock carries them verbatim. */
const enforcedSliceBytes = (tx: Tx, enforced: number): number[] =>
  tx.outputs.slice(enforced).flatMap(o => serializeOutput(o.value, Array.from(o.script)))

/**
 * ⚠⚠⚠ THE INVARIANT THE FEE RESTS ON, AND IT IS NOT THE SAME FOR EVERY UNLOCK.
 *
 *   | REPLICATE | ⚠ carries NO signature, so its length is EXACT and must not move by a single byte.  |
 *   | TRANSFER · BURN | ⚠⚠ carry an owner signature, and a DER signature is 70, 71 or 72 bytes
 *     depending on whether `r` or `s` needs a leading zero. ⇒ Its length is NOT knowable before it
 *     exists, so it is sized against a maximum and the real one comes out equal or SHORTER.           |
 *
 * ⇒ Hence two checks rather than one. **Over-estimating is safe and under-estimating is not**: a fee
 *   computed from too small a size produces a transaction that is well-formed, under-paid, and simply
 *   never confirms — with nothing in it to say why.

 */
function assertExactLength(sized: number, actual: number, what: string): void {
  if (sized !== actual) {
    throw new Error(`${what}: unlock length moved between fee and signing (${sized} → ${actual}) — the fee would be wrong`)
  }
}
function assertNotLonger(sized: number, actual: number, what: string): void {
  if (actual > sized) {
    throw new Error(`${what}: unlock came out LONGER than the fee allowed for (${sized} → ${actual}) — the fee is short`)
  }
}

/** ⚠ A DER signature plus its sighash byte, at its longest. Sizing against this can only over-pay. */
const MAX_SIG_LEN = 73

/**
 * REPLICATE — permissionless. No signature at all: the covenant is satisfied by proving the outputs, so
 * anyone may mint a copy provided they pay the enforced fees.
 */
export function replicateUnlock(tx: Tx, inputIndex: number, opts: {
  buyerPubKey: number[]
  lockBytes: number[]
  sourceSatoshis: number
  enforcedOutputCount?: number
}): Uint8Array {
  const pre = covenantPreimage(tx, inputIndex, opts.lockBytes, opts.sourceSatoshis, EDITION_SCOPE)
  const buyerChange = enforcedSliceBytes(tx, opts.enforcedOutputCount ?? 4)
  return UnlockingScript.from(editionReplicateUnlockChunks({ buyerPubKey: opts.buyerPubKey, buyerChange, preimage: pre })).toBinary()
}

/**
 * TRANSFER — owner-signed. Two preimages of the SAME transaction under DIFFERENT sighash scopes: one the
 * covenant introspects, one the owner signs. ⚠ They are not interchangeable.
 */
export function transferUnlock(tx: Tx, inputIndex: number, opts: {
  ownerKey: Signer
  newOwnerPubKey: number[]
  lockBytes: number[]
  sourceSatoshis: number
  enforcedOutputCount?: number
  forSizing?: boolean
}): Uint8Array {
  const introspection = covenantPreimage(tx, inputIndex, opts.lockBytes, opts.sourceSatoshis, EDITION_SCOPE)
  /* ⚠ `forSizing` substitutes a maximum-length signature so the fee can be computed before the real one
     exists. It must never reach a broadcast transaction — the builders call it once to measure, then
     again for real. */
  const ownerSig = opts.forSizing === true
    ? new Array(MAX_SIG_LEN).fill(0)
    : Array.from(opts.ownerKey.signInput(tx, inputIndex, Uint8Array.from(opts.lockBytes), opts.sourceSatoshis, SIGHASH.ALL_FORKID))
  const change = enforcedSliceBytes(tx, opts.enforcedOutputCount ?? 1)
  return UnlockingScript.from(editionTransferUnlockChunks({
    newOwnerPubKey: opts.newOwnerPubKey, ownerSig, change, preimage: introspection,
  })).toBinary()
}

/** BURN — owner-signed, no outputs enforced: the owner sweeps the bonded satoshis and the token is gone. */
export function burnUnlock(tx: Tx, inputIndex: number, opts: {
  ownerKey: Signer
  lockBytes: number[]
  sourceSatoshis: number
  forSizing?: boolean
}): Uint8Array {
  const introspection = covenantPreimage(tx, inputIndex, opts.lockBytes, opts.sourceSatoshis, EDITION_SCOPE)
  const ownerSig = opts.forSizing === true
    ? new Array(MAX_SIG_LEN).fill(0)
    : Array.from(opts.ownerKey.signInput(tx, inputIndex, Uint8Array.from(opts.lockBytes), opts.sourceSatoshis, SIGHASH.ALL_FORKID))
  return UnlockingScript.from(editionBurnUnlockChunks({ ownerSig, preimage: introspection })).toBinary()
}

/* ⚠ SIZING AN OWNER-SIGNED UNLOCK BEFORE THE SIGNATURE EXISTS. A DER signature is 71 or 72 bytes plus the
   sighash byte, and which one depends on the value of `s`. ⇒ We sign LOW-S, so `s < N/2`, its top bit is
   clear, and DER never pads it — but the r value can still need a pad. Measuring with the REAL signature
   is exact and costs one signing operation, so that is what the builders do; there is no placeholder and
   no 73-byte worst case to over-pay for. */

// ─── REPLICATE ──────────────────────────────────────────────────────

/** A spendable edition UTXO (the output being replicated/transferred). */
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

export interface ReplicateResult {
  tx: Tx
  txId: string
  /** outpoint of the token returned to the holder (verbatim). */
  holderTokenVout: number
  /** outpoint of the buyer's new replica. */
  replicaVout: number
  changeVout: number | null
}

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
}): Promise<ReplicateResult> {
  // The bond rides forward consensus-enforced (VALUE1 = the edition UTXO value) onto out0 (token→holder)
  // and out1 (replica→buyer). Read it from the UTXO so old (1-sat) and new (bonded) collections both work.
  const bond = opts.edition.satoshis
  const lockBytes = opts.edition.lockBytes
  const holderPub = editionOwnerPubKey(lockBytes)
  const buyerPub = opts.ownerPubKey ?? pubKeyBytes(opts.buyerKey)
  const tx1RefHex = parseEditionScript(LockingScript.fromBinary(Uint8Array.from(lockBytes)))?.tx1RefHex
  const tx = new Tx(2, [], [], 0)

  // input 0: the holder's edition UTXO, spent via the permissionless replicate branch
  tx.inputs.push({ txid: txidToWire(opts.edition.txId), vout: opts.edition.outputIndex, script: new Uint8Array(0), sequence: 0xffffffff })
  addFunding(tx, opts.funding)

  // Enforced outputs, in the order the covenant requires, then the buyer's change.
  tx.outputs.push({ value: bond, script: Uint8Array.from(lockBytes) })                                            // [0] token → holder, verbatim
  tx.outputs.push({ value: bond, script: Uint8Array.from(swapEditionOwner(lockBytes, buyerPub)) })                // [1] replica → buyer
  tx.outputs.push({ value: opts.terms.publisherFeeSats, script: Uint8Array.from(p2pkhScript(opts.terms.publisherPubKeyHash)) })  // [2] publisher fee
  tx.outputs.push({ value: opts.terms.holderFeeSats, script: Uint8Array.from(p2pkhScript(hash160Bytes(holderPub))) })            // [3] holder fee
  /* [4] optional seller-note echo, locked to the buyer. ⚠ A SPENDER-SUPPLIED TRAILING OUTPUT the covenant
     appends verbatim — it is outside the enforced region, so carrying it changes no covenant rule. Not
     bonded: it is a carrier, not a token. */
  if (opts.note && tx1RefHex != null && noteHasContent(opts.note)) {
    tx.outputs.push({
      value: PHARLAP_OUTPUT_SATS,
      script: Uint8Array.from(buildNoteScript(hexOf(buyerPub), { collectionRef: tx1RefHex, ...opts.note }).toBinary()),
    })
  }
  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: opts.changeAddress != null ? scriptForAddress(opts.changeAddress) : opts.buyerKey.lockingScript() })

  /* ⚠⚠ TWO PASSES, AND THE FIRST ONE IS NOT A GUESS. The covenant unlock carries this transaction's own
     preimage, so it cannot exist until the outputs do — but the fee needs its size first. Build it once
     to measure, apply the fee, then build it again for real, and CHECK the length did not move. */
  const unlockOpts = { buyerPubKey: buyerPub, lockBytes, sourceSatoshis: bond }
  const sizedUnlock = replicateUnlock(tx, 0, unlockOpts).length
  applyFee(tx, {
    inputValues: [bond, ...opts.funding.map(f => f.utxo.satoshis)],
    unlockingSizes: [sizedUnlock, ...opts.funding.map(() => UNLOCK_P2PKH)],
    changeVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  const finalUnlock = replicateUnlock(tx, 0, unlockOpts)
  assertExactLength(sizedUnlock, finalUnlock.length, 'replicate')
  tx.inputs[0].script = finalUnlock
  signFunding(tx, opts.buyerKey, opts.funding, 1)

  const changeSats = tx.outputs[changeVout]?.value ?? 0
  return { tx, txId: tx.txid(), holderTokenVout: 0, replicaVout: 1, changeVout: changeSats > 0 ? changeVout : null }
}


// ─── TRANSFER ───────────────────────────────────────────────────────

export interface TransferResult {
  tx: Tx
  txId: string
  tokenVout: number
  changeVout: number | null
}

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
}): Promise<TransferResult> {
  // out0 re-creates the token with the bond preserved (covenant-enforced VALUE1 = the UTXO value).
  const bond = opts.edition.satoshis
  const lockBytes = opts.edition.lockBytes
  const tx1RefHex = parseEditionScript(LockingScript.fromBinary(Uint8Array.from(lockBytes)))?.tx1RefHex
  const tx = new Tx(2, [], [], 0)

  tx.inputs.push({ txid: txidToWire(opts.edition.txId), vout: opts.edition.outputIndex, script: new Uint8Array(0), sequence: 0xffffffff })
  addFunding(tx, opts.funding)

  tx.outputs.push({ value: bond, script: Uint8Array.from(swapEditionOwner(lockBytes, opts.newOwnerPubKey)) })   // [0] token → new owner
  /* [1] ⚠ A 1-SATOSHI BREADCRUMB, AND IT IS NOT DECORATION. The edition covenant output is not indexed by
     address, so without this the new owner has no way to DISCOVER that they were sent something. It sits
     in the covenant's free trailing region, so it costs a satoshi and enforces nothing. */
  tx.outputs.push({ value: 1, script: scriptForAddress(addressFromPubHex(hexOf(opts.newOwnerPubKey))) })
  if (opts.note && tx1RefHex != null && noteHasContent(opts.note)) {
    tx.outputs.push({
      value: PHARLAP_OUTPUT_SATS,
      script: Uint8Array.from(buildNoteScript(hexOf(opts.newOwnerPubKey), { collectionRef: tx1RefHex, ...opts.note }).toBinary()),
    })
  }
  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: opts.ownerKey.lockingScript() })

  const unlockOpts = { ownerKey: opts.ownerKey, newOwnerPubKey: opts.newOwnerPubKey, lockBytes, sourceSatoshis: bond }
  const sizedUnlock = transferUnlock(tx, 0, { ...unlockOpts, forSizing: true }).length
  applyFee(tx, {
    inputValues: [bond, ...opts.funding.map(f => f.utxo.satoshis)],
    unlockingSizes: [sizedUnlock, ...opts.funding.map(() => UNLOCK_P2PKH)],
    changeVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  const finalUnlock = transferUnlock(tx, 0, unlockOpts)
  assertNotLonger(sizedUnlock, finalUnlock.length, 'transfer')
  tx.inputs[0].script = finalUnlock
  signFunding(tx, opts.ownerKey, opts.funding, 1)

  const changeSats = tx.outputs[changeVout]?.value ?? 0
  return { tx, txId: tx.txid(), tokenVout: 0, changeVout: changeSats > 0 ? changeVout : null }
}

// ─── Network wrappers (funding selection + broadcast) ───────────────

export async function toFundingInputs(_provider: WalletProvider, utxos: Utxo[]): Promise<FundingInput[]> {
  /* ⚠ THE PARENT TRANSACTIONS ARE NO LONGER FETCHED. The deployed version pulled one per input, because
     the old unlocking template read the amount out of the parent. A BIP-143 signature commits to the
     amount directly, so it is passed explicitly and the parent is never consulted — one network round
     trip per funding input, gone. ⚠ `provider` is kept in the signature: callers pass it, and the shape
     of this helper is not worth churning for one unused argument. */
  return utxos.map(u => ({ utxo: u }))
}

export interface CreateEditionResult {
  collectionId: string
  tx1Id: string
  tx2Id: string
  editions: Array<{ txId: string; outputIndex: number; lockHex: string }>
}

/**
 * Create an edition collection on-chain: TX1 template (commits name, replicable rules, and the covenant
 * template with a zeroed tx1Ref/owner for later verification) + TX2 that mints the edition covenant
 * outputs referencing TX1. Mirrors collectionBuilder.createCollection's funding/broadcast pattern.
 */
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
}): Promise<CreateEditionResult> {
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const mintCount = params.mintCount ?? 1
  const ownerPub = params.ownerPubKey ?? pubKeyBytes(key)
  const tokenSats = params.terms.tokenSats ?? PHARLAP_OUTPUT_SATS
  const stateData = params.stateData ?? []

  // Covenant template committed in TX1: structurally identical to an edition but with identity zeroed.
  const templateLock = buildEditionLock({
    tx1Ref: new Array(32).fill(0), ownerPubKey: new Array(33).fill(0),
    publisherPubKeyHash: params.terms.publisherPubKeyHash, publisherFeeSats: params.terms.publisherFeeSats,
    holderFeeSats: params.terms.holderFeeSats, tokenSats,
  })

  // Smart-compress (keep only if smaller), then optionally Tier-1 encrypt. Order matters: compress BEFORE
  // encrypt (ciphertext is incompressible). The FILE output stores the final bytes; fileHash binds them.
  const encrypt = params.encrypt === true && params.file != null
  let storedBytes = params.file?.bytes
  let compressed = false
  let wrappedKey: number[] | undefined
  let keySalt: number[] | undefined
  if (params.file != null) {
    const z = await compressIfSmaller(params.file.bytes, params.file.mimeType, params.file.fileName)
    storedBytes = z.bytes
    compressed = z.compressed
    if (encrypt) {
      const K = newContentKey()
      keySalt = newKeySalt()
      /* ⚠⚠ AWAITED, AND THE DEPLOYED CALLS WERE NOT. These now go through the browser's own AES-GCM,
         which is async. Without the await, `storedBytes` becomes a PROMISE — and a Promise serializes
         into the file output as garbage rather than failing, so the mint would succeed and the content
         would be unreadable forever. Caught by type-checking, not by running it. */
      storedBytes = await encryptContent(storedBytes, K)
      wrappedKey = await wrapContentKey(K, keySalt)
    }
  }
  const restrictions = RESTRICTION_REPLICABLE | (encrypt ? RESTRICTION_ENCRYPTED : 0) | (compressed ? RESTRICTION_COMPRESSED : 0)
  const template = {
    tokenName: params.tokenName,
    tokenRules: encodeTokenRules(0, 0, restrictions, 1), // supply 0 = unlimited / replicable
    covenantScript: hexOf(templateLock.toBinary()),
    // fileHash semantics: PUBLIC content binds the ORIGINAL plaintext (provenance — a verifier decompresses
    // the on-chain blob and matches H(plaintext); DEFLATE decompression is deterministic so the proof is
    // independent of the non-reproducible gzip encoding). ENCRYPTED content binds the ciphertext (privacy —
    // a public plaintext hash would be a confirmation oracle).
    fileHash: params.file == null ? undefined : encrypt ? sha256Hex(storedBytes!) : sha256Hex(params.file.bytes),
    wrappedKey,
    keySalt,
    license: params.license,
    licenseRef: params.licenseRef,
  }
  const file = params.file != null
    ? { mimeType: params.file.mimeType, fileName: params.file.fileName, fileBytes: storedBytes! }
    : undefined

  // Immutable storefront record (description + optional public cover image), carried as a TX1 output.
  const hasStorefront = (params.description != null && params.description.length > 0) || params.cover != null
  const storefront = hasStorefront
    ? {
        description: params.description ?? '',
        coverMimeType: params.cover?.mimeType,
        coverFileName: params.cover?.fileName,
        coverBytes: params.cover?.bytes,
        // A back cover only makes sense alongside a front cover (the codec keys "has back" off the bytes).
        backCoverMimeType: params.cover != null ? params.backCover?.mimeType : undefined,
        backCoverFileName: params.cover != null ? params.backCover?.fileName : undefined,
        backCoverBytes: params.cover != null ? params.backCover?.bytes : undefined,
      }
    : undefined

  // Fund both txs. TX1 carries any embedded file + cover, so its fee scales with their size; keep a healthy margin.
  const editionBytes = 800
  const tx1Bytes = 500 + templateLock.toBinary().length
    + (file ? file.fileBytes.length : 0)
    + (params.cover ? params.cover.bytes.length : 0)
  const tx2Bytes = 300 + mintCount * editionBytes
  const estFee = Math.ceil(((tx1Bytes + tx2Bytes) * feePerKb) / 1000)
  const target = (1 + mintCount) * tokenSats + estFee + Math.max(1000, Math.ceil(estFee * 0.2))
  const selected = selectFunding(await getSafeUtxos(provider), target)
  const funding = await toFundingInputs(provider, selected)

  // Build both offline, broadcast only if both succeed (no orphaned template).
  const t1 = await buildTemplateTx({ key, funding, template, file, storefront, mockup: params.mockupManifest, outputSats: tokenSats, feePerKb })
  if (t1.changeVout == null) throw new Error('Insufficient funding: template tx left no change to fund the edition mint.')
  const t2Funding: FundingInput[] = [{
    utxo: { txId: t1.tx1Id, outputIndex: t1.changeVout, satoshis: t1.changeSats, script: '' },
  }]
  const t2 = await buildEditionGenesisTx({
    key, funding: t2Funding, tx1Ref: t1.tx1Id, terms: params.terms, ownerPubKey: ownerPub, mintCount, feePerKb,
  })

  if (params.confirmSpend != null && !(await params.confirmSpend(spentSats(selected, t2.changeSats)))) {
    throw new Error(SPEND_CANCELLED)
  }

  // Gate: block until TX1 is actually in a relay mempool before broadcasting TX2 (which spends TX1's change),
  // so TX2 can't race ahead of its unconfirmed parent → "Missing inputs". Throws (aborting the mint) if TX1
  // never surfaces, leaving no orphaned TX2. See walletProvider.awaitInMempool.
  await provider.broadcast(t1.tx.hex(), { awaitSeen: true })
  provider.registerPendingTx(t1.tx1Id, selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    { outputIndex: t1.changeVout, satoshis: t1.changeSats })
  await provider.broadcast(t2.tx.hex())
  provider.registerPendingTx(t2.txId, [{ txId: t1.tx1Id, outputIndex: t1.changeVout }],
    t2.changeVout != null ? { outputIndex: t2.changeVout, satoshis: t2.changeSats } : undefined)

  const editions = t2.editionVouts.map(v => ({
    txId: t2.txId, outputIndex: v, lockHex: hexOf(Array.from(t2.tx.outputs[v].script)),
  }))
  return { collectionId: t1.tx1Id, tx1Id: t1.tx1Id, tx2Id: t2.txId, editions }
}

/** Replicate (permissionlessly mint a copy of) an on-chain edition. The caller is the buyer. */
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
}): Promise<{ txId: string; replicaOutpoint: { txId: string; outputIndex: number }; lockHex: string }> {
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const lockBytes = hexBytes(params.editionLockHex)
  const sourceTx = await provider.getSourceTransaction(params.editionTxId)
  const bond = sourceTx.outputs[params.editionOutputIndex]?.value ?? PHARLAP_OUTPUT_SATS // the edition's enforced bond
  const edition: EditionUtxo = {
    txId: params.editionTxId, outputIndex: params.editionOutputIndex, satoshis: bond, lockBytes,
  }
  // Buyer funds: the replica's bond (out1), both fees, the optional note carrier, miner fee, margin. The
  // holder's returned token (out0) rides forward from the spent edition input.
  const noteSats = params.note ? PHARLAP_OUTPUT_SATS : 0
  const estFee = Math.ceil((1500 * feePerKb) / 1000)
  const target = bond + noteSats + params.terms.publisherFeeSats + params.terms.holderFeeSats + estFee + 1000
  const selected = selectFunding(await getSafeUtxos(provider), target)
  const funding = await toFundingInputs(provider, selected)

  const rep = await buildReplicateTx({ edition, terms: params.terms, buyerKey, funding, note: params.note, feePerKb })
  const repChange = rep.changeVout != null ? (rep.tx.outputs[rep.changeVout]?.value ?? 0) : 0
  if (params.confirmSpend != null && !(await params.confirmSpend(spentSats(selected, repChange)))) {
    throw new Error(SPEND_CANCELLED)
  }
  await provider.broadcast(rep.tx.hex())
  provider.registerPendingTx(rep.txId,
    [{ txId: params.editionTxId, outputIndex: params.editionOutputIndex },
      ...selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex }))],
    rep.changeVout != null ? { outputIndex: rep.changeVout, satoshis: rep.tx.outputs[rep.changeVout].value ?? 0 } : undefined)
  return {
    txId: rep.txId, replicaOutpoint: { txId: rep.txId, outputIndex: rep.replicaVout },
    lockHex: hexOf(Array.from(rep.tx.outputs[rep.replicaVout].script)),
  }
}

// ─── Covenant v2 network wrappers (Addendum G) ──────────────────────



// ─── Free-gift vouchers (publisher pre-funds claims; recipients claim for ~a miner fee) ──────────

/**
 * Deterministic voucher key from the publisher's private key + collection + index. Because it uses the
 * publisher's PRIVATE key, only they can regenerate the batch — so gift links (and any unclaimed funds) are
 * always recoverable from the publisher's WIF + chain, with no separate backup. (The WIF is meant to be
 * handed out in the link anyway; the one-way hash never leaks the publisher's key.)
 */
export function deriveVoucherKey(publisherKey: Signer, tx1RefHex: string, index: number): Signer {
  const idx = [index & 0xff, (index >> 8) & 0xff, (index >> 16) & 0xff, (index >> 24) & 0xff]
  /* ⚠⚠⚠ BYTE-IDENTICAL DERIVATION IS A HARD REQUIREMENT, NOT A PREFERENCE. Vouchers already handed out
     were derived by the deployed wallet; if this produces a different key the publisher cannot sweep an
     unclaimed voucher and the recipient cannot claim it. The seed is the private key as 32 big-endian
     bytes, then the collection id, then the index as 4 little-endian bytes — unchanged. */
  const seed = [...Array.from(beBytes(publisherKey.d, 32)), ...hexBytes(tx1RefHex), ...idx]
  return Signer.fromPrivateKey(Uint8Array.from(sha256Bytes(seed)))
}

/**
 * Publisher: mint `count` funded voucher outputs in ONE tx, each holding `fundEachSats`, using DETERMINISTIC
 * keys derived at `startIndex..startIndex+count-1` (so they're recoverable from the publisher's key). Returns
 * the funding txid + the voucher WIFs (the app turns each into a `&g=` claim link).
 */
export async function createGiftVouchers(provider: WalletProvider, publisherKey: Signer, params: {
  tx1RefHex: string
  startIndex: number
  count: number
  fundEachSats: number
  feePerKb?: number
}): Promise<{ fundingTxId: string; voucherWifs: string[] }> {
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const count = Math.max(1, Math.floor(params.count))
  const keys = Array.from({ length: count }, (_, i) => deriveVoucherKey(publisherKey, params.tx1RefHex, params.startIndex + i))
  const estFee = Math.ceil(((250 + count * 35) * feePerKb) / 1000)
  const target = count * params.fundEachSats + estFee + 500
  const selected = selectFunding(await getSafeUtxos(provider), target)
  if (selected.length === 0) throw new Error('Insufficient funds to create the gift vouchers.')
  const funding = await toFundingInputs(provider, selected)

  const tx = new Tx(1, [], [], 0)
  addFunding(tx, funding)
  for (const k of keys) {
    tx.outputs.push({ value: params.fundEachSats, script: scriptForAddress(k.address()) })
  }
  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: publisherKey.lockingScript() })
  applyFee(tx, {
    inputValues: funding.map(f => f.utxo.satoshis),
    unlockingSizes: funding.map(() => UNLOCK_P2PKH),
    changeVout,
    satPerKb: feePerKb,
  })
  signFunding(tx, publisherKey, funding)
  await provider.broadcast(tx.hex())
  const txId = tx.txid()
  provider.registerPendingTx(txId, selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    (tx.outputs[changeVout]?.value ?? 0) > 0 ? { outputIndex: changeVout, satoshis: tx.outputs[changeVout].value ?? 0 } : undefined)
  return { fundingTxId: txId, voucherWifs: keys.map(k => k.toWif()) }
}

export interface GiftVoucherScan {
  /** First never-funded index — where the next batch starts. */
  nextIndex: number
  /** Funded + unspent vouchers = live, unclaimed links (with their WIF, to rebuild the link). */
  live: Array<{ index: number; wif: string }>
  /** Funded but already spent = claimed. */
  claimedCount: number
}

/**
 * Recover a collection's gift vouchers from the publisher's key alone: regenerate the deterministic keys and
 * gap-scan the chain. Funded-and-unspent = a live unclaimed link; funded-and-spent = claimed; never funded =
 * the end of the batch. No local state needed — pure recover-from-WIF + chain.
 */
export async function scanGiftVouchers(
  provider: WalletProvider, publisherKey: Signer, tx1RefHex: string, opts?: { gapLimit?: number; max?: number },
): Promise<GiftVoucherScan> {
  const gapLimit = opts?.gapLimit ?? 5
  const max = opts?.max ?? 1000
  const live: Array<{ index: number; wif: string }> = []
  let claimedCount = 0
  let nextIndex = 0
  let consecutiveEmpty = 0
  for (let i = 0; i < max && consecutiveEmpty < gapLimit; i++) {
    const k = deriveVoucherKey(publisherKey, tx1RefHex, i)
    const script = p2pkhScript(hash160Bytes(Array.from(k.publicKey())))
    // Check the MEMPOOL-AWARE unspent set first — a just-funded (unconfirmed) live voucher appears here but
    // NOT in confirmed-only getAddressHistory. If it's unspent → live. If not, it may be funded-then-claimed,
    // so fall back to history (confirmed) + recent (mempool) to keep the gap scan from bailing early.
    let unspent: Utxo[] = []
    try { unspent = await provider.getUnspentByScriptHash(wocScriptHash(script)) } catch { /* best-effort */ }
    let funded = unspent.length > 0
    if (!funded) {
      try { funded = (await provider.getAddressHistory(k.address())).length > 0 } catch { /* best-effort */ }
      if (!funded) { try { funded = (await provider.getRecentTxIdsForAddress(k.address())).length > 0 } catch { /* best-effort */ } }
    }
    if (!funded) { consecutiveEmpty++; continue }
    consecutiveEmpty = 0
    nextIndex = i + 1
    if (unspent.length > 0) live.push({ index: i, wif: k.toWif() })
    else claimedCount++
  }
  return { nextIndex, live, claimedCount }
}

/** Derive the FUNDED gift-voucher pubkey-hashes (hex, lowercase) for a collection — the same gap-scan as
 *  scanGiftVouchers, but returns the address hashes (any spend state) so a sale can be matched back to a gift
 *  claim: a claim is funded by its voucher UTXO, so a sale whose funding key hashes into this set was gifted.
 *  This is what makes gift counting EXACT (a swept/reclaimed voucher never funds a sale, so it isn't counted). */
export async function scanVoucherHashes(
  provider: WalletProvider, publisherKey: Signer, tx1RefHex: string, opts?: { gapLimit?: number; max?: number },
): Promise<Set<string>> {
  const gapLimit = opts?.gapLimit ?? 5
  const max = opts?.max ?? 1000
  const hashes = new Set<string>()
  let consecutiveEmpty = 0
  for (let i = 0; i < max && consecutiveEmpty < gapLimit; i++) {
    const k = deriveVoucherKey(publisherKey, tx1RefHex, i)
    const pkh = hash160Bytes(Array.from(k.publicKey()))
    let funded = false
    try { funded = (await provider.getUnspentByScriptHash(wocScriptHash(p2pkhScript(pkh)))).length > 0 } catch { /* try history */ }
    if (!funded) {
      try { funded = (await provider.getAddressHistory(k.address())).length > 0 } catch { /* try recent */ }
      if (!funded) { try { funded = (await provider.getRecentTxIdsForAddress(k.address())).length > 0 } catch { /* unknown → treat as empty */ } }
    }
    if (!funded) { consecutiveEmpty++; continue }
    consecutiveEmpty = 0
    hashes.add(hexOf(pkh).toLowerCase())
  }
  return hashes
}

/**
 * Publisher: reclaim UNCLAIMED gift vouchers — sweep each live voucher's funding back to your wallet in one
 * tx (invalidating those links). Pass the `live` list from scanGiftVouchers (each carries its voucher WIF).
 * Already-claimed gifts have no unspent funding, so they're untouched. Returns null if nothing to reclaim.
 */
export async function sweepGiftVouchers(
  provider: WalletProvider, publisherKey: Signer, live: Array<{ wif: string }>, opts?: { feePerKb?: number },
): Promise<{ swept: number; reclaimedSats: number; txId: string } | null> {
  /* ⚠⚠ EVERY INPUT HERE IS SIGNED BY A DIFFERENT KEY — one per unclaimed voucher — so `signFunding`,
     which signs a whole run with one signer, does not apply. Each input is signed on its own below,
     against ITS OWN key and ITS OWN amount. ⚠ Getting either wrong produces a transaction that looks
     complete and is refused by the network for a bad script. */
  const tx = new Tx(1, [], [], 0)
  const spends: Array<{ key: Signer; satoshis: number }> = []
  let swept = 0
  for (const v of live) {
    const k = Signer.fromWif(v.wif)
    const script = p2pkhScript(hash160Bytes(Array.from(k.publicKey())))
    let utxos: Utxo[] = []
    try { utxos = await provider.getUnspentByScriptHash(wocScriptHash(script)) } catch { continue }
    let any = false
    for (const u of utxos) {
      tx.inputs.push({ txid: txidToWire(u.txId), vout: u.outputIndex, script: new Uint8Array(0), sequence: 0xffffffff })
      spends.push({ key: k, satoshis: u.satoshis })
      any = true
    }
    if (any) swept++
  }
  if (spends.length === 0) return null
  tx.outputs.push({ value: 0, script: publisherKey.lockingScript() })   // everything back to you, minus the fee
  applyFee(tx, {
    inputValues: spends.map(sp => sp.satoshis),
    unlockingSizes: spends.map(() => UNLOCK_P2PKH),
    changeVout: 0,
    satPerKb: opts?.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  spends.forEach((sp, i) => {
    tx.inputs[i].script = sp.key.unlockP2PKH(tx, i, sp.key.lockingScript(), sp.satoshis)
  })
  await provider.broadcast(tx.hex())
  const txId = tx.txid()
  const reclaimedSats = tx.outputs[0]?.value ?? 0
  provider.registerPendingTx(txId, [], reclaimedSats > 0 ? { outputIndex: 0, satoshis: reclaimedSats } : undefined)
  return { swept, reclaimedSats, txId }
}

/**
 * Recipient: claim a gift edition with a funded voucher key. The voucher signs the funding (pays the fee +
 * price), but the replica is owned by `ownerKey` (the recipient's own wallet) and change tops them up.
 * Works for a brand-new OR existing wallet. Throws if the voucher has already been spent (single-use).
 */
export async function claimGiftEdition(provider: WalletProvider, ownerKey: Signer, params: {
  giftWif: string
  editionTxId: string
  editionOutputIndex: number
  editionLockHex: string
  editionSourceTx?: Tx
  note?: SellerNote
  feePerKb?: number
}): Promise<{ txId: string; replicaOutpoint: { txId: string; outputIndex: number }; lockHex: string }> {
  const giftKey = Signer.fromWif(params.giftWif)
  const giftScript = p2pkhScript(hash160Bytes(Array.from(giftKey.publicKey())))
  const giftUtxos = await provider.getUnspentByScriptHash(wocScriptHash(giftScript))
  if (giftUtxos.length === 0) throw new Error('This free copy has already been claimed.')
  const funding = await toFundingInputs(provider, giftUtxos)

  const lockBytes = hexBytes(params.editionLockHex)
  const parsed = parseEditionScript(LockingScript.fromBinary(Uint8Array.from(lockBytes)))
  if (parsed == null) throw new Error('claimGiftEdition: not an edition covenant')
  const sourceTx = params.editionSourceTx ?? await provider.getSourceTransaction(params.editionTxId)
  const tokenSats = sourceTx.outputs[params.editionOutputIndex]?.value ?? PHARLAP_OUTPUT_SATS
  const edition: EditionUtxo = { txId: params.editionTxId, outputIndex: params.editionOutputIndex, satoshis: tokenSats, lockBytes }
  const ownerPub = Array.from(ownerKey.publicKey())
  const changeAddress = ownerKey.address()

  /* ⚠ THIS USED TO BRANCH ON THE COVENANT VERSION. There is one version, so there is one path. */
  let rep: ReplicateResult
  {
    const terms: EditionTerms = {
      publisherPubKeyHash: parsed.terms.publisherPubKeyHash, publisherFeeSats: parsed.terms.publisherFeeSats,
      holderFeeSats: parsed.terms.holderFeeSats, tokenSats,
    }
    rep = await buildReplicateTx({ edition, terms, buyerKey: giftKey, funding, ownerPubKey: ownerPub, changeAddress, note: params.note, feePerKb: params.feePerKb })
  }
  await provider.broadcast(rep.tx.hex())
  provider.registerPendingTx(rep.txId,
    [{ txId: params.editionTxId, outputIndex: params.editionOutputIndex }, ...giftUtxos.map(u => ({ txId: u.txId, outputIndex: u.outputIndex }))],
    rep.changeVout != null ? { outputIndex: rep.changeVout, satoshis: rep.tx.outputs[rep.changeVout].value ?? 0 } : undefined)
  return {
    txId: rep.txId, replicaOutpoint: { txId: rep.txId, outputIndex: rep.replicaVout },
    lockHex: hexOf(Array.from(rep.tx.outputs[rep.replicaVout].script)),
  }
}

/** Transfer (owner-signed) an on-chain edition to a new owner, re-creating the covenant. */
export async function transferEdition(provider: WalletProvider, ownerKey: Signer, params: {
  editionTxId: string
  editionOutputIndex: number
  editionLockHex: string
  newOwnerPubKey: number[]
  /** Seller-note (promo + optional bonus) to carry to the new owner (hands-off propagation). */
  note?: SellerNote
  tokenSats?: number
  feePerKb?: number
}): Promise<{ txId: string; tokenOutpoint: { txId: string; outputIndex: number }; lockHex: string }> {
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const lockBytes = hexBytes(params.editionLockHex)
  const sourceTx = await provider.getSourceTransaction(params.editionTxId)
  const bond = sourceTx.outputs[params.editionOutputIndex]?.value ?? PHARLAP_OUTPUT_SATS
  const edition: EditionUtxo = {
    txId: params.editionTxId, outputIndex: params.editionOutputIndex, satoshis: bond, lockBytes,
  }
  // The bond rides forward from the spent input onto out0, so funding only covers the note carrier + fee + margin.
  const noteSats = params.note ? PHARLAP_OUTPUT_SATS : 0
  const estFee = Math.ceil((1500 * feePerKb) / 1000)
  const selected = selectFunding(await getSafeUtxos(provider), noteSats + estFee + 1000)
  const funding = await toFundingInputs(provider, selected)

  const xfer = await buildEditionTransferTx({
    edition, ownerKey, newOwnerPubKey: params.newOwnerPubKey, funding, note: params.note, feePerKb,
  })
  await provider.broadcast(xfer.tx.hex())
  provider.registerPendingTx(xfer.txId,
    [{ txId: params.editionTxId, outputIndex: params.editionOutputIndex },
      ...selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex }))],
    xfer.changeVout != null ? { outputIndex: xfer.changeVout, satoshis: xfer.tx.outputs[xfer.changeVout].value ?? 0 } : undefined)
  return {
    txId: xfer.txId, tokenOutpoint: { txId: xfer.txId, outputIndex: xfer.tokenVout },
    lockHex: hexOf(Array.from(xfer.tx.outputs[xfer.tokenVout].script)),
  }
}

// ─── BURN (reclaim the bond, destroy the token) ─────────────────────

/** Build an owner-signed burn tx: spend the bonded edition UTXO via the burn branch, sweeping its sats
 *  (minus the network fee) to the owner's address. The covenant re-creates NO output — the token is gone. */
export async function buildEditionBurnTx(opts: {
  edition: EditionUtxo
  ownerKey: Signer
  reclaimAddress?: string
  feePerKb?: number
}): Promise<{ tx: Tx; txId: string; reclaimVout: number; reclaimSats: number }> {
  const lockBytes = opts.edition.lockBytes
  const reclaimAddress = opts.reclaimAddress ?? opts.ownerKey.address()
  const tx = new Tx(2, [], [], 0)
  tx.inputs.push({ txid: txidToWire(opts.edition.txId), vout: opts.edition.outputIndex, script: new Uint8Array(0), sequence: 0xffffffff })
  tx.outputs.push({ value: 0, script: scriptForAddress(reclaimAddress) })   // the bond, less the fee, back to the owner

  /* ⚠ THE ONLY INPUT IS THE COVENANT ITSELF — a burn is funded by the bond it releases. So the fee comes
     out of the reclaimed amount, and if the bond cannot cover it `applyFee` is the thing that must say
     so rather than emitting a negative output. */
  const unlockOpts = { ownerKey: opts.ownerKey, lockBytes, sourceSatoshis: opts.edition.satoshis }
  const sizedUnlock = burnUnlock(tx, 0, { ...unlockOpts, forSizing: true }).length
  applyFee(tx, {
    inputValues: [opts.edition.satoshis],
    unlockingSizes: [sizedUnlock],
    changeVout: 0,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  const finalUnlock = burnUnlock(tx, 0, unlockOpts)
  assertNotLonger(sizedUnlock, finalUnlock.length, 'burn')
  tx.inputs[0].script = finalUnlock

  return { tx, txId: tx.txid(), reclaimVout: 0, reclaimSats: tx.outputs[0]?.value ?? 0 }
}

/** Burn (destroy) an edition you own and reclaim its bonded sats. Owner-signed; works only on burn-capable
 *  (bonded) editions — use `editionSupportsBurn` to check before offering it. */
export async function burnEdition(provider: WalletProvider, ownerKey: Signer, params: {
  editionTxId: string
  editionOutputIndex: number
  editionLockHex: string
  feePerKb?: number
}): Promise<{ txId: string; reclaimSats: number }> {
  const lockBytes = hexBytes(params.editionLockHex)
  const sourceTx = await provider.getSourceTransaction(params.editionTxId)
  const satoshis = sourceTx.outputs[params.editionOutputIndex]?.value ?? 0
  const edition: EditionUtxo = { txId: params.editionTxId, outputIndex: params.editionOutputIndex, satoshis, lockBytes }
  const r = await buildEditionBurnTx({ edition, ownerKey, feePerKb: params.feePerKb })
  await provider.broadcast(r.tx.hex())
  provider.registerPendingTx(r.txId, [{ txId: params.editionTxId, outputIndex: params.editionOutputIndex }],
    r.reclaimSats > 0 ? { outputIndex: r.reclaimVout, satoshis: r.reclaimSats } : undefined)
  return { txId: r.txId, reclaimSats: r.reclaimSats }
}

/** WoC script hash for an output: SHA-256(scriptBytes) byte-reversed (Electrum/WoC convention). */
export function wocScriptHash(scriptBytes: number[]): string {
  return hexOf(sha256Bytes(scriptBytes).reverse())
}

export interface ResolvedEdition {
  txId: string
  outputIndex: number
  /** The exact edition locking script (hex) — feeds straight into replicateEdition. */
  lockHex: string
  terms: EditionTerms
  tokenSats: number
}

/**
 * Resolve a holder's CURRENT spendable edition of a collection, given the collection's covenant template
 * (from TX1) and the holder's pubkey — the "sales link" tip resolution (PLAN.md Step 2, D2).
 *
 * The holder's edition script is deterministic (buildHolderEditionScript: template + tx1Ref + owner), so
 * we derive it and ask WoC for its unspent UTXO(s) by script hash — no address-history walk. Returns the
 * tip to replicate from, or null if the holder currently holds no edition of this collection.
 */
export async function resolveHolderEdition(provider: WalletProvider, params: {
  tx1RefHex: string
  holderPubKeyHex: string
  /** The collection's covenant template bytes (hex) — TX1 template.covenantScript. */
  templateCovenantHex: string
}): Promise<ResolvedEdition | null> {
  const tx1Ref = hexBytes(params.tx1RefHex)
  const ownerPub = hexBytes(params.holderPubKeyHex)
  const templateBytes = hexBytes(params.templateCovenantHex)
  const lockBytes = buildHolderEditionScript(templateBytes, tx1Ref, ownerPub)
  const lockScript = LockingScript.fromHex(hexOf(lockBytes))
  const ed = parseEditionScript(lockScript)
  if (ed == null) throw new Error('resolveHolderEdition: reconstructed script is not a valid edition')

  const unspent = await provider.getUnspentByScriptHash(wocScriptHash(lockBytes))
  if (unspent.length === 0) return null
  // Any unspent edition of this holder is an interchangeable sale source; prefer a confirmed one.
  const pick = unspent.find(u => u.satoshis > 0) ?? unspent[0]
  return {
    txId: pick.txId, outputIndex: pick.outputIndex, lockHex: hexOf(lockBytes),
    terms: { publisherPubKeyHash: ed.terms.publisherPubKeyHash, publisherFeeSats: ed.terms.publisherFeeSats, holderFeeSats: ed.terms.holderFeeSats, tokenSats: pick.satoshis },
    tokenSats: pick.satoshis,
  }
}

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

/**
 * Find the edition covenant outputs CURRENTLY held by `pubKeyHex` (unspent). Two passes:
 *   1) Discover which collections this pubkey has held, by scanning the wallet's address history (the
 *      change / notification breadcrumbs land there) for edition outputs locked to it.
 *   2) For each distinct edition script (one per collection+owner, deterministic), ask WoC for its current
 *      UNSPENT outputs by script hash — so editions already sold/transferred away are excluded.
 * This makes the result a true snapshot of live holdings, which is what both "check incoming" and
 * recover-from-WIF need (the local store is a rebuildable cache; the chain is the source of truth).
 * Terms come from the covenant script itself, and any seller-note that rode in is read from each tx.
 */
export async function scanIncomingEditions(
  provider: WalletProvider, pubKeyHex: string,
  /** Incremental cache (curator): seed `scripts` from a prior run and skip re-fetching candidates CONFIRMED at or
   *  below `sinceHeight` (their edition scripts are already known). Unconfirmed (height 0) + anything above the
   *  watermark are always re-scanned, so a fresh onboard is never missed. `scripts` is mutated with new discoveries
   *  for the caller to persist. Pass 2 (below) still runs over ALL scripts every time, so live holdings stay exact. */
  cache?: { scripts: Map<string, string>; sinceHeight: number },
): Promise<IncomingEdition[]> {
  const mine = pubKeyHex.toLowerCase()

  // Pass 1 — discover distinct edition scripts (lockHex) this pubkey holds/held, from address breadcrumbs.
  const cand = new Map<string, number>() // txId -> height (0 = unconfirmed/unknown)
  try { for (const e of await provider.getAddressHistory()) cand.set(e.txId, e.blockHeight || 0) } catch { /* best-effort */ }
  try { for (const u of await provider.getUtxos()) if (!cand.has(u.txId)) cand.set(u.txId, u.height || 0) } catch { /* best-effort */ }
  const scripts = new Map<string, string>(cache?.scripts ?? []) // lockHex -> tx1RefHex (seeded from cache)
  const since = cache?.sinceHeight ?? -1
  for (const [txId, h] of cand) {
    if (since >= 0 && h > 0 && h <= since) continue // confirmed at/below the watermark — already discovered
    let tx: Tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    for (const o of tx.outputs) {
      const ed = parseEditionScript(LockingScript.fromBinary(o.script))
      if (ed == null || ed.ownerPubKeyHex.toLowerCase() !== mine) continue
      scripts.set(hexOf(Array.from(o.script)), ed.tx1RefHex)
    }
  }
  if (cache) for (const [k, v] of scripts) cache.scripts.set(k, v) // persist merged discoveries

  // Pass 2 — for each distinct script, the current UNSPENT outputs are the live holdings (mempool-aware).
  const found: IncomingEdition[] = []
  const seen = new Set<string>()
  for (const [lockHex, tx1RefHex] of scripts) {
    const lockBytes = hexBytes(lockHex)
    let unspent: Utxo[]
    try { unspent = await provider.getUnspentByScriptHash(wocScriptHash(lockBytes)) } catch { continue }
    const ed = parseEditionScript(LockingScript.fromHex(lockHex))
    if (ed == null) continue
    for (const u of unspent) {
      const key = `${u.txId}:${u.outputIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      let note: SellerNote | null = null
      try { note = readNoteFromTx(await provider.getSourceTransaction(u.txId), tx1RefHex) } catch { /* best-effort */ }
      found.push({
        txId: u.txId, outputIndex: u.outputIndex, lockHex, tx1RefHex,
        terms: { publisherPubKeyHash: ed.terms.publisherPubKeyHash, publisherFeeSats: ed.terms.publisherFeeSats, holderFeeSats: ed.terms.holderFeeSats, tokenSats: u.satoshis ?? PHARLAP_OUTPUT_SATS },
        ...(note ? { sellerNote: note } : {}),
        ...(u.height ? { height: u.height } : {}),
      })
    }
  }
  return found
}

export interface BuyerRecord {
  /** The buyer's full public key (hex) — owner of the replica that was minted to them. */
  pubKeyHex: string
  /** How many copies this buyer replicated (separate sales to the same key). */
  count: number
  /** Block heights of their first and most-recent purchase (0 = unconfirmed/unknown). */
  firstHeight: number
  lastHeight: number
}

/**
 * List the buyers of a collection you publish — everyone a replica was minted TO, **at point of sale**.
 * Every replication pays your publisher fee to your address, so each sale lands in your address history;
 * the buyer's full pubkey is the owner of the replica output (`out[1]`). A replication puts an edition there;
 * a transfer puts a 1-sat P2PKH notification, so reading `out[1]` as an edition naturally selects sales only.
 *
 * HONEST LIMIT: this captures buyers at the moment they replicated, NOT onward transfers (those are
 * owner-signed, free, and never touch your address) — so it is "buyers", not guaranteed "current holders".
 * Your own genesis/self copies are excluded (their owner hashes to your publisher key).
 */
export async function scanCollectionBuyers(
  provider: WalletProvider,
  params: { collectionId: string; publisherPubKeyHashHex: string; maxTxs?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ buyers: BuyerRecord[]; scanned: number; capped: boolean }> {
  const want = params.publisherPubKeyHashHex.toLowerCase()
  const cap = params.maxTxs ?? 400
  // Candidate txs = confirmed history (most-recent `cap`) UNIONED with the mempool-aware UTXO set. The union
  // matters: getAddressHistory() is confirmed-only, so an UNCONFIRMED sale would be invisible until mined —
  // but its publisher-fee output sits in our unspent set, so getUtxos() surfaces it immediately.
  const candidates = new Map<string, number>() // txId -> blockHeight (0 = unconfirmed/unknown)
  let capped = false
  try {
    let hist = await provider.getAddressHistory()
    if (hist.length > cap) { capped = true; hist = hist.slice(hist.length - cap) }
    for (const h of hist) candidates.set(h.txId, h.blockHeight || 0)
  } catch { /* best-effort */ }
  try {
    for (const u of await provider.getUtxos()) if (!candidates.has(u.txId)) candidates.set(u.txId, 0)
  } catch { /* best-effort */ }
  const entries = [...candidates.entries()]
  const byBuyer = new Map<string, BuyerRecord>()
  let done = 0
  for (const [txId, blockHeight] of entries) {
    params.onProgress?.(done, entries.length); done++
    let tx: Tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    const replica = tx.outputs[1]
    if (replica == null) continue
    const ed = parseEditionScript(LockingScript.fromBinary(replica.script))
    if (ed == null || ed.tx1RefHex !== params.collectionId) continue
    if (hexOf(ed.terms.publisherPubKeyHash).toLowerCase() !== want) continue
    const buyerBytes = hexBytes(ed.ownerPubKeyHex)
    if (hexOf(hash160Bytes(buyerBytes)).toLowerCase() === want) continue // skip your own genesis/self copies
    const k = ed.ownerPubKeyHex.toLowerCase()
    const h = blockHeight || 0
    const rec = byBuyer.get(k)
    if (rec != null) { rec.count++; if (h) { rec.lastHeight = Math.max(rec.lastHeight, h); rec.firstHeight = rec.firstHeight ? Math.min(rec.firstHeight, h) : h } }
    else byBuyer.set(k, { pubKeyHex: ed.ownerPubKeyHex, count: 1, firstHeight: h, lastHeight: h })
  }
  params.onProgress?.(entries.length, entries.length)
  const buyers = [...byBuyer.values()].sort((a, b) => (b.lastHeight || Infinity) - (a.lastHeight || Infinity)) // newest/unconfirmed first
  return { buyers, scanned: entries.length, capped }
}

export interface SalesGroup {
  collectionId: string
  /** Total replications (sum of buyer purchase counts). */
  sales: number
  /** Sats you earned from this group (publisher fees as creator, holder fees as reseller). */
  earnings: number
  /** Unique buyers, newest-first. */
  buyers: BuyerRecord[]
}

/** One sale you were paid on, for time-bucketed stats. */
export interface SaleEvent {
  collectionId: string
  role: 'creator' | 'reseller'
  /** Sats you earned on this sale (the fee output paid to you). */
  feeSats: number
  /** Block height of the sale (0 = unconfirmed/unknown). */
  height: number
  buyerPubKeyHex: string
}

/** One row per actual sale transaction (de-duplicated across roles) — the honest per-sale view. */
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

/**
 * One pass over YOUR address history → your whole sales picture. Every replication pays the publisher fee to
 * the publisher and the holder fee to the source (returning their token on out[0]), so a single scan of your
 * address surfaces both roles: sales of collections you publish (publisherHash == you) and resales where you
 * were the source (out[0] owner == you). Grouped per collection, buyers deduped with counts.
 *
 * Honest limit (as elsewhere): buyers at point of sale; onward transfers aren't visible. Capped to the most
 * recent `maxTxs` history txs (unioned with the mempool-aware UTXO set so unconfirmed sales show immediately).
 */
export async function scanMySales(
  provider: WalletProvider,
  /** `sinceHeight` (curator, incremental): skip candidates CONFIRMED at or below it — return only NEW/unconfirmed
   *  sales, which the caller accumulates idempotently by txId. Unconfirmed (height 0) are always included. */
  params: { myPubKeyHex: string; myHash: string; maxTxs?: number; sinceHeight?: number; onProgress?: (done: number, total: number) => void },
): Promise<MySales> {
  const me = params.myPubKeyHex.toLowerCase()
  const myHash = params.myHash.toLowerCase()
  const cap = params.maxTxs ?? 500
  const since = params.sinceHeight ?? -1
  const candidates = new Map<string, number>()
  let capped = false
  try {
    let hist = await provider.getAddressHistory()
    if (hist.length > cap) { capped = true; hist = hist.slice(hist.length - cap) }
    for (const h of hist) candidates.set(h.txId, h.blockHeight || 0)
  } catch { /* best-effort */ }
  try { for (const u of await provider.getUtxos()) if (!candidates.has(u.txId)) candidates.set(u.txId, 0) } catch { /* best-effort */ }
  // Incremental: drop candidates confirmed at/below the watermark (already counted); keep unconfirmed + newer.
  const entries = [...candidates.entries()].filter(([, h]) => !(since >= 0 && h > 0 && h <= since))

  // ── Pass 1: find sales cheaply. A sale = a replicate tx; the replica is out[1], the source edition is out[0].
  // We only ever fetch those two SMALL outputs (capped) — NEVER the content output [2], which can be tens of MB
  // (a mint's TX1 sits in the publisher's own history). Fees come from the edition's covenant-committed terms,
  // which the miners enforce to equal the paid out[2]/out[3] amounts — so no need to read output satoshis.
  const OUT_CAP = 256 * 1024
  const sales: UnifiedSale[] = []
  let done = 0
  for (const [txId, blockHeight] of entries) {
    params.onProgress?.(done, entries.length); done++
    let hex1: string | 'oversized' | null
    try { hex1 = await provider.getOutputScriptHexCapped(txId, 1, OUT_CAP) } catch { continue }
    if (hex1 == null || hex1 === 'oversized') continue // no replica at out[1] (or it's too big to be one) → not a sale
    let ed: ParsedEdition | null
    try { ed = parseEditionScript(LockingScript.fromHex(hex1)) } catch { continue }
    if (ed == null) continue
    const buyerHex = ed.ownerPubKeyHex
    const cid = ed.tx1RefHex
    const publisherHash = hexOf(ed.terms.publisherPubKeyHash).toLowerCase()
    if (hexOf(hash160Bytes(hexBytes(buyerHex))).toLowerCase() === publisherHash) continue // genesis/self
    const iPublish = publisherHash === myHash
    let iSourced = false
    try {
      const hex0 = await provider.getOutputScriptHexCapped(txId, 0, OUT_CAP)
      if (hex0 != null && hex0 !== 'oversized') { const src = parseEditionScript(LockingScript.fromHex(hex0)); if (src != null && src.ownerPubKeyHex.toLowerCase() === me) iSourced = true }
    } catch { /* out[0] unreadable — treat as not-my-source */ }
    if (!iPublish && !iSourced) continue // a sale, but none of the fees came to me
    const pubCut = ed.terms.publisherFeeSats
    const holdCut = ed.terms.holderFeeSats
    sales.push({ txId, collectionId: cid, buyerPubKeyHex: buyerHex, height: blockHeight || 0, time: 0,
      publisherFeeSats: iPublish ? pubCut : 0, holderFeeSats: iSourced ? holdCut : 0 })
  }
  params.onProgress?.(entries.length, entries.length)

  // ── Pass 2: date each sale (block time). Only the sale txs — a handful — not every candidate.
  await Promise.all(sales.map(async s => { try { const c = await provider.getTxConfirmation(s.txId); if (c?.time) s.time = c.time } catch { /* date best-effort */ } }))

  // ── Derive the role groups (backward-compat: the curator + stats read these) from the de-duplicated sales.
  const creator = new Map<string, Map<string, BuyerRecord>>()
  const reseller = new Map<string, Map<string, BuyerRecord>>()
  const creatorEarn = new Map<string, number>()
  const resellerEarn = new Map<string, number>()
  const events: SaleEvent[] = []
  const bump = (g: Map<string, Map<string, BuyerRecord>>, cid: string, buyerHex: string, h: number): void => {
    let m = g.get(cid); if (m == null) { m = new Map(); g.set(cid, m) }
    const k = buyerHex.toLowerCase(); const rec = m.get(k)
    if (rec != null) { rec.count++; if (h) { rec.lastHeight = Math.max(rec.lastHeight, h); rec.firstHeight = rec.firstHeight ? Math.min(rec.firstHeight, h) : h } }
    else m.set(k, { pubKeyHex: buyerHex, count: 1, firstHeight: h, lastHeight: h })
  }
  const addEarn = (m: Map<string, number>, cid: string, v: number): void => { m.set(cid, (m.get(cid) ?? 0) + v) }
  for (const s of sales) {
    if (s.publisherFeeSats > 0) { bump(creator, s.collectionId, s.buyerPubKeyHex, s.height); addEarn(creatorEarn, s.collectionId, s.publisherFeeSats); events.push({ collectionId: s.collectionId, role: 'creator', feeSats: s.publisherFeeSats, height: s.height, buyerPubKeyHex: s.buyerPubKeyHex }) }
    if (s.holderFeeSats > 0) { bump(reseller, s.collectionId, s.buyerPubKeyHex, s.height); addEarn(resellerEarn, s.collectionId, s.holderFeeSats); events.push({ collectionId: s.collectionId, role: 'reseller', feeSats: s.holderFeeSats, height: s.height, buyerPubKeyHex: s.buyerPubKeyHex }) }
  }
  const toGroups = (g: Map<string, Map<string, BuyerRecord>>, earn: Map<string, number>): SalesGroup[] =>
    [...g.entries()].map(([collectionId, m]) => {
      const buyers = [...m.values()].sort((a, b) => (b.lastHeight || Infinity) - (a.lastHeight || Infinity))
      return { collectionId, sales: buyers.reduce((s, b) => s + b.count, 0), earnings: earn.get(collectionId) ?? 0, buyers }
    }).sort((a, b) => b.sales - a.sales)
  return { sales, asCreator: toGroups(creator, creatorEarn), asReseller: toGroups(reseller, resellerEarn), events, scanned: entries.length, capped }
}
