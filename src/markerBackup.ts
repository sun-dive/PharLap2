// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * THE MARKER BACKUP: every transaction that brought this wallet a 1-sat marker or a token, held or spent.
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
 * Kept in the browser and brought up to date on each use: the full history is listed (txids only), and only
 * transactions above the last height read, or unconfirmed, are fetched. Saved as a file to move to another
 * device. It holds txids and output numbers, never a key.
 */
import { LockingScript } from '../impl/js/script.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { parseTokenScript } from './tokenCodec.ts'
import { parseEditionScript } from './covenant.ts'
import type { WalletProvider } from './walletProvider.ts'

export const MARKER_BACKUP_SCHEMA = 1
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
}

export interface MarkerBackup {
  schema: number
  address: string
  /** Every confirmed transaction below this height has been read. */
  readToHeight: number
  markers: MarkerRecord[]
}

export function emptyMarkerBackup(address: string): MarkerBackup {
  return { schema: MARKER_BACKUP_SCHEMA, address, readToHeight: 0, markers: [] }
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

/**
 * Bring the backup up to date. Lists the full history, fetches only what is above the last height read (the
 * top block is read again, in case a transaction in it was not yet listed) or unconfirmed, and records each
 * transaction that brought a marker or a token. A transaction that cannot be fetched holds the height read
 * below its own, so it is tried again next time: the record never claims to have read what it has not.
 * Throws when the history cannot be listed; the caller keeps the backup it had.
 */
export async function updateMarkerBackup(
  provider: Pick<WalletProvider, 'getFullAddressHistory' | 'getSourceTransaction'>,
  address: string, ownerPubKeyHex: string, prev: MarkerBackup,
): Promise<{ backup: MarkerBackup; added: number; fetched: number }> {
  const history = await provider.getFullAddressHistory(address)
  const byId = new Map(prev.markers.map(m => [m.txId, { ...m }]))
  let topHeight = prev.readToHeight
  let lowestFailed = Infinity
  let added = 0, fetched = 0
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
    byId.set(txId, { txId, markerVouts: r.markerVouts, carries: r.carries, height: blockHeight })
    added++
  }
  const readToHeight = lowestFailed === Infinity ? topHeight : Math.min(topHeight, lowestFailed)
  return {
    backup: { schema: MARKER_BACKUP_SCHEMA, address, readToHeight, markers: [...byId.values()] },
    added, fetched,
  }
}

/** Parse a backup file. Throws with a reason a person can read. */
export function parseMarkerBackup(text: string): MarkerBackup {
  let b: any
  try { b = JSON.parse(text) } catch { throw new Error('this file is not a token backup (not JSON)') }
  if (b == null || typeof b !== 'object' || typeof b.address !== 'string' || !Array.isArray(b.markers)) {
    throw new Error('this file is not a token backup')
  }
  if (b.schema !== MARKER_BACKUP_SCHEMA) throw new Error(`this backup is format ${b.schema}; this wallet reads format ${MARKER_BACKUP_SCHEMA}`)
  const markers: MarkerRecord[] = []
  for (const m of b.markers) {
    if (m == null || typeof m.txId !== 'string' || !/^[0-9a-f]{64}$/.test(m.txId)) continue
    markers.push({
      txId: m.txId,
      markerVouts: Array.isArray(m.markerVouts) ? m.markerVouts.filter((v: unknown) => Number.isInteger(v)) : [],
      carries: Array.isArray(m.carries) ? m.carries.filter((c: any) => c != null && Number.isInteger(c.outputIndex)) : [],
      height: Number.isInteger(m.height) ? m.height : 0,
    })
  }
  return { schema: MARKER_BACKUP_SCHEMA, address: b.address, readToHeight: Number.isInteger(b.readToHeight) ? b.readToHeight : 0, markers }
}

/**
 * Join two backups of the same wallet: every transaction in either, and the higher height read, since each
 * backup has read everything below its own. Throws if they belong to different wallets.
 */
export function mergeMarkerBackups(a: MarkerBackup, b: MarkerBackup): MarkerBackup {
  if (a.address !== b.address) throw new Error('this backup belongs to a different wallet')
  const byId = new Map(a.markers.map(m => [m.txId, m]))
  for (const m of b.markers) {
    const have = byId.get(m.txId)
    if (have == null || (have.height === 0 && m.height > 0)) byId.set(m.txId, m)
  }
  return { schema: MARKER_BACKUP_SCHEMA, address: a.address, readToHeight: Math.max(a.readToHeight, b.readToHeight), markers: [...byId.values()] }
}

/** The transactions a scan should read, whatever the explorer's history says. */
export function markerTxIds(b: MarkerBackup): string[] {
  return b.markers.map(m => m.txId)
}
