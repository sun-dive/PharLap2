# src/airgap.js

PHAR LAP air-gapped signing (Phase 1a — file-based).

The online/watch machine never has the private key; it gathers the on-chain inputs for an action (the
edition UTXO + its source tx, any funding UTXOs + source txs) and packages a **signing request**. The
offline machine imports it and re-runs the SAME validated builder (`buildEditionTransferTx` /
`buildEditionBurnTx`) with its key — these builders are pure given their inputs (no network) and build the
tx deterministically, so the cold-built signed tx is the canonical one. The online side just broadcasts it.

Crossing the gap: a JSON request (online → offline) and a raw signed tx (offline → online) — files only,
never the key. Source txs travel inside the request so the offline signer has every input's value + script.

## AirgapAction

```ts
export type AirgapAction = 'transfer' | 'burn' | 'payment'
```

## AirgapInput

```ts
interface AirgapInput { txId: string; outputIndex: number; satoshis: number; sourceTxHex: string }
```

## AirgapRequest

```ts
export interface AirgapRequest {
  v: number
  action: AirgapAction
  /** The edition being spent (transfer/burn only): outpoint, bond value, its lock, and its source tx. */
  edition?: AirgapInput & { lockHex: string }
  /** transfer: the recipient's 33-byte pubkey (hex). */
  newOwnerPubKeyHex?: string
  /** transfer: optional seller note to carry to the new owner. */
  note?: SellerNote
  /** payment: a plain BSV P2PKH spend to an address. */
  payment?: { toAddress: string; amountSats: number; sendMax?: boolean }
  /** P2PKH funding inputs for the fee (transfer) or the whole spend (payment) — owner-signed offline. */
  funding?: AirgapInput[]
  feePerKb?: number
  /** Human-readable summary for the offline signer to confirm before signing (not trusted — re-derived). */
  summary?: string
}
```

What crosses the gap online → offline. Carries everything the offline builder needs — but no key.

## AirgapFunding

```ts
export type AirgapFunding = FundingInput & { sourceTx: Tx }
```

A funding input together with the transaction that created it; the request carries that transaction.

## buildAirgapRequest

```ts
export function buildAirgapRequest(
  action: AirgapAction,
  edition: EditionUtxo & { sourceTx: Tx },
  opts: { newOwnerPubKeyHex?: string; note?: SellerNote; funding?: AirgapFunding[]; feePerKb?: number; summary?: string } = {},
): AirgapRequest
```

Build the request on the WATCH side. The caller gathers `edition` (with its sourceTx) + `funding` via the
 provider; this just serializes them — no key involved.

## buildAirgapPaymentRequest

```ts
export function buildAirgapPaymentRequest(
  opts: { toAddress: string; amountSats: number; sendMax?: boolean; funding: AirgapFunding[]; feePerKb?: number; summary?: string },
): AirgapRequest
```

Build a plain-BSV-payment request on the WATCH side. The caller gathers the P2PKH `funding` via the
 provider; this just serializes it — no key involved.

## fundingFromRequest

```ts
function fundingFromRequest(req: AirgapRequest): AirgapFunding[]
```

Rebuild the FundingInput[] (utxo + parsed source tx) carried in a request.

## signAirgapRequest

```ts
export async function signAirgapRequest(req: AirgapRequest, key: Signer): Promise<{ txId: string; rawTx: string }>
```

OFFLINE side: sign a request with the key, returning the signed raw tx. Re-runs the canonical builder, so the
signed tx is identical to what the online wallet would have produced. Refuses to sign inputs this key doesn't
own (the cold signer's sanity check).

At `const mine = toHex(key.lockingScript())`:

Sanity check: every funding input must pay to this wallet's address (else the sigs would be invalid).

## encodeAirgapRequest

```ts
export function encodeAirgapRequest(req: AirgapRequest): string
```

── File (de)serialization ──────────────────────────────────────────

## decodeAirgapRequest

```ts
export function decodeAirgapRequest(json: string): AirgapRequest
```
