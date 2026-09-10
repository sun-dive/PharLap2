// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP collection builder (genesis).
 *
 * A collection is created with two transactions (PLAN.md Addendum C):
 *   TX1 (template): a PushDrop TEMPLATE output (+ optional FILE output) committing all
 *        immutable collection data, locked to the publisher and kept unspent. TX1's txid is
 *        the Collection ID.
 *   TX2 (genesis):  PushDrop TOKEN outputs that reference TX1 by txid, locked to the owner.
 *
 * The low-level `buildTemplateTx` / `buildGenesisTx` are pure and offline (they take explicit
 * funding inputs), so the construction is unit-testable without the network. `createCollection`
 * is the network wrapper that selects funding, builds both txs (TX2 funded by TX1's change),
 * and broadcasts them.
 *
 * Reuses the WhatsOnChain client (walletProvider) and the field codec (tokenCodec) over the
 * raw-key PushDrop template (pushDrop). Verification (lineage, covenant match) is Phase 4.
 */
import { Tx } from '../impl/js/transaction.mjs'
import { applyFee, P2PKH_INPUT } from '../impl/js/coins.mjs'
import { Signer, txidToWire } from '../impl/js/signer.mjs'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import { toHex } from '../impl/js/bytes.mjs'

/**
 * ⚠⚠⚠ THIS FILE IS WHERE THE BUILD SHAPE CHANGED, so the two helpers below carry the whole of it.
 *
 *   was                                     now
 *   ──────────────────────────────────────  ─────────────────────────────────────────────────────────
 *   an input holding its parent transaction the outpoint and the value, stated
 *   an output flagged as "the change"       a change output whose value `applyFee` settles
 *   a fee pass that mutates the transaction applyFee(tx, { inputValues, changeVout, satPerKb })
 *   a transaction that signs itself         signFunding(tx, signer, funding)
 *
 * ★ The transaction no longer signs itself from parent transactions it was handed. A BIP-143 signature
 *   commits to a script and an amount the spending transaction does not contain, so those are now
 *   arguments rather than a lookup, and a wrong one is visible at the call site.
 *
 * ⚠ Funding always pays THIS wallet's own address - `getSafeUtxos` reads one address - so the script
 *   being spent is the signer's own locking script. That is why `sourceTx` is no longer needed to sign,
 *   even though the interface still carries it for callers that use it elsewhere.
 */
/**
 * ⚠⚠⚠ 108, AND THE ONE THAT IS ARGUABLY CORRECT IS 107. This was found by byte-identity testing: a
 *   three-input payment came out ONE SATOSHI cheaper than the deployed wallet's, because 107 × 3 and
 *   108 × 3 fall either side of a rounding boundary. One and two input transactions matched exactly, so
 *   nothing short of comparing raw bytes on a multi-input transaction would have shown it.
 *
 *   ★ Why 107 is defensible: we always sign LOW-S, so `s < N/2`, so its top bit is clear and DER never
 *     needs a padding byte for it. That caps a signature at 71 DER + 1 sighash = 72, giving
 *     `1 + 72 + 1 + 33 = 107`. A 108-byte unlocking script cannot occur for a signature we produce.
 *   ⛔ Why we use 108 anyway: it is what is deployed, and matching it keeps every fee identical. The
 *     saving is under a satoshi per input; changing the fee behaviour of a live wallet is not worth it,
 *     and over-estimating a fee is the safe direction while under-estimating silently never confirms.
 */
export const UNLOCK_P2PKH = 108

/** Add the funding UTXOs as unsigned inputs, in order. ★ Shared with the payment path. */
export function addFunding(tx: Tx, funding: FundingInput[]): void {
  for (const f of funding) {
    tx.inputs.push({
      txid: txidToWire(f.utxo.txId), vout: f.utxo.outputIndex,
      script: new Uint8Array(0), sequence: 0xffffffff,
    })
  }
}

/** Sign those inputs. ⚠ They are inputs 0..n-1; anything else in the transaction signs itself. */
/**
 * ⚠⚠ `firstInput` EXISTS BECAUSE FUNDING IS NOT ALWAYS AT INDEX 0. A covenant spend puts the covenant
 *   input first and the payer's funding after it. Signing `tx.inputs[i]` for funding entry `i` would
 *   then sign the COVENANT input with a P2PKH unlock and leave the real funding input empty.
 * ⛔ The failure is not loud: the transaction serializes, broadcasts, and is rejected by the network for
 *   a bad script — with nothing locally to say the indexes were off by one. Hence the parameter, and
 *   hence it is required to be correct rather than inferred.
 */
export function signFunding(tx: Tx, signer: Signer, funding: FundingInput[], firstInput = 0): void {
  const script = signer.lockingScript()
  funding.forEach((f, i) => {
    const at = firstInput + i
    if (tx.inputs[at] === undefined) throw new Error(`signFunding: no input at ${at} (funding entry ${i})`)
    tx.inputs[at].script = signer.unlockP2PKH(tx, at, script, f.utxo.satoshis)
  })
}
import type { Utxo, WalletProvider } from './walletProvider.ts'
import {
  buildTemplateScript,
  buildFileScript,
  buildStorefrontScript,
  buildTokenScript,
  encodeTokenRules,
  classifyRecord,
  RESTRICTION_ENCRYPTED,
  RESTRICTION_COMPRESSED,
  buildMockupScript,
} from './tokenCodec.ts'
import type { TemplateFields, FileFields, StorefrontFields } from './tokenCodec.ts'
import { compressIfSmaller } from './compress.ts'
import { newContentKey, newKeySalt, encryptContent, wrapContentKey } from './contentCrypto.ts'

/** Satoshi value of each PushDrop record output (token / template / file). */
export const PHARLAP_OUTPUT_SATS = 1
/** Default fee rate (satoshis per kilobyte) — current BSV standard is 100 sat/KB. */
// 101, not 100: the official minimum is 100 sats/KB, and the extra 1 sat/KB is a safety hair so a tx can never
// round or estimate its way *under* the floor. This is NOT ARC's inflated 500 — we hold at the true minimum
// (miners mine 100 sats/KB fine; see [[fee-rate-policy]]); the +1 is belt-and-braces only.
export const DEFAULT_FEE_PER_KB = 101

export interface FundingInput {
  utxo: Utxo
  /** ⚠ No longer needed to SIGN - the script and amount are passed explicitly. Kept for callers. */
  sourceTx?: Tx
}

// ─── Funding selection / quarantine ─────────────────────────────────

/**
 * Funding UTXOs safe to spend: never spend a PHAR LAP record output as fee funding.
 * All PHAR LAP outputs are PHARLAP_OUTPUT_SATS (1 sat), so the ≤1-sat quarantine protects
 * them (and any other ≤1-sat token/ordinal). A script-aware quarantine (classifyRecord) is a
 * Phase 5 hardening once UTXO scripts are available from the provider.
 */
export async function getSafeUtxos(provider: WalletProvider): Promise<Utxo[]> {
  const utxos = await provider.getUtxos()
  return utxos.filter(u => u.satoshis > PHARLAP_OUTPUT_SATS)
}

/** Greedy funding selection (largest first) covering `target` satoshis. */
export function selectFunding(utxos: Utxo[], target: number): Utxo[] {
  const sorted = [...utxos].sort((a, b) => b.satoshis - a.satoshis)
  const picked: Utxo[] = []
  let total = 0
  for (const u of sorted) {
    picked.push(u)
    total += u.satoshis
    if (total >= target) return picked
  }
  throw new Error(`Insufficient funds: have ${total} sats, need ~${target}`)
}

/** SHA-256(bytes) as hex — used for the optional template fileHash. */
export function sha256Hex(bytes: number[]): string {
  return toHex(nobleSha256(Uint8Array.from(bytes)))
}

// ─── TX1: template (+ optional file) ────────────────────────────────

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
}): Promise<TemplateTxResult> {
  const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS
  const publisherPub = toHex(opts.key.publicKey())
  const tx = new Tx(1, [], [], 0)

  addFunding(tx, opts.funding)

  tx.outputs.push({ value: sats, script: buildTemplateScript(publisherPub, opts.template).toBinary() })
  const templateVout = 0
  let fileVout: number | null = null
  if (opts.file) {
    fileVout = tx.outputs.length
    tx.outputs.push({ value: sats, script: buildFileScript(publisherPub, opts.file).toBinary() })
  }
  let storefrontVout: number | null = null
  if (opts.storefront) {
    storefrontVout = tx.outputs.length
    tx.outputs.push({ value: sats, script: buildStorefrontScript(publisherPub, opts.storefront).toBinary() })
  }
  let mockupVout: number | null = null
  if (opts.mockup != null && opts.mockup.length > 0) {
    mockupVout = tx.outputs.length
    tx.outputs.push({ value: sats, script: buildMockupScript(publisherPub, opts.mockup).toBinary() })
  }

  // ⚠ value 0 for now: `applyFee` settles it once the size is known. The output is always PRESENT,
  //   never dropped as dust - measured against the deployed behaviour, which keeps it too.
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
  return {
    tx,
    tx1Id: tx.txid(),
    templateVout,
    fileVout,
    storefrontVout,
    mockupVout,
    changeVout: changeSats > 0 ? changeVout : null,
    changeSats,
  }
}

// ─── TX2: genesis mint ──────────────────────────────────────────────

export interface GenesisTxResult {
  tx: Tx
  tx2Id: string
  tokenVouts: number[]
  changeVout: number | null
  changeSats: number
}

export async function buildGenesisTx(opts: {
  key: Signer
  funding: FundingInput[]
  tx1Id: string
  mintCount: number
  stateData?: string
  outputSats?: number
  feePerKb?: number
}): Promise<GenesisTxResult> {
  if (opts.mintCount < 1) throw new Error('mintCount must be >= 1')
  const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS
  const ownerPub = toHex(opts.key.publicKey())
  const stateData = opts.stateData ?? ''
  const tx = new Tx(1, [], [], 0)

  addFunding(tx, opts.funding)

  const tokenVouts: number[] = []
  for (let i = 0; i < opts.mintCount; i++) {
    tokenVouts.push(tx.outputs.length)
    tx.outputs.push({
      value: sats,
      script: buildTokenScript(ownerPub, { tx1Ref: opts.tx1Id, stateData }).toBinary(),
    })
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
  return {
    tx,
    tx2Id: tx.txid(),
    tokenVouts,
    changeVout: changeSats > 0 ? changeVout : null,
    changeSats,
  }
}

// ─── createCollection: build both + broadcast ───────────────────────

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

/** Thrown by a builder when the caller's confirmSpend gate returns false — nothing was broadcast. */
export const SPEND_CANCELLED = 'SPEND_CANCELLED'

/** Net sats leaving the wallet for a flow = the selected funding minus the final change output. */
export function spentSats(selected: Array<{ satoshis: number }>, finalChangeSats: number): number {
  return selected.reduce((s, u) => s + u.satoshis, 0) - finalChangeSats
}

export interface CollectionResult {
  collectionId: string // = tx1Id
  tx1Id: string
  tx2Id: string
  tokenOutpoints: Array<{ txId: string; outputIndex: number }>
}

export async function createCollection(
  provider: WalletProvider,
  key: Signer,
  params: CollectionParams,
): Promise<CollectionResult> {
  const sats = params.outputSats ?? PHARLAP_OUTPUT_SATS
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const supply = params.supply ?? 1
  const mintCount = params.mintCount ?? (supply > 0 ? supply : 1)

  // Smart-compress (keep only if smaller), then optionally Tier-1 encrypt. Order matters: compress BEFORE
  // encrypt (ciphertext is incompressible). The FILE output stores the final bytes; fileHash binds them.
  // Unlike the covenant edition path this does NOT set RESTRICTION_REPLICABLE — a capped/limited mint has a
  // fixed supply, not unlimited replication.
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
      storedBytes = encryptContent(storedBytes, K)
      wrappedKey = wrapContentKey(K, keySalt)
    }
  }
  const restrictions = (params.restrictions ?? 0) | (encrypt ? RESTRICTION_ENCRYPTED : 0) | (compressed ? RESTRICTION_COMPRESSED : 0)

  const template: TemplateFields = {
    tokenName: params.tokenName,
    tokenRules: encodeTokenRules(supply, params.divisibility ?? 0, restrictions, params.rulesVersion ?? 1),
    covenantScript: params.covenantScript ?? '',
    // PUBLIC content binds the plaintext hash (provenance); ENCRYPTED content binds the ciphertext hash (privacy —
    // a public plaintext hash would be a confirmation oracle). Mirrors the edition path.
    fileHash: params.file == null ? undefined : encrypt ? sha256Hex(storedBytes!) : sha256Hex(params.file.bytes),
    wrappedKey,
    keySalt,
    license: params.license,
    licenseRef: params.licenseRef,
  }
  const file: FileFields | undefined = params.file
    ? { mimeType: params.file.mimeType, fileName: params.file.fileName, fileBytes: storedBytes! }
    : undefined

  // Immutable storefront record (description + optional public cover/back-cover), carried as a TX1 output — the
  // public "what you're buying" face, shown even when the content is encrypted. For paid designs the cover is the
  // WATERMARKED PREVIEW (the clean product stays encrypted in the FILE output).
  const hasStorefront = (params.description != null && params.description.length > 0) || params.cover != null
  const storefront: StorefrontFields | undefined = hasStorefront
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

  // Select funding to cover BOTH txs' outputs + fees (applyFee computes exact fees afterwards;
  // selection just needs to pick enough UTXOs, and TX1 must leave enough change to fund TX2).
  // TX1 carries any embedded file, so its fee scales with file size — keep a healthy margin so a
  // large file never eats all the funding and starves the genesis mint.
  const numOutputs = 1 + (file ? 1 : 0) + (storefront ? 1 : 0) + (params.mockupManifest?.length ? 1 : 0) + mintCount
  const tx1Bytes = 400 + (file ? file.fileBytes.length : 0)
    + (params.cover ? params.cover.bytes.length : 0)
    + (params.backCover ? params.backCover.bytes.length : 0)
  const tx2Bytes = 300 + mintCount * 80
  const estFee = Math.ceil(((tx1Bytes + tx2Bytes) * feePerKb) / 1000)
  // Margin: 10% of the estimate (absorbs file-encoding overhead on big files) or 1000 sat, whichever larger.
  const target = numOutputs * sats + estFee + Math.max(1000, Math.ceil(estFee * 0.1))
  const selected = selectFunding(await getSafeUtxos(provider), target)
  // ★★ ONE NETWORK CALL PER INPUT SAVED, and it is the shape change that removes them. The parent
  //   transactions were fetched only so the signer could read the script and the amount back out of
  //   them; both are now passed explicitly, so nothing needs the parents at all. On a mint funded by
  //   several UTXOs that is several fewer round trips before anything can be signed.
  const funding: FundingInput[] = selected.map(u => ({ utxo: u }))

  // Build BOTH transactions offline first. Only broadcast once both succeed, so a failure (e.g.
  // insufficient change for the genesis mint) never leaves an orphaned template tx on-chain.
  const t1 = await buildTemplateTx({ key, funding, template, file, storefront, mockup: params.mockupManifest, outputSats: sats, feePerKb })
  if (t1.changeVout == null) {
    throw new Error('Insufficient funding: the template tx left no change to fund the genesis mint. Add more funds.')
  }
  const t2Funding: FundingInput[] = [
    {
      utxo: { txId: t1.tx1Id, outputIndex: t1.changeVout, satoshis: t1.changeSats, script: '' },
    },
  ]
  const t2 = await buildGenesisTx({
    key,
    funding: t2Funding,
    tx1Id: t1.tx1Id,
    mintCount,
    stateData: params.initialStateData ?? '',
    outputSats: sats,
    feePerKb,
  })

  // Spend gate (exact total now known): give the caller a chance to confirm before any sats move.
  if (params.confirmSpend != null && !(await params.confirmSpend(spentSats(selected, t2.changeSats)))) {
    throw new Error(SPEND_CANCELLED)
  }

  // Both built — broadcast TX1, wait until it's actually visible in a relay mempool, THEN TX2 (which spends TX1's
  // change). The awaitSeen gate stops TX2 racing ahead of its unconfirmed parent → "Missing inputs"; it throws
  // (aborting) if TX1 never surfaces, so there's no orphaned TX2. See walletProvider.awaitInMempool.
  await provider.broadcast(t1.tx.hex(), { awaitSeen: true })
  provider.registerPendingTx(
    t1.tx1Id,
    selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    { outputIndex: t1.changeVout, satoshis: t1.changeSats },
  )
  await provider.broadcast(t2.tx.hex())
  provider.registerPendingTx(
    t2.tx2Id,
    [{ txId: t1.tx1Id, outputIndex: t1.changeVout }],
    t2.changeVout != null ? { outputIndex: t2.changeVout, satoshis: t2.changeSats } : undefined,
  )

  return {
    collectionId: t1.tx1Id,
    tx1Id: t1.tx1Id,
    tx2Id: t2.tx2Id,
    tokenOutpoints: t2.tokenVouts.map(v => ({ txId: t2.tx2Id, outputIndex: v })),
  }
}

// Re-export for convenience at call sites.
export { classifyRecord }
