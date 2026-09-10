// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP transfers + ownership detection.
 *
 * A transfer spends a token PushDrop (Input 0, via pushDrop.unlockScript) and recreates an
 * equivalent token PushDrop locked to the recipient — constant-size, no proof cargo
 * (lineage is implicit: the parent is Input 0; see PLAN.md Addendum C/D).
 *
 *   Input 0   : token UTXO            (pushDrop.unlockScript — owner's signature)
 *   Input 1+  : funding UTXOs         (P2PKH)
 *   Output 0  : recipient token       (PushDrop, same tx1Ref, locked to recipient pubkey)
 *   Output 1  : notification (opt.)   (P2PKH, 1 sat, to recipient's address — discovery breadcrumb)
 *   Output 2+ : change                (P2PKH)
 *
 * The notification output makes the transfer discoverable by the recipient's address scan
 * (PushDrop outputs themselves are not WoC-address-indexed; 1 sat is the minimum standard,
 * address-indexed value — see PLAN.md Addendum D). It is default-on but optional.
 *
 * `buildTransferTx` is pure/offline (explicit funding) for unit testing; `createTransfer`
 * is the network wrapper.
 */
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { txidToWire } from '../impl/js/signer.mjs'
import type { Signer } from '../impl/js/signer.mjs'
import { addressFromPubHex } from './bytes.ts'
import { unlockScript as pushDropUnlock, UNLOCK_SIZE as PUSHDROP_UNLOCK } from './pushDrop.ts'
import { buildTokenScript, parseTokenScript } from './tokenCodec.ts'
import type { TokenFields } from './tokenCodec.ts'
import type { WalletProvider } from './walletProvider.ts'
import {
  PHARLAP_OUTPUT_SATS,
  DEFAULT_FEE_PER_KB,
  getSafeUtxos,
  selectFunding,
  addFunding,
  signFunding,
  UNLOCK_P2PKH,
} from './collectionBuilder.ts'
import type { FundingInput } from './collectionBuilder.ts'

export interface TransferTxResult {
  tx: Tx
  txId: string
  recipientVout: number
  notifyVout: number | null
  /** Index of the optional 1-sat publisher-notification output (collection-tracking), or null. */
  publisherNotifyVout: number | null
  changeVout: number | null
  changeSats: number
  tokenFields: TokenFields
}

export async function buildTransferTx(opts: {
  key: Signer
  tokenOutputIndex: number
  tokenSourceTx: Tx
  recipientPubKeyHex: string
  funding: FundingInput[]
  /** Optional updated mutable state; defaults to carrying the existing stateData forward. */
  newStateData?: string
  /** Add a 1-sat P2PKH notification output to the recipient's address. Default true. */
  notify?: boolean
  /**
   * Add a 1-sat P2PKH notification to the publisher's address so the publisher can track the
   * current holder (RESTRICTION_TRACK_TRANSFERS / Addendum E). Requires publisherPubKeyHex.
   * Off by default — private unless the collection opts into tracking.
   */
  notifyPublisher?: boolean
  /** Publisher's public key (the TX1 template lock key); required when notifyPublisher is set. */
  publisherPubKeyHex?: string
  outputSats?: number
  feePerKb?: number
}): Promise<TransferTxResult> {
  const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS
  const notify = opts.notify ?? true

  const tokenOut = opts.tokenSourceTx.outputs[opts.tokenOutputIndex]
  const parsed = tokenOut ? parseTokenScript(LockingScript.fromBinary(tokenOut.script)) : null
  if (!parsed || !tokenOut) throw new Error('buildTransferTx: source output is not a PHAR LAP token')
  const tokenFields: TokenFields = {
    tx1Ref: parsed.fields.tx1Ref,
    stateData: opts.newStateData ?? parsed.fields.stateData,
  }

  const tx = new Tx(1, [], [], 0)
  // Input 0: the token UTXO, spent via the PushDrop owner key.
  tx.inputs.push({
    txid: txidToWire(opts.tokenSourceTx.txid()), vout: opts.tokenOutputIndex,
    script: new Uint8Array(0), sequence: 0xffffffff,
  })
  // Funding inputs.
  addFunding(tx, opts.funding)

  // Output 0: recipient token (PushDrop locked to recipient pubkey).
  tx.outputs.push({ value: sats, script: buildTokenScript(opts.recipientPubKeyHex, tokenFields).toBinary() })
  const recipientVout = 0

  // Output 1 (optional): 1-sat P2PKH notification to the recipient's address (discovery breadcrumb).
  let notifyVout: number | null = null
  if (notify) {
    const recipientAddress = addressFromPubHex(opts.recipientPubKeyHex)
    notifyVout = tx.outputs.length
    tx.outputs.push({ value: 1, script: scriptForAddress(recipientAddress) })
  }

  // Optional: 1-sat P2PKH notification to the publisher (collection transfer-tracking).
  let publisherNotifyVout: number | null = null
  if (opts.notifyPublisher) {
    if (opts.publisherPubKeyHex == null) {
      throw new Error('buildTransferTx: notifyPublisher requires publisherPubKeyHex')
    }
    const publisherAddress = addressFromPubHex(opts.publisherPubKeyHex)
    publisherNotifyVout = tx.outputs.length
    tx.outputs.push({ value: 1, script: scriptForAddress(publisherAddress) })
  }

  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: opts.key.lockingScript() })

  applyFee(tx, {
    inputValues: [tokenOut.value, ...opts.funding.map(f => f.utxo.satoshis)],
    unlockingSizes: [PUSHDROP_UNLOCK, ...opts.funding.map(() => UNLOCK_P2PKH)],
    changeVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  tx.inputs[0].script = pushDropUnlock(opts.key.d, tx, 0, tokenOut.script, tokenOut.value).toBinary()
  signFunding(tx, opts.key, opts.funding, 1)

  const changeSats = tx.outputs[changeVout]?.value ?? 0
  return {
    tx,
    txId: tx.txid(),
    recipientVout,
    notifyVout,
    publisherNotifyVout,
    changeVout: changeSats > 0 ? changeVout : null,
    changeSats,
    tokenFields,
  }
}

export async function createTransfer(
  provider: WalletProvider,
  key: Signer,
  opts: {
    tokenTxId: string
    tokenOutputIndex: number
    recipientPubKeyHex: string
    newStateData?: string
    notify?: boolean
    notifyPublisher?: boolean
    publisherPubKeyHex?: string
    outputSats?: number
    feePerKb?: number
  },
): Promise<TransferTxResult> {
  const tokenSourceTx = await provider.getSourceTransaction(opts.tokenTxId)
  // Small fee headroom: a transfer is ~500 bytes; the 1-sat token input also contributes.
  const feeHeadroom = Math.ceil((500 * (opts.feePerKb ?? DEFAULT_FEE_PER_KB)) / 1000) + 200
  const selected = selectFunding(await getSafeUtxos(provider), feeHeadroom)
  const funding: FundingInput[] = selected.map(u => ({ utxo: u }))

  const result = await buildTransferTx({
    key,
    tokenOutputIndex: opts.tokenOutputIndex,
    tokenSourceTx,
    recipientPubKeyHex: opts.recipientPubKeyHex,
    funding,
    newStateData: opts.newStateData,
    notify: opts.notify,
    notifyPublisher: opts.notifyPublisher,
    publisherPubKeyHex: opts.publisherPubKeyHex,
    outputSats: opts.outputSats,
    feePerKb: opts.feePerKb,
  })

  await provider.broadcast(result.tx.hex())
  provider.registerPendingTx(
    result.txId,
    [
      { txId: opts.tokenTxId, outputIndex: opts.tokenOutputIndex },
      ...selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    ],
    result.changeVout != null ? { outputIndex: result.changeVout, satoshis: result.changeSats } : undefined,
  )
  return result
}

// ─── Ownership detection ────────────────────────────────────────────

/**
 * Find the token outputs of a transaction that are locked to `ownerPubKeyHex`. The token stores
 * the owner's full public key in its PushDrop lock, so this is an exact match. Used both to read
 * one's own tokens and to extract the token(s) from a notifying tx during an incoming scan.
 */
export function findOwnedTokenOutputs(
  tx: Tx,
  ownerPubKeyHex: string,
): Array<{ outputIndex: number; fields: TokenFields }> {
  const found: Array<{ outputIndex: number; fields: TokenFields }> = []
  tx.outputs.forEach((o: { script: Uint8Array }, i: number) => {
    const parsed = parseTokenScript(LockingScript.fromBinary(o.script))
    if (parsed != null && parsed.ownerPubKeyHex === ownerPubKeyHex) {
      found.push({ outputIndex: i, fields: parsed.fields })
    }
  })
  return found
}

export interface IncomingToken {
  txId: string
  outputIndex: number
  fields: TokenFields
}

/**
 * Scan the wallet's address history for incoming tokens. The notification outputs make the
 * carrying transactions show up under the owner's address; we then parse each tx for token
 * outputs locked to our pubkey. Verification (lightweight lineage) is the caller's
 * responsibility (see verify.ts) before trusting/recording a result.
 */
export async function scanIncoming(
  provider: WalletProvider,
  myPubKeyHex: string,
): Promise<IncomingToken[]> {
  // Candidate txs: confirmed address history PLUS the txids of current UTXOs at our address.
  // The latter is mempool-aware (getUtxos includes unconfirmed), so the 1-sat notification
  // output of an incoming transfer surfaces the carrying tx immediately, before it confirms.
  const candidateTxIds = new Set<string>()
  try {
    for (const { txId } of await provider.getAddressHistory()) candidateTxIds.add(txId)
  } catch { /* history is best-effort */ }
  try {
    for (const u of await provider.getUtxos()) candidateTxIds.add(u.txId)
  } catch { /* utxos best-effort */ }

  const found: IncomingToken[] = []
  for (const txId of candidateTxIds) {
    let tx: Tx
    try {
      tx = await provider.getSourceTransaction(txId)
    } catch {
      continue
    }
    for (const { outputIndex, fields } of findOwnedTokenOutputs(tx, myPubKeyHex)) {
      found.push({ txId, outputIndex, fields })
    }
  }
  return found
}
