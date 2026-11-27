# src/walletProvider.js

WhatsOnChain-based wallet provider for BSV mainnet.

This is the WALLET layer -- responsible for all network operations:
  - UTXO lookup (funding transactions)
  - Broadcasting signed transactions
  - Fetching raw transactions (for building inputs)
  - Fetching block headers (for SPV verification)
  - Fetching Merkle proofs (for proof chain construction)
  - Address history (for incoming token detection)

The token protocol (tokenProtocol.js) has NO dependency on this module.
Verification can be done offline with pre-fetched headers.

## Imports

At `import { ChainHttp } from '../impl/js/chain.mjs'`:

─── Rate Limiter (serializing queue) ────────────────────

★★ THE QUEUE MOVED, THE BEHAVIOUR DID NOT. `fetchWithRetry` and `queuedFetch` keep their names and
  their signatures, so every call site below is untouched; only what sits behind them changed. That is
  the point of the swap: this is 614 lines of working code and 7 of them needed to move.

★ What the shared transport adds over the version it replaces:
  | a queue PER HOST | two services throttle independently, so one queue halved both - and it removes
    the footgun that made "do not instantiate multiple providers" a necessary comment |
  | `Retry-After` honoured | when a service says how long to wait, guessing 500 ms is worse for both |
  | an INJECTABLE transport and clock | so a 429 storm, a Retry-After header and two callers racing are
    graded offline, which a live API will not reproduce on demand |

⚠⚠ AND EVERY REQUEST IS PACED, INCLUDING THE POLLS. The version this replaces queued its broadcast
  but called `fetch` directly in `visibleOn`, so the orphan guard ran outside the pacing entirely: the
  highest-frequency path in the wallet, running while nothing else is, each call too small to look like
  it mattered. Fixed below by one word, and pinned by a test.

## WOC_BASE

```ts
const WOC_BASE = (typeof location !== 'undefined' && location.hostname === 'localhost')
```

Use local proxy on localhost to avoid CORS issues

## BANANA_BASE

```ts
const BANANA_BASE = (typeof location !== 'undefined' && location.hostname === 'localhost')
```

GorillaPool's BananaBlocks — an independent, miner-direct relay broadcast to ALONGSIDE WoC for resilience.
WoC now front-ends ARC (stricter policy that can bounce non-standard covenant txs); GorillaPool is a permissive
miner, so a covenant tx WoC rejects still has a home. Native REST broadcast: POST /tx/broadcast { rawtx }.
Same localhost-proxy shape as WoC to dodge browser CORS in dev (see serve.mjs).

## BANANA_WOC_BASE

```ts
const BANANA_WOC_BASE = (typeof location !== 'undefined' && location.hostname === 'loca...
```

BananaBlocks' WhatsOnChain-compatible READ path (drop-in for WoC's /tx/{id}/proof/tsc and /block/{hash}/header),
used for Merkle-proof retrieval. NOTE: its tsc `target` is the MERKLE ROOT, whereas WoC's is the block hash —
so getMerkleProof adapts per source (see merkleProofBanana vs merkleProofWoC).

## BULK_SCRIPTS

```ts
export const BULK_SCRIPTS = 20
```

WoC's bulk unspent calls: scripts per request, and the most outputs they answer for one script.

## CONFIRM_POLL_TRIES

```ts
export const CONFIRM_POLL_TRIES = 3
```

Orphan-guard poll: after a relay accepts, re-check the tx is actually visible; if it vanishes, re-broadcast.

## GATE_POLL_TRIES

```ts
export const GATE_POLL_TRIES = 10
```

Blocking parent-tx gate (before broadcasting a child that spends its output — e.g. edition TX2 spending
collection TX1's change). Poll fast: an accepted tx usually shows in a relay mempool within a second or two.
Two rounds with a single re-broadcast between them (idempotent). SPV → mempool visibility is enough; a child
can safely spend an unconfirmed-but-seen parent, so there's no need to wait for a block.

## Utxo

```ts
export interface Utxo {
  txId: string
  outputIndex: number
  satoshis: number
  script: string
  /** Block height of the confirming tx (0 / undefined = unconfirmed). Used to order recovered holdings. */
  height?: number
}
```

─── Types ──────────────────────────────────────────────────────────

## WalletBlockHeader

```ts
export interface WalletBlockHeader extends SpvBlockHeader {
  hash: string
  timestamp: number
  prevHash: string
}
```

## chainHttp

```ts
let chainHttp = new ChainHttp()
```

The shared transport. ★ Different hosts run in parallel; the same host queues.

⚠ `let`, and a setter, ONLY so the suite can drive this file with a fake transport and a fake clock.
  A 429 storm, a Retry-After header and a relay that accepts then drops a transaction are not things
  a live service produces on demand, and a wallet layer that has only ever been run against the real
  network has not been tested. ⛔ Nothing in production calls `useTransport`.

## useTransport

```ts
export const useTransport = (h: ChainHttp): void =>
```

## delay

```ts
const delay = (ms: number): Promise<void> =>
```

⚠⚠ THE GUARD'S OWN WAITS GO THROUGH THE SAME CLOCK, and not for tidiness. The orphan guard waits
  10 × 2 s twice over, and the background guard 3 × 15 s: driven by a real `setTimeout`, proving that
  a parent which never appears aborts the child costs the suite **40 seconds of doing nothing**.
  ⇒ A check that slow gets run less often, and a check that is run less often is the one that stops
    catching things. Same clock as the transport, same reason.

## queuedFetch

```ts
function queuedFetch(url: string, init?: RequestInit): Promise<Response>
```

Rate-limited, no 429 retry.

## fetchWithRetry

```ts
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response>
```

Rate-limited, with automatic retry on 429. ⛔ A 429 is never reported as an error.

## class WalletProvider

```ts
export class WalletProvider
```

─── Wallet Provider ────────────────────────────────────────────────

### WalletProvider.parsedTxCache

```ts
private parsedTxCache = new Map<string, Tx>()
```

Parsed-tx cache: Tx.parse is O(tx size) and re-parsing a big file-bearing TX1 (e.g. an
app-snapshot collection, ~300 KB) on every meta/name/publisher lookup can freeze the page. A tx's bytes
never change once broadcast, so caching the parsed object (parsed once) is safe and removes the hot spot.

### WalletProvider.pendingUtxos

```ts
private pendingUtxos = new Map<string, Utxo>()
```

v05.22: Local pending UTXO tracking for consecutive transfers.

When we broadcast a TX, the change output won't appear in WoC's UTXO list
until the TX is confirmed. This prevents consecutive fragment transfers
because the second transfer can't find funding UTXOs.

Solution: Track pending UTXOs locally and combine with confirmed UTXOs.

### WalletProvider.spentOutpoints

```ts
private spentOutpoints = new Set<string>()
```

key: "txId:outputIndex"

### WalletProvider.constructor

```ts
constructor(address: string)
```

key: "txId:outputIndex"

### WalletProvider.getUtxos

```ts
async getUtxos(): Promise<Utxo[]>
```

── Wallet Operations (UTXO model) ─────────────────────────────

Get spendable UTXOs from WoC's mempool-aware `/unspent/all` endpoint.

This endpoint returns BOTH confirmed and unconfirmed UTXOs (so funding can be spent
before it confirms), and flags outputs already spent by a mempool tx
(`isSpentInMempoolTx`) — which we exclude so we never build a `txn-mempool-conflict`
double-spend, even across page reloads (WoC is the source of truth for mempool spends).

⚠⚠ THE RANKING, CORRECTED. This said "WoC is the source of truth for mempool spends", with
`pendingUtxos`/`spentOutpoints` demoted to a supplement. That is right on a chain with
REPLACE-BY-FEE, where your own broadcast can be replaced underneath you, so the network's current
view outranks your memory of what you sent. This chain has FIRST-SEEN and no RBF: an accepted
transaction is final, our own record cannot be invalidated by a replacement, and it is the
RELIABLE half. The indexer's flag is the supplement.

⚠ The flag is kept because it covers what our own record cannot know - the same key in use on
another device, or a wallet restored with no local history - and it FAILS OPEN: a missing field
keeps the coin, because an indexer that drops a flag must not be able to freeze a wallet.

At `` const allRows = await this.allPages(`/address/${address}/unspent/all`, 'UTXO') ``:

Confirmed UTXOs (mempool-aware: flags + excludes mempool-spent outputs), every page: an address can hold
more than 1,000 coins and markers.

At `let unconfirmedUtxos = []`:

Unconfirmed received UTXOs, so funding can be spent before it confirms (best-effort).

At `} catch {`:

unconfirmed is best-effort

At `const seen = new Set()`:

Merge + dedupe by outpoint.

At `` for (const u of onchain) this.pendingUtxos.delete(`${u.txId}:${u.outputIndex}`) ``:

Drop pending entries WoC now reports; exclude anything we've spent locally.

#### WalletProvider.getUtxos › mapRows

```ts
const mapRows = (data: any): Utxo[] =>
```

At `.filter((u) => u.isSpentInMempoolTx !== true)`:

never a UTXO already spent in the mempool

### WalletProvider.registerPendingTx

```ts
registerPendingTx(
    txId: string,
    spentInputs: Array<{ txId: string; outputIndex: number }>,
    changeOutput?: { outputIndex: number; satoshis: number },
  ): void
```

Register a pending transaction for local UTXO tracking.

Call this after broadcasting a TX to enable consecutive transfers
before the TX is confirmed.

@param txId - The broadcast transaction ID
@param spentInputs - Outpoints consumed by this TX [{txId, outputIndex}]
@param changeOutput - Change output created by this TX (if any)

At `for (const input of spentInputs) {`:

Mark spent inputs

At `this.pendingUtxos.delete(key)`:

Also remove from pending if we're spending our own unconfirmed change

At `if (changeOutput && changeOutput.satoshis > 0) {`:

Track change output as pending UTXO

### WalletProvider.clearConfirmedSpends

```ts
clearConfirmedSpends(spentInputs: Array<{ txId: string; outputIndex: number }>): void
```

Clear spent outpoints for a confirmed transaction.

Call this when a pending TX is confirmed to clean up tracking state.
Note: Pending UTXOs are auto-cleaned in getUtxos() when they appear confirmed.

### WalletProvider.relayBroadcast

```ts
private relayBroadcast(rawHex: string): Promise<string>
```

── Broadcasting ──────────────────────────────────────────────

POST the same signed tx to both relays; resolves with the name of the FIRST to accept, rejects
 (AggregateError) only if ALL reject. Shared by the initial broadcast and the orphan-guard re-broadcast.

At `return Promise.any(relays.map(async r => {`:

Promise.any resolves on the first acceptance; rejects only if ALL reject.

### WalletProvider.broadcast

```ts
async broadcast(rawHex: string, opts: { awaitSeen?: boolean } = {}): Promise<string>
```

At `const txId = Tx.parse(rawHex).txid()`:

The txid is deterministic from the signed tx, so compute it locally instead of trusting a relay's echo —
an ARC-style relay can return 200 + a txid for a tx it later orphans (see bitcoin-sv/arc #1006).

At `try {`:

Fan the SAME signed tx out to two independent relays and succeed on the FIRST acceptance. WoC front-ends
ARC (stricter policy — can bounce non-standard covenant txs); GorillaPool's BananaBlocks routes straight to
a permissive miner. Same tx → same txid, so sending to both carries no double-spend risk: it just gives the
tx two independent shots at a miner and removes WoC as a single point of failure. A relay CORS-blocked or
down in one environment simply loses its race; the other carries the tx (graceful degradation).

At `this.txCache.set(txId, rawHex)`:

Cache the raw hex of what we just broadcast so a spend of one of its outputs (transfer / replicate /
burn of a freshly-created edition) can be built immediately, without waiting for a relay to index the tx.

At `if (opts.awaitSeen) await this.awaitInMempool(txId, rawHex)`:

A relay can accept a tx (200 + txid) then silently drop it without mining — arc #1006 saw txs sit in
ORPHAN_MEMPOOL until re-broadcast. If a CHILD tx will spend this tx's output in the same mint (edition TX2
over collection TX1's change), the caller passes awaitSeen: we BLOCK until the tx is actually visible in a
relay mempool before returning, so the child can never race ahead of its unconfirmed parent (which the node
rejects as "Missing inputs"). awaitInMempool throws if it never appears, so the caller aborts BEFORE
broadcasting the child — no orphaned child tx. Standalone txs just get the non-blocking background guard.

### WalletProvider.visibleOn

```ts
private async visibleOn(txId: string): Promise<string | null>
```

Which relay (if any) currently reports this tx as present (mempool or mined). BananaBlocks is checked first —
 it's independent and non-pruning, so it holds the more complete mempool view.

At `try { return (await fetchWithRetry(url)).ok ? name : null } catch { return null }`:

⚠⚠ `fetchWithRetry`, NOT a bare `fetch`. This poll runs every two seconds against two
  relays while the gate is open, and calling the transport directly put the busiest path
  in the wallet outside the rate limiter entirely.

### WalletProvider.confirmLanded

```ts
private async confirmLanded(txId: string, rawHex: string): Promise<void>
```

Poll the relays until a just-broadcast tx is visible; if neither reports it after a short grace window,
 re-broadcast once. Non-blocking and best-effort — the caller already holds the deterministic txid. Used as
 the background orphan-guard for standalone txs (those with no child spending them in the same batch).

### WalletProvider.awaitInMempool

```ts
private async awaitInMempool(txId: string, rawHex: string): Promise<void>
```

BLOCKING parent-tx gate: wait until txId is visible in a relay mempool so a child tx can safely spend its
 output. Polls on a fast cadence (a just-accepted tx usually surfaces within a second or two); the first check
 is immediate, so the common case returns near-instantly. If it stalls for a full window, re-broadcast once
 (idempotent — same txid, no double-spend) then poll again — this recovers the ARC-orphan case that first
 bit the suited-up mint. Throws if it never appears, so the caller aborts before broadcasting the child (no
 orphaned child tx). SPV: mempool visibility is all the child needs — no block wait.

At `catch {`:

keep polling — the original acceptance may still surface on a relay

### WalletProvider.rawInFlight

```ts
private rawInFlight = new Map<string, Promise<string>>()
```

── Raw Transactions ──────────────────────────────────────────

⚠ One fetch per txid at a time. The cache fills only when a fetch lands, and several scans ask for the
same transaction in the same moment (a scan of holdings, a note lookup and a publisher lookup all want
the transaction that delivered an edition). Without this, each asks the network in turn, 2 s apiece
behind the rate limiter. Measured on a live replicate: 20 of 45 requests were repeats.

### WalletProvider.seedTransactions

```ts
seedTransactions(entries: Array<{ txId: string; rawHex: string }>): void
```

Serve these transactions from memory from now on, without a network request. The caller vouches that
each hex hashes to its txid; one already held is left as it is.

### WalletProvider.getOutputScriptHexCapped

```ts
async getOutputScriptHexCapped(txId: string, index: number, maxBytes = 512 * 1024): Promise<string | 'oversized' | null>
```

Fetch ONE output's locking-script hex via WoC, STREAMING the body and bailing the moment it exceeds
`maxBytes` — so the sales page can read a collection's small storefront/template outputs without pulling
a large embedded content file (e.g. a 40 MB audio track). Returns the hex; the sentinel 'oversized' if it
blew the cap (skipped without downloading the body); or null if the output doesn't exist (past the last
index). Hex is 2 chars/byte, so the byte cap is doubled internally.

At `const cl = Number(resp.headers.get('content-length') ?? 0)`:

Fast path: a known Content-Length lets us skip a huge output without reading any of the body.

At `if (cl > capHex) { try { await resp.body?.cancel() } catch {`:

ignore

At `const reader = resp.body?.getReader()`:

Stream with a cap (also covers chunked / missing Content-Length): abort the moment we exceed it.

At `if (received > capHex) { try { await reader.cancel() } catch {`:

ignore

### WalletProvider.getTxConfirmation

```ts
async getTxConfirmation(txId: string): Promise<{ blockHeight: number; time: number } | null>
```

── Block Headers (feeds into SPV verification) ───────────────

Relay-reported confirmation of a tx: its block height + block time (unix seconds), or null if unconfirmed
 (mempool) or not found. For provenance display only — not an SPV proof (use getMerkleProof for that).
 Prefers BananaBlocks (GorillaPool — independent + non-pruning, so a more complete/reliable index than WoC,
 which now sits behind the BSVA/pruning landscape), falling back to WoC if BananaBlocks is unavailable.

At `try {`:

Primary: BananaBlocks native /tx/{id} → { block_height, block_time, confirmations }.

At `return h > 0 ? { blockHeight: h, time: (d?.block_time ?? 0) } : null`:

known; null ⇒ mempool

At `} catch {`:

fall back to WoC below

At `` const resp = await fetchWithRetry(`${WOC_BASE}/tx/hash/${txId}`) ``:

Fallback: WoC /tx/hash/{id} → { blockheight, blocktime }.

At `if (h <= 0) return null`:

unconfirmed / mempool

### WalletProvider.getChainHeight

```ts
async getChainHeight(): Promise<number>
```

Current chain tip height (for approximate time-bucketing of activity by block-height delta).

### WalletProvider.getBlockHeader

```ts
async getBlockHeader(height: number): Promise<WalletBlockHeader>
```

At `let blockHash`:

WoC may return just the hash string or a full block JSON object

At `try {`:

If we got the full block object, we can extract the header directly
without a second API call

At `}`:

Not JSON, proceed with separate header fetch

### WalletProvider.getAddressHistory

```ts
async getAddressHistory(address: string = this.getAddress()): Promise<{ txId: string; blockHeight: number }[]>
```

── Address History ───────────────────────────────────────────

At `if (resp.status === 404) return []`:

WoC returns 404 for an address it has never seen — i.e. a brand-new wallet with zero
transactions. That's an empty history, not a failure; treat it as [] so fresh wallets
(e.g. a gift recipient) load and can claim instead of throwing on first run.

### WalletProvider.allPages

```ts
private async allPages(path: string, what: string): Promise<any[] | null>
```

EVERY transaction touching an address, confirmed and unconfirmed.

⚠⚠ `getAddressHistory` reads `/history`, which answers only the NEWEST 100. A token whose 1-sat marker
  has been spent is no longer in the UTXO set either, so once its transaction is older than that window
  nothing finds it. Measured: an address with 194 transactions, 9 of its 21 tokens outside the window.
  ⇒ `/confirmed/history` pages through all of it (`?token=` + the previous page's `nextPageToken`), and
    `/unconfirmed/history` adds what is not in a block yet.

Every page goes through the same queue as every other request. A failed page throws rather than
returning what was read so far: a short history looks exactly like a complete one.

Every row of a WoC list that answers in pages: `result` and a `nextPageToken`, the next page asked for with
`?token=`. ⚠ The history and unspent lists answer at most 1,000 rows a page (measured on an unspent list: the
second page held 1,000 more, none repeated), so reading only the first hides the rest. An empty page, no
token, or a token already followed ends it. A failed page throws: a short list looks complete. A 404 on the
first page means WoC has never seen the address or script: null.

### WalletProvider.getFullAddressHistory

```ts
async getFullAddressHistory(address: string = this.getAddress()): Promise<{ txId: string; blockHeight: number }[]>
```

At `` for (const r of (await this.allPages(`/address/${address}/confirmed/history`, 'confirmed history'... ``:

An address never seen has an empty history.

### WalletProvider.getSpendingTx

```ts
async getSpendingTx(txId: string, outputIndex: number): Promise<{ txId: string; unconfirmed: boolean } | null>
```

── Script-hash UTXOs (find covenant outputs not at our address) ──

Unspent outputs paying a given script hash. Edition covenant outputs are locked to an owner pubkey
embedded in a custom script, NOT to a P2PKH address, so they aren't in any address's UTXO set — but
their exact script is deterministically derivable (covenant.buildHolderEditionScript), and WoC indexes
by script hash. This is how the sales page resolves a holder's current spendable edition.

Uses the MEMPOOL-AWARE `/unspent/all` (confirmed + unconfirmed, flags mempool-spent) so a just-acquired
edition — and the note/bonus that rode in on its tx — resolves immediately, before confirmation; falls
back to the confirmed-only `/unspent` if `/all` isn't available. `scriptHash` is SHA-256(scriptBytes)
byte-reversed (Electrum/WoC convention).

The transaction that spent an output, or null when the explorer knows of none. ⚠ A null is NOT proof the
output is live; it is the absence of a record. Callers that retire a holding must act only on a named
spender. Measured 12 Sept 2026: the explorer's address index fell hours behind while its by-script
list was intact, and a holding was retired on one empty answer.

### WalletProvider.getUnspentByScriptHash

```ts
async getUnspentByScriptHash(scriptHash: string): Promise<Utxo[]>
```

At `let rows = null`:

Every page: one script can hold more than 1,000 outputs, such as many copies of one edition.

### WalletProvider.getUnspentByScriptHashes

```ts
async getUnspentByScriptHashes(scriptHashes: string[]): Promise<Map<string, Utxo[]>>
```

Unspent outputs for many scripts, 20 scripts to a request: WoC's bulk `/scripts/unspent` (confirmed) and
`/scripts/unconfirmed/unspent`, answered in request order. A script is asked again with the exact single
call above when its bulk answer cannot be trusted:
  - 20 outputs: the bulk calls stop at 20 per script (measured: 20 for a script holding over 1,000);
  - any unconfirmed output: the bulk confirmed answer does not flag an output already spent in the mempool;
  - an error for that script, or a bulk request that failed or answered the wrong number of scripts.
A script missing from the result could not be asked at all: the caller treats it as unknown, not empty.

At `for (const h of exact) { try { out.set(h, await this.getUnspentByScriptHash(h)) } catch {`:

unknown: left out

### WalletProvider.getRecentTxIdsForAddress

```ts
async getRecentTxIdsForAddress(address: string): Promise<string[]>
```

Mempool-aware txids touching an address, via `/unspent/all` (confirmed + unconfirmed outputs).
A just-broadcast tx's change output appears here before it confirms, so this surfaces a freshly
published seller-note (its change pays the seller's address) that `/history` hasn't indexed yet.

At `} catch {`:

best-effort

### WalletProvider.getMerkleProof

```ts
async getMerkleProof(txId: string): Promise<MerkleProofEntry | null>
```

── Merkle Proofs (feeds into proof chain construction) ───────

At `return (await this.merkleProofBanana(txId)) ?? (await this.merkleProofWoC(txId))`:

Prefer BananaBlocks (independent + non-pruning → a more complete proof index than WoC); fall back to WoC.
The two return DIFFERENT tsc `target`s — BananaBlocks = merkle root, WoC = block hash — so each has its own
adapter below. Both anchor merkleRoot to the block HEADER (not the proof's self-reported target).

### WalletProvider.tscPath

```ts
private tscPath(nodes: string[], index: number): MerklePathNode[]
```

TSC `nodes` + tx `index` → L/R sibling path. Shared by both sources. A `*` is kept as a step of its own:
 the working hash paired with itself, not a step to skip.

### WalletProvider.merkleProofBanana

```ts
private async merkleProofBanana(txId: string): Promise<MerkleProofEntry | null>
```

BananaBlocks: tsc `target` is the MERKLE ROOT. Take the block hash from the native tx record, read the
 header (trusted source of merkleroot + height), and require the header's root to equal the proof's target
 — so the path is anchored to a header, not to the relay's self-reported root.

At `if (header?.merkleroot !== data.target) {`:

integrity gate: path root must match the header's root

### WalletProvider.merkleProofWoC

```ts
private async merkleProofWoC(txId: string): Promise<MerkleProofEntry | null>
```

WoC: tsc `target` IS the block hash → its header gives merkleroot + height directly.
