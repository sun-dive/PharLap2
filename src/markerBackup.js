// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { LockingScript } from '../impl/js/script.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { parseTokenScript } from './tokenCodec.js'
import { parseEditionScript } from './covenant.js'
import { verifyMerkleProof } from './tokenProtocol.js'
import { THUMB_URL } from './thumbs.js'

export const MARKER_BACKUP_SCHEMA = 2
const READABLE_SCHEMAS = [1, 2]
const MARKER_SATS = 1

export function emptyMarkerBackup(address) {
  return { schema: MARKER_BACKUP_SCHEMA, address, readToHeight: 0, markers: [], tokens: [] }
}

export function readMarkers(tx, address, ownerPubKeyHex) {
  const myScript = toHex(scriptForAddress(address))
  const me = ownerPubKeyHex.toLowerCase()
  const markerVouts = []
  const carries = []
  tx.outputs.forEach((o, i) => {
    if (o.value === MARKER_SATS && toHex(o.script) === myScript) { markerVouts.push(i); return }
    const script = LockingScript.fromBinary(o.script)
    const ed = parseEditionScript(script)
    if (ed != null) {
      if (ed.ownerPubKeyHex.toLowerCase() === me) carries.push({ outputIndex: i, kind: 'edition', collectionId: ed.tx1RefHex })
      return
    }
    const tok = parseTokenScript(script)
    if (tok != null && tok.ownerPubKeyHex.toLowerCase() === me) carries.push({ outputIndex: i, kind: 'token', collectionId: tok.fields.tx1Ref })
  })
  return { markerVouts, carries }
}

function provenFor(txId, proof) {
  const p = proof
  return p != null && p.txId === txId && Number.isInteger(p.blockHeight) && p.blockHeight > 0 &&
    typeof p.merkleRoot === 'string' && Array.isArray(p.path) && verifyMerkleProof(p)
}

function rawFor(txId, rawHex) {
  if (typeof rawHex !== 'string' || !/^[0-9a-f]+$/i.test(rawHex)) return false
  try { return Tx.parse(rawHex).txid() === txId } catch { return false }
}

export async function updateMarkerBackup(
  provider,
  address, ownerPubKeyHex, prev,
) {
  const history = await provider.getFullAddressHistory(address)
  const byId = new Map(prev.markers.map(m => [m.txId, { ...m }]))
  let topHeight = prev.readToHeight
  let lowestFailed = Infinity
  let added = 0, fetched = 0, proved = 0
  for (const { txId, blockHeight } of history) {
    if (blockHeight > topHeight) topHeight = blockHeight
    const known = byId.get(txId)
    if (known != null) { if (known.height === 0 && blockHeight > 0) known.height = blockHeight; continue }
    if (blockHeight > 0 && blockHeight < prev.readToHeight) continue
    let tx
    try { tx = await provider.getSourceTransaction(txId); fetched++ }
    catch { if (blockHeight > 0) lowestFailed = Math.min(lowestFailed, blockHeight); continue }
    const r = readMarkers(tx, address, ownerPubKeyHex)
    if (r.markerVouts.length === 0 && r.carries.length === 0) continue
    byId.set(txId, { txId, markerVouts: r.markerVouts, carries: r.carries, height: blockHeight, rawHex: tx.hex() })
    added++
  }
  for (const m of byId.values()) {
    if (m.rawHex == null) {
      try { m.rawHex = (await provider.getSourceTransaction(m.txId)).hex(); fetched++ } catch { }
    }
    if (m.height > 0 && m.proof == null) {
      try {
        const p = await provider.getMerkleProof(m.txId)
        if (p != null && provenFor(m.txId, p)) { m.proof = p; m.height = p.blockHeight; proved++ }
      } catch { }
    }
  }
  const readToHeight = lowestFailed === Infinity ? topHeight : Math.min(topHeight, lowestFailed)
  return {
    backup: { schema: MARKER_BACKUP_SCHEMA, address, readToHeight, markers: [...byId.values()], tokens: prev.tokens },
    added, fetched, proved,
  }
}

export function parseMarkerBackup(text) {
  let b
  try { b = JSON.parse(text) } catch { throw new Error('this file is not a token backup (not JSON)') }
  if (b == null || typeof b !== 'object' || typeof b.address !== 'string' || !Array.isArray(b.markers)) {
    throw new Error('this file is not a token backup')
  }
  if (!READABLE_SCHEMAS.includes(b.schema)) throw new Error(`this backup is format ${b.schema}; this wallet reads formats ${READABLE_SCHEMAS.join(' and ')}`)
  const markers = []
  for (const m of b.markers) {
    if (m == null || typeof m.txId !== 'string' || !/^[0-9a-f]{64}$/.test(m.txId)) continue
    const rec = {
      txId: m.txId,
      markerVouts: Array.isArray(m.markerVouts) ? m.markerVouts.filter((v) => Number.isInteger(v)) : [],
      carries: Array.isArray(m.carries) ? m.carries.filter((c) => c != null && Number.isInteger(c.outputIndex)) : [],
      height: Number.isInteger(m.height) ? m.height : 0,
    }
    if (rawFor(m.txId, m.rawHex)) rec.rawHex = m.rawHex
    if (provenFor(m.txId, m.proof)) rec.proof = m.proof
    markers.push(rec)
  }
  const tokens = Array.isArray(b.tokens)
    ? b.tokens.filter((t) => t != null && typeof t.txId === 'string' && /^[0-9a-f]{64}$/.test(t.txId) &&
        Number.isInteger(t.outputIndex) && typeof t.collectionId === 'string')
    : []
  const cards = {}
  if (b.cards != null && typeof b.cards === 'object') {
    for (const [id, c] of Object.entries(b.cards)) {
      if (!/^[0-9a-f]{64}$/.test(id) || c == null || typeof c !== 'object') continue
      cards[id] = {
        mime: typeof c.mime === 'string' && c.mime !== '' ? c.mime : null,
        thumb: typeof c.thumb === 'string' && THUMB_URL.test(c.thumb) ? c.thumb : null,
      }
    }
  }
  return {
    schema: MARKER_BACKUP_SCHEMA, address: b.address,
    readToHeight: Number.isInteger(b.readToHeight) ? b.readToHeight : 0, markers, tokens,
    ...(Object.keys(cards).length > 0 ? { cards } : {}),
  }
}

function richer(a, b) {
  const base = a.height === 0 && b.height > 0 ? b : a
  return { ...base, rawHex: a.rawHex ?? b.rawHex, proof: a.proof ?? b.proof }
}

export function mergeMarkerBackups(a, b) {
  if (a.address !== b.address) throw new Error('this backup belongs to a different wallet')
  const byId = new Map(a.markers.map(m => [m.txId, m]))
  for (const m of b.markers) {
    const have = byId.get(m.txId)
    byId.set(m.txId, have == null ? m : richer(have, m))
  }
  const tokens = new Map((a.tokens ?? []).map(t => [`${t.txId}:${t.outputIndex}`, t]))
  for (const t of b.tokens ?? []) if (!tokens.has(`${t.txId}:${t.outputIndex}`)) tokens.set(`${t.txId}:${t.outputIndex}`, t)
  const cards = { ...(b.cards ?? {}), ...(a.cards ?? {}) }
  return {
    schema: MARKER_BACKUP_SCHEMA, address: a.address, readToHeight: Math.max(a.readToHeight, b.readToHeight),
    markers: [...byId.values()], tokens: [...tokens.values()],
    ...(Object.keys(cards).length > 0 ? { cards } : {}),
  }
}

export function markerBackupFileName(address, handle = '', when = new Date()) {
  const safe = handle.replace(/^@+/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40)
  const two = (n) => String(n).padStart(2, '0')
  const stamp = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}_${two(when.getHours())}${two(when.getMinutes())}`
  return `${safe === '' ? '' : safe + '-'}smartnfts-token-backup-${address.slice(0, 8)}_${stamp}.json`
}

export function markerTxIds(b) {
  return b.markers.map(m => m.txId)
}

export function heldTransactions(b) {
  return b.markers.filter(m => m.rawHex != null).map(m => ({ txId: m.txId, rawHex: m.rawHex }))
}
