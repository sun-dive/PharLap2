# src/transfer.js

PHAR LAP transfers + ownership detection.

A transfer spends a token PushDrop (Input 0, via pushDrop.unlockScript) and recreates an
equivalent token PushDrop locked to the recipient — constant-size, no proof cargo
(lineage is implicit: the parent is Input 0; see PLAN.md Addendum C/D).

  Input 0   : token UTXO            (pushDrop.unlockScript — owner's signature)
  Input 1+  : funding UTXOs         (P2PKH)
  Output 0  : recipient token       (PushDrop, same tx1Ref, locked to recipient pubkey)
  Output 1  : notification (opt.)   (P2PKH, 1 sat, to recipient's address — discovery breadcrumb)
  Output 2+ : change                (P2PKH)

The notification output makes the transfer discoverable by the recipient's address scan
(PushDrop outputs themselves are not WoC-address-indexed; 1 sat is the minimum standard,
address-indexed value — see PLAN.md Addendum D). It is default-on but optional.

`buildTransferTx` is pure/offline (explicit funding) for unit testing; `createTransfer`
is the network wrapper.

## TransferTxResult

```ts
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
```

## buildTransferTx

```ts
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
}): Promise<TransferTxResult>
```

At `tx.inputs.push({`:

Input 0: the token UTXO, spent via the PushDrop owner key.

At `addFunding(tx, opts.funding)`:

Funding inputs.

At `tx.outputs.push({ value: sats, script: buildTokenScript(opts.recipientPubKeyHex, tokenFields).toB...`:

Output 0: recipient token (PushDrop locked to recipient pubkey).

At `let notifyVout = null`:

Output 1 (optional): 1-sat P2PKH notification to the recipient's address (discovery breadcrumb).

At `let publisherNotifyVout = null`:

Optional: 1-sat P2PKH notification to the publisher (collection transfer-tracking).

## createTransfer

```ts
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
): Promise<TransferTxResult>
```

At `const feeHeadroom = Math.ceil((500 * (opts.feePerKb ?? DEFAULT_FEE_PER_KB)) / 1000) + 200`:

Small fee headroom: a transfer is ~500 bytes; the 1-sat token input also contributes.

## findOwnedTokenOutputs

```ts
export function findOwnedTokenOutputs(
  tx: Tx,
  ownerPubKeyHex: string,
): Array<{ outputIndex: number; fields: TokenFields }>
```

─── Ownership detection ────────────────────────────────────────────

Find the token outputs of a transaction that are locked to `ownerPubKeyHex`. The token stores
the owner's full public key in its PushDrop lock, so this is an exact match. Used both to read
one's own tokens and to extract the token(s) from a notifying tx during an incoming scan.

## IncomingToken

```ts
export interface IncomingToken {
  txId: string
  outputIndex: number
  fields: TokenFields
  /** Block height of the carrying transaction; undefined while unconfirmed or unknown. */
  height?: number
}
```

## scanIncoming

```ts
export async function scanIncoming(
  provider: WalletProvider,
  myPubKeyHex: string,
  /** Transactions to read whatever the history says: the wallet's marker backup. */
  extraTxIds: string[] = [],
  /** Skip candidates confirmed at or below this height: read before, and held in the wallet's own record. */
  opts: { sinceHeight?: number } = {},
): Promise<IncomingToken[]>
```

Scan the wallet's address history for incoming tokens. The notification outputs make the
carrying transactions show up under the owner's address; we then parse each tx for token
outputs locked to our pubkey. Verification (lightweight lineage) is the caller's
responsibility (see verify.ts) before trusting/recording a result.

At `const since = opts.sinceHeight ?? -1`:

Candidate txs: confirmed address history PLUS the txids of current UTXOs at our address.
The latter is mempool-aware (getUtxos includes unconfirmed), so the 1-sat notification
output of an incoming transfer surfaces the carrying tx immediately, before it confirms.

At `} catch {`:

history is best-effort

At `} catch {`:

utxos best-effort
