// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * THE MARKER BACKUP: every transaction that brought this wallet a 1-sat marker or a token, held or spent,
 * kept whole, with its Merkle proof, so a restore reads the chain only for what is newer than the backup.
 *
 * A token's transaction pays its holder a 1-sat P2PKH marker, and the wallet finds the token through it. A
 * spent marker is no longer an unspent coin, and once its transaction is old enough the explorer's newest
 * history no longer names it either, so the token is lost to a restore. This record keeps the transactions
 * themselves, so finding a token never depends on a marker staying unspent or on an explorer's window.
 *
 * ⚠ Not every token comes with a 1-sat marker: a bought copy reaches the buyer's history through their change,
 *   and a holder fee is only a 1-sat output when the fee is 1 sat. ⇒ A transaction is recorded when it pays
 *   this wallet a 1-sat P2PKH output OR carries a token output this wallet owns.
 *
 * ★ Each record holds the whole transaction and, once it is confirmed, its Merkle proof: the path and the root
 *   of the block header it was checked against. A wallet holding these needs no explorer to read or prove its
 *   own history. The backup also carries the wallet's token list, so a restore needs no old transaction at all.
 *
 * Kept in the browser and brought up to date on each use: the full history is listed (txids only), and only
 * transactions above the last height read, or unconfirmed, are fetched. Saved as a file to move to another
 * device. It holds transactions, proofs and the token list, never a key.
 */
import { LockingScript } from '../impl/js/script.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { parseTokenScript } from './tokenCodec.ts'
import { parseEditionScript } from './covenant.ts'
import { verifyMerkleProof, type MerkleProofEntry } from './tokenProtocol.ts'
import type { StoredToken } from './pharlapStore.ts'
import type { WalletProvider } from './walletProvider.ts'

export const MARKER_BACKUP_SCHEMA = 2
/** Formats this reader accepts. Format 1 had no transactions, proofs or token list. */
const READABLE_SCHEMAS = [1, 2]
/** The value of a marker output. */
const MARKER_SATS = 1

export interface CarriedToken {
  outputIndex: number
  kind: 'edition' | 'token'
  /** The collection id (TX1 txid). */
  collectionId: string
}

export interface MarkerRecord {
  /** The transaction the marker or token arrived in. */
  txId: string
  /** Its 1-sat P2PKH outputs paying this wallet. */
  markerVouts: number[]
  /** Its token outputs this wallet owns. */
  carries: CarriedToken[]
  /** Block height when read; 0 = unconfirmed at the time. */
  height: number
  /** The whole transaction, hex. Checked against `txId` whenever it is read back. */
  rawHex?: string
  /** Its Merkle proof, once confirmed. Checked whenever it is read back. */
  proof?: MerkleProofEntry
}

export interface MarkerBackup {
  schema: number
  address: string
  /** Every confirmed transaction below this height has been read. */
  readToHeight: number
  markers: MarkerRecord[]
  /** The wallet's token list when last saved: everything needed to show and spend each token. */
  tokens: StoredToken[]
}

export function emptyMarkerBackup(address: string): MarkerBackup {
  return { schema: MARKER_BACKUP_SCHEMA, address, readToHeight: 0, markers: [], tokens: [] }
}

interface TxLike { outputs: Array<{ value?: number; script: Uint8Array }> }

/** What one transaction holds for this wallet: its 1-sat markers, and the token outputs it owns. Pure. */
export function readMarkers(tx: TxLike, address: string, ownerPubKeyHex: string): { markerVouts: number[]; carries: CarriedToken[] } {
  const myScript = toHex(scriptForAddress(address))
  const me = ownerPubKeyHex.toLowerCase()
  const markerVouts: number[] = []
  const carries: CarriedToken[] = []
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

/** A proof is kept only if it is for this transaction and its path reaches the root it names. */
function provenFor(txId: string, proof: unknown): proof is MerkleProofEntry {
  const p = proof as MerkleProofEntry
  return p != null && p.txId === txId && Number.isInteger(p.blockHeight) && p.blockHeight > 0 &&
    typeof p.merkleRoot === 'string' && Array.isArray(p.path) && verifyMerkleProof(p)
}

/** A transaction is kept only if its bytes hash to the txid it is filed under. */
function rawFor(txId: string, rawHex: unknown): rawHex is string {
  if (typeof rawHex !== 'string' || !/^[0-9a-f]+$/i.test(rawHex)) return false
  try { return Tx.parse(rawHex).txid() === txId } catch { return false }
}

/**
 * Bring the backup up to date. Lists the full history, fetches only what is above the last height read (the
 * top block is read again, in case a transaction in it was not yet listed) or unconfirmed, and records each
 * transaction that brought a marker or a token, whole. A transaction that cannot be fetched holds the height
 * read below its own, so it is tried again next time: the record never claims to have read what it has not.
 * Then every record still missing its transaction or, once confirmed, its proof, gets them; one that cannot
 * yet is tried again next time. Throws when the history cannot be listed; the caller keeps the backup it had.
 */
export async function updateMarkerBackup(
  provider: Pick<WalletProvider, 'getFullAddressHistory' | 'getSourceTransaction' | 'getMerkleProof'>,
  address: string, ownerPubKeyHex: string, prev: MarkerBackup,
): Promise<{ backup: MarkerBackup; added: number; fetched: number; proved: number }> {
  const history = await provider.getFullAddressHistory(address)
  const byId = new Map(prev.markers.map(m => [m.txId, { ...m }]))
  let topHeight = prev.readToHeight
  let lowestFailed = Infinity
  let added = 0, fetched = 0, proved = 0
  for (const { txId, blockHeight } of history) {
    if (blockHeight > topHeight) topHeight = blockHeight
    const known = byId.get(txId)
    if (known != null) { if (known.height === 0 && blockHeight > 0) known.height = blockHeight; continue }
    if (blockHeight > 0 && blockHeight < prev.readToHeight) continue // read on an earlier use
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
      try { m.rawHex = (await provider.getSourceTransaction(m.txId)).hex(); fetched++ } catch { /* next time */ }
    }
    if (m.height > 0 && m.proof == null) {
      try {
        const p = await provider.getMerkleProof(m.txId)
        if (p != null && provenFor(m.txId, p)) { m.proof = p; m.height = p.blockHeight; proved++ }
      } catch { /* next time */ }
    }
  }
  const readToHeight = lowestFailed === Infinity ? topHeight : Math.min(topHeight, lowestFailed)
  return {
    backup: { schema: MARKER_BACKUP_SCHEMA, address, readToHeight, markers: [...byId.values()], tokens: prev.tokens },
    added, fetched, proved,
  }
}

/**
 * Parse a backup file, of this format or an earlier one. A transaction that does not hash to its txid, or a
 * proof that does not reach its root, is dropped rather than trusted; the next update fetches them again.
 * Throws with a reason a person can read.
 */
export function parseMarkerBackup(text: string): MarkerBackup {
  let b: any
  try { b = JSON.parse(text) } catch { throw new Error('this file is not a token backup (not JSON)') }
  if (b == null || typeof b !== 'object' || typeof b.address !== 'string' || !Array.isArray(b.markers)) {
    throw new Error('this file is not a token backup')
  }
  if (!READABLE_SCHEMAS.includes(b.schema)) throw new Error(`this backup is format ${b.schema}; this wallet reads formats ${READABLE_SCHEMAS.join(' and ')}`)
  const markers: MarkerRecord[] = []
  for (const m of b.markers) {
    if (m == null || typeof m.txId !== 'string' || !/^[0-9a-f]{64}$/.test(m.txId)) continue
    const rec: MarkerRecord = {
      txId: m.txId,
      markerVouts: Array.isArray(m.markerVouts) ? m.markerVouts.filter((v: unknown) => Number.isInteger(v)) : [],
      carries: Array.isArray(m.carries) ? m.carries.filter((c: any) => c != null && Number.isInteger(c.outputIndex)) : [],
      height: Number.isInteger(m.height) ? m.height : 0,
    }
    if (rawFor(m.txId, m.rawHex)) rec.rawHex = m.rawHex
    if (provenFor(m.txId, m.proof)) rec.proof = m.proof
    markers.push(rec)
  }
  const tokens: StoredToken[] = Array.isArray(b.tokens)
    ? b.tokens.filter((t: any) => t != null && typeof t.txId === 'string' && /^[0-9a-f]{64}$/.test(t.txId) &&
        Number.isInteger(t.outputIndex) && typeof t.collectionId === 'string')
    : []
  return {
    schema: MARKER_BACKUP_SCHEMA, address: b.address,
    readToHeight: Number.isInteger(b.readToHeight) ? b.readToHeight : 0, markers, tokens,
  }
}

/** One record from two copies of it: the confirmed height, and whichever has the transaction and the proof. */
function richer(a: MarkerRecord, b: MarkerRecord): MarkerRecord {
  const base = a.height === 0 && b.height > 0 ? b : a
  return { ...base, rawHex: a.rawHex ?? b.rawHex, proof: a.proof ?? b.proof }
}

/**
 * Join two backups of the same wallet: every transaction in either, each with the most either holds, every
 * token in either, and the higher height read, since each backup has read everything below its own. Throws if
 * they belong to different wallets.
 */
export function mergeMarkerBackups(a: MarkerBackup, b: MarkerBackup): MarkerBackup {
  if (a.address !== b.address) throw new Error('this backup belongs to a different wallet')
  const byId = new Map(a.markers.map(m => [m.txId, m]))
  for (const m of b.markers) {
    const have = byId.get(m.txId)
    byId.set(m.txId, have == null ? m : richer(have, m))
  }
  const tokens = new Map((a.tokens ?? []).map(t => [`${t.txId}:${t.outputIndex}`, t]))
  for (const t of b.tokens ?? []) if (!tokens.has(`${t.txId}:${t.outputIndex}`)) tokens.set(`${t.txId}:${t.outputIndex}`, t)
  return {
    schema: MARKER_BACKUP_SCHEMA, address: a.address, readToHeight: Math.max(a.readToHeight, b.readToHeight),
    markers: [...byId.values()], tokens: [...tokens.values()],
  }
}

/**
 * The file name a backup is saved under: led by the wallet's handle when it has one, and ending with the
 * local date and time it was saved, since copying a file does not always keep its creation date. Letters
 * and digits of any script are kept in the handle; anything else becomes `-`, and a leading dot is dropped
 * so the file is never hidden. No colons, which some systems refuse in a file name.
 */
export function markerBackupFileName(address: string, handle = '', when: Date = new Date()): string {
  const safe = handle.replace(/^@+/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40)
  const two = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}_${two(when.getHours())}${two(when.getMinutes())}`
  return `${safe === '' ? '' : safe + '-'}smartnfts-token-backup-${address.slice(0, 8)}_${stamp}.json`
}

/** The transactions a scan should read, whatever the explorer's history says. */
export function markerTxIds(b: MarkerBackup): string[] {
  return b.markers.map(m => m.txId)
}

/** The transactions the backup holds whole, for a provider to serve without fetching them. */
export function heldTransactions(b: MarkerBackup): Array<{ txId: string; rawHex: string }> {
  return b.markers.filter(m => m.rawHex != null).map(m => ({ txId: m.txId, rawHex: m.rawHex as string }))
}
