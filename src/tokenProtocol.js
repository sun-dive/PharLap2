import { sha256Bytes } from './bytes.js'

export const SELF_PAIR = '*'

export function hexToBytes(hex) {
  const bytes = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16))
  }
  return bytes
}

export function bytesToHex(bytes) {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('')
}

function uint32LE(n) {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
}

export function doubleSha256(data) {
  return sha256Bytes(sha256Bytes(data))
}

export function sha256(data) {
  return sha256Bytes(data)
}

export function computeTokenId(
  genesisTxId,
  outputIndex,
  immutableChunkBytes,
) {
  const txIdBytes = hexToBytes(genesisTxId)
  const indexBytes = uint32LE(outputIndex)
  const hash = sha256([...txIdBytes, ...indexBytes, ...immutableChunkBytes])
  return bytesToHex(hash)
}

export function computeFungibleTokenId(
  genesisTxId,
  immutableChunkBytes,
) {
  return computeTokenId(genesisTxId, 1, immutableChunkBytes)
}

export function verifyMerkleProof(entry) {
  let current = hexToBytes(entry.txId).reverse()

  for (const node of entry.path) {
    if (node.hash === SELF_PAIR) { current = doubleSha256([...current, ...current]); continue }
    const sibling = hexToBytes(node.hash).reverse()
    const combined = node.position === 'R'
      ? [...current, ...sibling]
      : [...sibling, ...current]
    current = doubleSha256(combined)
  }

  const computedRoot = bytesToHex(current.reverse())
  return computedRoot === entry.merkleRoot
}

export function verifyProofChain(
  chain,
  headers,
) {
  if (chain.entries.length === 0) {
    return { valid: false, reason: 'Proof chain is empty' }
  }

  for (const entry of chain.entries) {
    if (!verifyMerkleProof(entry)) {
      return {
        valid: false,
        reason: `Merkle proof invalid for TX ${entry.txId.slice(0, 12)}...`,
      }
    }

    const header = headers.get(entry.blockHeight)
    if (!header) {
      return {
        valid: false,
        reason: `No block header for height ${entry.blockHeight}`,
      }
    }
    if (header.merkleRoot !== entry.merkleRoot) {
      return {
        valid: false,
        reason: `Merkle root mismatch at height ${entry.blockHeight}`,
      }
    }
  }

  const oldest = chain.entries[chain.entries.length - 1]
  if (oldest.txId !== chain.genesisTxId) {
    return {
      valid: false,
      reason: 'Oldest proof entry does not match genesis TX',
    }
  }

  return { valid: true, reason: 'Token is valid with verified proof chain' }
}

export async function verifyProofChainAsync(
  chain,
  getBlockHeader,
) {
  if (chain.entries.length === 0) {
    return { valid: false, reason: 'Proof chain is empty' }
  }

  const heights = [...new Set(chain.entries.map(e => e.blockHeight))]
  const headers = new Map()
  for (const h of heights) {
    try {
      headers.set(h, await getBlockHeader(h))
    } catch (e) {
      const detail = e?.message ? `: ${e.message}` : ''
      return { valid: false, reason: `Failed to fetch header at height ${h}${detail}` }
    }
  }

  return verifyProofChain(chain, headers)
}

export function createProofChain(
  genesisTxId,
  genesisProof,
) {
  return { genesisTxId, entries: [genesisProof] }
}

export function extendProofChain(
  chain,
  newEntry,
) {
  return {
    genesisTxId: chain.genesisTxId,
    entries: [newEntry, ...chain.entries],
  }
}

export function verifyToken(
  tokenId,
  genesisTxId,
  genesisOutputIndex,
  immutableChunkBytes,
  chain,
  headers,
) {
  const expectedId = computeTokenId(genesisTxId, genesisOutputIndex, immutableChunkBytes)
  if (expectedId !== tokenId) {
    return { valid: false, reason: 'Token ID does not match genesis' }
  }

  return verifyProofChain(chain, headers)
}

