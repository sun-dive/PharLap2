// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).

const STORAGE_KEY = 'p2:tokens'

function outpointKey(t) {
  return `${t.txId}:${t.outputIndex}`
}

function migrateLegacyKeys(t) {
  const legacy = t
  if (t.publisherPubKeyHashHex === undefined && legacy.creatorPubKeyHashHex !== undefined) {
    t.publisherPubKeyHashHex = legacy.creatorPubKeyHashHex
  }
  if (t.publisherFeeSats === undefined && legacy.creatorFeeSats !== undefined) {
    t.publisherFeeSats = legacy.creatorFeeSats
  }
  return t
}

export class PharLapStore {
  kv

  constructor(kv) {
    const fallback = (globalThis).localStorage
    if (kv == null && fallback == null) {
      throw new Error('PharLapStore: no KV store available (localStorage missing)')
    }
    this.kv = kv ?? (fallback)
  }

  list() {
    const raw = this.kv.getItem(STORAGE_KEY)
    if (raw == null || raw === '') return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed).map(migrateLegacyKeys) : []
    } catch {
      return []
    }
  }

  write(tokens) {
    this.kv.setItem(STORAGE_KEY, JSON.stringify(tokens))
  }

  clear() {
    this.write([])
  }

  add(token) {
    const tokens = this.list()
    const k = outpointKey(token)
    if (tokens.some(t => outpointKey(t) === k)) return false
    tokens.push({
      txId: token.txId,
      outputIndex: token.outputIndex,
      collectionId: token.collectionId,
      stateData: token.stateData,
      collectionName: token.collectionName,
      status: 'active',
      addedAt: token.addedAt ?? new Date().toISOString(),
      kind: token.kind,
      lockHex: token.lockHex,
      publisherPubKeyHashHex: token.publisherPubKeyHashHex,
      publisherPubKeyHex: token.publisherPubKeyHex,
      publisherFeeSats: token.publisherFeeSats,
      holderFeeSats: token.holderFeeSats,
      tokenSats: token.tokenSats,
      sellerNote: token.sellerNote,
      bonusKind: token.bonusKind,
      bonusValue: token.bonusValue,
      heightHint: token.heightHint,
    })
    this.write(tokens)
    return true
  }

  setHeightHint(txId, outputIndex, heightHint) {
    if (!(heightHint > 0)) return false
    const k = outpointKey({ txId, outputIndex })
    let changed = false
    const tokens = this.list().map(t => {
      if (outpointKey(t) !== k || t.heightHint === heightHint) return t
      changed = true
      return { ...t, heightHint }
    })
    if (changed) this.write(tokens)
    return changed
  }

  setPublisherPubKey(collectionId, publisherPubKeyHex) {
    const tokens = this.list().map(t => (t.collectionId === collectionId ? { ...t, publisherPubKeyHex } : t))
    this.write(tokens)
  }

  setCollectionName(txId, outputIndex, collectionName) {
    const k = outpointKey({ txId, outputIndex })
    const tokens = this.list().map(t => (outpointKey(t) === k ? { ...t, collectionName } : t))
    this.write(tokens)
  }

  markSent(txId, outputIndex) {
    const k = outpointKey({ txId, outputIndex })
    const tokens = this.list().map(t => (outpointKey(t) === k ? { ...t, status: 'sent' } : t))
    this.write(tokens)
  }

  reactivate(txId, outputIndex) {
    const k = outpointKey({ txId, outputIndex })
    let revived = false
    const tokens = this.list().map(t => {
      if (outpointKey(t) !== k || t.status === 'active') return t
      revived = true
      return { ...t, status: 'active' }
    })
    if (revived) this.write(tokens)
    return revived
  }

  remove(txId, outputIndex) {
    const k = outpointKey({ txId, outputIndex })
    this.write(this.list().filter(t => outpointKey(t) !== k))
  }

  active() {
    return this.list().filter(t => t.status === 'active')
  }
}
