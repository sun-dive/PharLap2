// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP plain BSV payments — an ordinary P2PKH spend to an address.
 *
 * Distinct from token/edition transfers: this moves *sats* (not a covenant UTXO) to any standard
 * BSV address, with change returning to the wallet. Layout:
 *
 *   Input 0+  : funding UTXOs   (P2PKH — owner's signature)
 *   Output 0  : recipient       (P2PKH → toAddress; the amount, or the whole balance if sendMax)
 *   Output 1  : change          (P2PKH → self; omitted when sendMax leaves nothing over)
 *
 * `buildPaymentTx` is pure/offline (explicit funding) so it can be unit-tested AND re-run by the
 * air-gapped signer to reproduce the exact tx the online wallet would have built. `sendPayment` is
 * the network wrapper (gather funding → build → broadcast).
 */
import { Tx } from '../impl/js/transaction.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import type { Signer } from '../impl/js/signer.mjs'
import type { WalletProvider } from './walletProvider.ts'
import { DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, addFunding, signFunding, UNLOCK_P2PKH } from './collectionBuilder.ts'
import type { FundingInput } from './collectionBuilder.ts'

export interface PaymentTxResult {
  tx: Tx
  txId: string
  /** Sats delivered to the recipient (after the fee, when sendMax). */
  sentSats: number
  changeVout: number | null
  changeSats: number
}

/** Throws if `addr` isn't a valid P2PKH address (cheap pre-flight before building). */
export function assertValidAddress(addr: string): void {
  // ⚠ Validates by DECODING - checksum, payload length and version byte. A typo fails HERE rather than
  //   producing a transaction that pays a script nobody can ever spend.
  try { scriptForAddress(addr) } catch { throw new Error('Invalid BSV address') }
}

export async function buildPaymentTx(opts: {
  key: Signer
  toAddress: string
  /** Amount to send, in sats. Ignored when `sendMax` is set. */
  amountSats: number
  /** Sweep the entire funding (minus fee) to the recipient — no change output. */
  sendMax?: boolean
  funding: FundingInput[]
  feePerKb?: number
}): Promise<PaymentTxResult> {
  assertValidAddress(opts.toAddress)
  if (opts.funding.length === 0) throw new Error('No spendable funds')
  if (!opts.sendMax && (!Number.isFinite(opts.amountSats) || opts.amountSats < 1)) {
    throw new Error('Enter an amount of at least 1 sat')
  }
  const toScript = scriptForAddress(opts.toAddress)
  const tx = new Tx(1, [], [], 0)
  addFunding(tx, opts.funding)

  // ★★ `absorbVout` is the output that takes whatever is left after the fee. For an ordinary payment
  //   that is our own change; for sendMax it is the RECIPIENT, which is what sweeps the wallet. Same
  //   mechanism, two meanings - and stating it that way is why one call covers both.
  let changeVout: number | null = null
  let absorbVout: number
  if (opts.sendMax) {
    absorbVout = 0
    tx.outputs.push({ value: 0, script: toScript })
  } else {
    tx.outputs.push({ value: opts.amountSats, script: toScript })
    changeVout = tx.outputs.length
    absorbVout = changeVout
    tx.outputs.push({ value: 0, script: opts.key.lockingScript() })
  }

  applyFee(tx, {
    inputValues: opts.funding.map(f => f.utxo.satoshis),
    unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
    changeVout: absorbVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  signFunding(tx, opts.key, opts.funding)

  const sentSats = opts.sendMax ? (tx.outputs[0]?.value ?? 0) : opts.amountSats
  if (sentSats < 1) throw new Error('Funds too small to cover the network fee')
  const changeSats = changeVout != null ? (tx.outputs[changeVout]?.value ?? 0) : 0
  return { tx, txId: tx.txid(), sentSats, changeVout: changeSats > 0 ? changeVout : null, changeSats }
}

/** Gather funding for a payment: everything (sendMax) or enough to cover amount + fee headroom. */
export async function gatherPaymentFunding(
  provider: WalletProvider,
  opts: { amountSats: number; sendMax?: boolean; feePerKb?: number },
): Promise<FundingInput[]> {
  const safe = await getSafeUtxos(provider)
  // ~200 B base + ~148 B/input; headroom is generous (change absorbs the slack).
  const feeHeadroom = Math.ceil((400 * (opts.feePerKb ?? DEFAULT_FEE_PER_KB)) / 1000) + 200
  const selected = opts.sendMax ? safe : selectFunding(safe, opts.amountSats + feeHeadroom)
  // ★ No parent transactions fetched: the script and amount are stated when signing, so a payment now
  //   costs one UTXO query rather than one query plus a fetch per input.
  return selected.map(u => ({ utxo: u }))
}

export async function sendPayment(
  provider: WalletProvider,
  key: Signer,
  opts: { toAddress: string; amountSats: number; sendMax?: boolean; feePerKb?: number },
): Promise<PaymentTxResult> {
  const funding = await gatherPaymentFunding(provider, opts)
  const result = await buildPaymentTx({ key, funding, ...opts })
  await provider.broadcast(result.tx.hex())
  provider.registerPendingTx(
    result.txId,
    funding.map(f => ({ txId: f.utxo.txId, outputIndex: f.utxo.outputIndex })),
    result.changeVout != null ? { outputIndex: result.changeVout, satoshis: result.changeSats } : undefined,
  )
  return result
}
