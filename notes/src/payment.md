# src/payment.js

PHAR LAP plain BSV payments — an ordinary P2PKH spend to an address.

Distinct from token/edition transfers: this moves *sats* (not a covenant UTXO) to any standard
BSV address, with change returning to the wallet. Layout:

  Input 0+  : funding UTXOs   (P2PKH — owner's signature)
  Output 0  : recipient       (P2PKH → toAddress; the amount, or the whole balance if sendMax)
  Output 1  : change          (P2PKH → self; omitted when sendMax leaves nothing over)

`buildPaymentTx` is pure/offline (explicit funding) so it can be unit-tested AND re-run by the
air-gapped signer to reproduce the exact tx the online wallet would have built. `sendPayment` is
the network wrapper (gather funding → build → broadcast).

## PaymentTxResult

```ts
export interface PaymentTxResult {
  tx: Tx
  txId: string
  /** Sats delivered to the recipient (after the fee, when sendMax). */
  sentSats: number
  changeVout: number | null
  changeSats: number
}
```

## assertValidAddress

```ts
export function assertValidAddress(addr: string): void
```

Throws if `addr` isn't a valid P2PKH address (cheap pre-flight before building).

At `try { scriptForAddress(addr) } catch { throw new Error('Invalid BSV address') }`:

⚠ Validates by DECODING - checksum, payload length and version byte. A typo fails HERE rather than
  producing a transaction that pays a script nobody can ever spend.

## buildPaymentTx

```ts
export async function buildPaymentTx(opts: {
  key: Signer
  toAddress: string
  /** Amount to send, in sats. Ignored when `sendMax` is set. */
  amountSats: number
  /** Sweep the entire funding (minus fee) to the recipient — no change output. */
  sendMax?: boolean
  funding: FundingInput[]
  feePerKb?: number
}): Promise<PaymentTxResult>
```

At `let changeVout = null`:

★★ `absorbVout` is the output that takes whatever is left after the fee. For an ordinary payment
  that is our own change; for sendMax it is the RECIPIENT, which is what sweeps the wallet. Same
  mechanism, two meanings - and stating it that way is why one call covers both.

## gatherPaymentFunding

```ts
export async function gatherPaymentFunding(
  provider: WalletProvider,
  opts: { amountSats: number; sendMax?: boolean; feePerKb?: number },
): Promise<FundingInput[]>
```

Gather funding for a payment: everything (sendMax) or enough to cover amount + fee headroom.

At `const feeHeadroom = Math.ceil((400 * (opts.feePerKb ?? DEFAULT_FEE_PER_KB)) / 1000) + 200`:

~200 B base + ~148 B/input; headroom is generous (change absorbs the slack).

At `return selected.map(u => ({ utxo: u }))`:

★ No parent transactions fetched: the script and amount are stated when signing, so a payment now
  costs one UTXO query rather than one query plus a fetch per input.

## sendPayment

```ts
export async function sendPayment(
  provider: WalletProvider,
  key: Signer,
  opts: { toAddress: string; amountSats: number; sendMax?: boolean; feePerKb?: number },
): Promise<PaymentTxResult>
```
