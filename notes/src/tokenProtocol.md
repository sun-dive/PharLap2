# src/tokenProtocol.js

Pure SPV Token Protocol Layer.

This module contains the entire PHAR LAP token verification logic using
ONLY Merkle proofs and block headers. It has ZERO network dependencies.

A token is valid if:
  1. Token ID = SHA-256(genesisTxId || outputIndex LE || immutableChunkBytes)
     where immutableChunkBytes = tokenName + tokenScript + tokenRules
     (the three immutable fields ONLY — stateData is mutable and NOT bound to the
     Token ID; see tokenCodec.js and docs/DEVIATIONS_FROM_MPT.md)
  2. Every entry in the proof chain has a valid Merkle proof
  3. Every Merkle root matches its block header at that height
  4. The oldest entry's txId matches the genesis txId

This module can run in any environment (browser, Node, offline).

## MerklePathNode

```ts
export interface MerklePathNode {
  /** The sibling hash, or `*`: the working hash paired with itself, as Bitcoin pairs the last hash of a level
   *  that has an odd number of them. */
  hash: string
  position: 'L' | 'R'
}
```

─── Types ──────────────────────────────────────────────────────────

## SELF_PAIR

```ts
export const SELF_PAIR = '*'
```

The path step that pairs the working hash with itself (TSC's `*`).

## MerkleProofEntry

```ts
export interface MerkleProofEntry {
  txId: string
  blockHeight: number
  merkleRoot: string
  path: MerklePathNode[]
}
```

## ProofChain

```ts
export interface ProofChain {
  genesisTxId: string
  entries: MerkleProofEntry[]
}
```

## BlockHeader

```ts
export interface BlockHeader {
  height: number
  merkleRoot: string
}
```

Minimal block header -- only the fields the token protocol needs.

## VerificationResult

```ts
export interface VerificationResult {
  valid: boolean
  reason: string
}
```

## hexToBytes

```ts
export function hexToBytes(hex: string): number[]
```

─── Hex / Byte Helpers ─────────────────────────────────────────────

Note on Token ID computation: immutableChunkBytes = tokenName + tokenScript + tokenRules
These are the concatenated raw bytes from the immutable fields in the OP_RETURN script.
tokenAttributes is mutable and NOT included in the Token ID.

## bytesToHex

```ts
export function bytesToHex(bytes: number[]): string
```

## uint32LE

```ts
function uint32LE(n: number): number[]
```

## doubleSha256

```ts
export function doubleSha256(data: number[]): number[]
```

─── Cryptographic Primitives ───────────────────────────────────────

Bitcoin double SHA-256.

## sha256

```ts
export function sha256(data: number[]): number[]
```

Single SHA-256.

## computeTokenId

```ts
export function computeTokenId(
  genesisTxId: string,
  outputIndex: number,
  immutableChunkBytes: number[],
): string
```

─── Token ID ───────────────────────────────────────────────────────

Compute Token ID = SHA-256(genesisTxId || outputIndex LE || immutableChunkBytes).

The immutableChunkBytes parameter is the concatenated raw bytes of the immutable fields:
tokenName + tokenScript + tokenRules (NO tokenAttributes).
This binds the token's identity to the consensus rules and metadata that cannot change,
making it deterministic and tamper-proof. tokenAttributes is mutable and not bound to the Token ID.

Deterministic, purely local computation. No network access required.

## computeFungibleTokenId

```ts
export function computeFungibleTokenId(
  genesisTxId: string,
  immutableChunkBytes: number[],
): string
```

Compute Token ID for fungible tokens.

Unlike NFTs where each output has a unique Token ID based on outputIndex,
fungible tokens all share the same Token ID derived from the genesis TX.
Uses fixed outputIndex = 1 to maintain consistent hashing structure.

Token ID = SHA-256(genesisTxId || 0x00000001 || immutableChunkBytes)

## verifyMerkleProof

```ts
export function verifyMerkleProof(entry: MerkleProofEntry): boolean
```

─── Merkle Proof Verification ──────────────────────────────────────

Verify a single Merkle proof: compute root from txId + path,
compare against the claimed merkleRoot.

Uses Bitcoin's double SHA-256 for the Merkle tree hash.
Pure computation -- no network calls.

At `let current = hexToBytes(entry.txId).reverse()`:

Bitcoin txids and merkle roots are displayed in reversed (little-endian) byte order.
The Merkle tree computation uses natural (big-endian) byte order.

At `if (node.hash === SELF_PAIR) { current = doubleSha256([...current, ...current]); continue }`:

⚠ The last hash of a level with an odd count is paired with ITSELF. Skipping the step instead computes the
  wrong root, and a correct proof for any transaction in that place fails (measured: 8 of 65).

At `const computedRoot = bytesToHex(current.reverse())`:

Reverse the computed root back to display format for comparison

## verifyProofChain

```ts
export function verifyProofChain(
  chain: ProofChain,
  headers: Map<number, BlockHeader>,
): VerificationResult
```

Verify an entire proof chain using only Merkle proofs and block headers.

@param chain       The proof chain to verify
@param headers     Map of blockHeight -> BlockHeader (pre-fetched or cached)
@returns           Verification result with reason

This is the core SPV verification. The caller is responsible for
providing trusted block headers (from peers, a header chain, or an API).

At `if (!verifyMerkleProof(entry)) {`:

Step 1: Verify Merkle proof (pure crypto)

At `const header = headers.get(entry.blockHeight)`:

Step 2: Check Merkle root matches block header

At `const oldest = chain.entries[chain.entries.length - 1]`:

Step 3: Oldest entry must be the genesis TX

## verifyProofChainAsync

```ts
export async function verifyProofChainAsync(
  chain: ProofChain,
  getBlockHeader: (height: number) => Promise<BlockHeader>,
): Promise<VerificationResult>
```

Async version -- fetches block headers on demand via callback.
The callback is the ONLY external dependency; it can be backed by
a local cache, a peer connection, or an API.

At `const heights = [...new Set(chain.entries.map(e => e.blockHeight))]`:

Collect needed heights and fetch headers

## createProofChain

```ts
export function createProofChain(
  genesisTxId: string,
  genesisProof: MerkleProofEntry,
): ProofChain
```

─── Proof Chain Construction ───────────────────────────────────────

Create an initial proof chain from the genesis TX's Merkle proof.

## extendProofChain

```ts
export function extendProofChain(
  chain: ProofChain,
  newEntry: MerkleProofEntry,
): ProofChain
```

Prepend a new transfer's proof entry to an existing chain.

## verifyToken

```ts
export function verifyToken(
  tokenId: string,
  genesisTxId: string,
  genesisOutputIndex: number,
  immutableChunkBytes: number[],
  chain: ProofChain,
  headers: Map<number, BlockHeader>,
): VerificationResult
```

Full token verification: checks token ID + proof chain.

@param tokenId              The claimed token ID
@param genesisTxId          Genesis transaction hash
@param genesisOutputIndex   Output index in genesis TX (starts at 1)
@param immutableChunkBytes  Concatenated raw bytes of immutable fields (tokenName + tokenScript + tokenRules)
@param chain                The proof chain
@param headers              Pre-fetched block headers

At `const expectedId = computeTokenId(genesisTxId, genesisOutputIndex, immutableChunkBytes)`:

Verify token ID derivation

At `return verifyProofChain(chain, headers)`:

Verify proof chain
