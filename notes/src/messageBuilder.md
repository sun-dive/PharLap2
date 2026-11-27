# src/messageBuilder.js

PHAR LAP message transactions (Messaging v1).

A message is delivered like a token transfer: a RECORD_MESSAGE PushDrop output locked to the
recipient's pubkey, plus a 1-sat P2PKH notification to the recipient's address (the discovery
breadcrumb — the PushDrop output itself is not WoC-address-indexed). The recipient finds it with
scanIncomingMessages and opens the envelope with their private key.

  in:   sender funding (P2PKH)
  out0: message PushDrop → recipient pubkey   (RECORD_MESSAGE record, 1 sat)
  out1: notification     → recipient address  (1 sat P2PKH, default-on)
  out2: change

buildMessageTx is pure/offline (explicit funding) so it can be validated without the network.

## MessageTxResult

```ts
export interface MessageTxResult {
  tx: Tx
  txId: string
  messageVout: number
  notifyVout: number | null
  changeVout: number | null
  changeSats: number
}
```

## buildMessageTx

```ts
export async function buildMessageTx(opts: {
  key: Signer
  funding: FundingInput[]
  recipientPubKeyHex: string
  /** 32-byte hex context ref (collection id / thread root), or 64 zeros for a standalone DM. */
  ref?: string
  envelope: number[]
  notify?: boolean
  outputSats?: number
  feePerKb?: number
}): Promise<MessageTxResult>
```

## toFundingInputs

```ts
async function toFundingInputs(_provider: WalletProvider, utxos: Utxo[]): Promise<FundingInput[]>
```

## sendMessage

```ts
export async function sendMessage(provider: WalletProvider, key: Signer, params: {
  toPubKeyHex: string
  parts: Part[]
  encrypt?: boolean
  ref?: string
  feePerKb?: number
  /** Sender's self-asserted display alias, carried so the recipient can show @name. */
  senderAlias?: string
  /** Send time (UTC epoch ms); defaults to now. Carried so recipients can show + order by it. */
  sentAt?: number
}): Promise<{ txId: string; messageOutpoint: { txId: string; outputIndex: number } }>
```

Send a message on-chain to a recipient pubkey. Encrypted (authenticated ECIES) by default.

## IncomingMessage

```ts
export interface IncomingMessage {
  txId: string
  outputIndex: number
  ref: string
  senderPubKeyHex: string
  encrypted: boolean
  parts: Part[]
  /** Sender's self-asserted alias (if they attached one). */
  senderAlias?: string
  /** Sender's self-asserted send time, UTC epoch ms (if attached) — display + tiebreak ordering. */
  sentAt?: number
  /** Block height of the message tx (0 = unconfirmed/unknown) — orders the inbox newest-first. */
  height?: number
}
```

## scanIncomingMessages

```ts
export async function scanIncomingMessages(
  provider: WalletProvider, recipientPriv: Signer,
  /** Transactions to read whatever the history says: the wallet's marker backup. */
  extraTxIds: string[] = [],
): Promise<IncomingMessage[]>
```

Find messages locked to us and open them. Candidate txs = address history ∪ getUtxos (mempool-aware,
so an unconfirmed message surfaces immediately via its 1-sat notification UTXO). Outputs whose
envelope can't be opened with our key are skipped.

At `try { for (const h of await provider.getFullAddressHistory()) { candidateTxIds.add(h.txId); heigh...`:

best-effort

At `try { for (const u of await provider.getUtxos()) candidateTxIds.add(u.txId) } catch {`:

best-effort

At `if (opened == null) continue`:

not openable with our key

### scanIncomingMessages › rank

```ts
const rank = (m: IncomingMessage): number =>
```

Newest first: unconfirmed (height 0/unknown) on top, then highest block height, then sender send-time.
Finite sentinel for unconfirmed so ties compare to 0 (stable) rather than Infinity−Infinity = NaN.
