import { Tx } from '../impl/js/transaction.mjs'
import { SELF_PAIR } from './tokenProtocol.js'

const WOC_BASE = (typeof location !== 'undefined' && location.hostname === 'localhost')
  ? '/woc/v1/bsv/main'
  : 'https://api.whatsonchain.com/v1/bsv/main'

const BANANA_BASE = (typeof location !== 'undefined' && location.hostname === 'localhost')
  ? '/banana/api/v1'
  : 'https://bananablocks.com/api/v1'

const BANANA_WOC_BASE = (typeof location !== 'undefined' && location.hostname === 'localhost')
  ? '/banana/api/v1/bsv/main'
  : 'https://bananablocks.com/api/v1/bsv/main'

export const BULK_SCRIPTS = 20
export const BULK_UNSPENT_CAP = 20

export const CONFIRM_POLL_TRIES = 3
export const CONFIRM_POLL_INTERVAL_MS = 15_000

export const GATE_POLL_TRIES = 10
export const GATE_POLL_INTERVAL_MS = 2_000

import { ChainHttp } from '../impl/js/chain.mjs'

let chainHttp = new ChainHttp()
export const useTransport = (h) => { chainHttp = h }

const delay = (ms) => chainHttp.sleep(ms)

function queuedFetch(url, init) {
  return chainHttp.request(url, init)
}

async function fetchWithRetry(url, init) {
  return await chainHttp.request(url, init)
}

export class WalletProvider {
  address
  txCache = new Map()
  parsedTxCache = new Map()

  pendingUtxos = new Map()
  spentOutpoints = new Set()

  constructor(address) {
    this.address = address
  }

  getAddress() {
    return this.address
  }

  async getUtxos() {
    const address = this.getAddress()

    const mapRows = (data) => {
      const rows = Array.isArray(data?.result) ? data.result : (Array.isArray(data) ? data : [])
      return rows
        .filter((u) => u.isSpentInMempoolTx !== true)
        .map((u) => ({
          txId: u.tx_hash,
          outputIndex: u.tx_pos,
          satoshis: u.value,
          script: '',
        }))
    }

    const allRows = await this.allPages(`/address/${address}/unspent/all`, 'UTXO')
    if (allRows == null) throw new Error('WoC UTXO fetch failed: 404')
    const confirmedUtxos = mapRows(allRows)

    let unconfirmedUtxos = []
    try {
      unconfirmedUtxos = mapRows((await this.allPages(`/address/${address}/unconfirmed/unspent`, 'unconfirmed UTXO')) ?? [])
    } catch { }

    const seen = new Set()
    const onchain = []
    for (const u of [...confirmedUtxos, ...unconfirmedUtxos]) {
      const k = `${u.txId}:${u.outputIndex}`
      if (seen.has(k)) continue
      seen.add(k)
      onchain.push(u)
    }

    const isSpent = (u) =>
      this.spentOutpoints.has(`${u.txId}:${u.outputIndex}`)

    for (const u of onchain) this.pendingUtxos.delete(`${u.txId}:${u.outputIndex}`)
    const available = onchain.filter(u => !isSpent(u))
    const pending = Array.from(this.pendingUtxos.values()).filter(u => !isSpent(u))

    console.debug(`getUtxos: ${onchain.length} on-chain (mempool-aware), ${this.spentOutpoints.size} spent locally, ${pending.length} pending = ${available.length + pending.length} available`)
    return [...available, ...pending]
  }

  registerPendingTx(
    txId,
    spentInputs,
    changeOutput,
  ) {
    for (const input of spentInputs) {
      const key = `${input.txId}:${input.outputIndex}`
      this.spentOutpoints.add(key)
      this.pendingUtxos.delete(key)
    }

    if (changeOutput && changeOutput.satoshis > 0) {
      const key = `${txId}:${changeOutput.outputIndex}`
      this.pendingUtxos.set(key, {
        txId,
        outputIndex: changeOutput.outputIndex,
        satoshis: changeOutput.satoshis,
        script: '',
      })
      console.debug(`registerPendingTx: Added pending UTXO ${key.slice(0, 16)}... (${changeOutput.satoshis} sats)`)
    }

    console.debug(`registerPendingTx: TX ${txId.slice(0, 12)}... spent ${spentInputs.length} inputs, pending UTXOs: ${this.pendingUtxos.size}`)
  }

  clearConfirmedSpends(spentInputs) {
    for (const input of spentInputs) {
      const key = `${input.txId}:${input.outputIndex}`
      this.spentOutpoints.delete(key)
    }
  }

  async getBalance() {
    const utxos = await this.getUtxos()
    return utxos.reduce((sum, u) => sum + u.satoshis, 0)
  }

  relayBroadcast(rawHex) {
    const relays = [
      { name: 'WoC', url: `${WOC_BASE}/tx/raw`, body: { txhex: rawHex } },
      { name: 'BananaBlocks', url: `${BANANA_BASE}/tx/broadcast`, body: { rawtx: rawHex } },
    ]
    return Promise.any(relays.map(async r => {
      const resp = await queuedFetch(r.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.body),
      })
      if (!resp.ok) throw new Error(`${r.name} ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
      return r.name
    }))
  }

  async broadcast(rawHex, opts = {}) {
    const txId = Tx.parse(rawHex).txid()

    try {
      const winner = await this.relayBroadcast(rawHex)
      console.info(`[broadcast] ${txId} accepted by ${winner}`)
    } catch (agg) {
      const errs = (agg)?.errors?.map(e => String((e)?.message ?? e)) ?? [String(agg)]
      throw new Error(`Broadcast rejected by all relays (${txId}): ${errs.join(' | ')}`)
    }

    this.txCache.set(txId, rawHex)

    if (opts.awaitSeen) await this.awaitInMempool(txId, rawHex)
    else void this.confirmLanded(txId, rawHex).catch(() => {})
    return txId
  }

  async visibleOn(txId) {
    const relays = [
      ['BananaBlocks', `${BANANA_BASE}/tx/${txId}`],
      ['WoC', `${WOC_BASE}/tx/${txId}/hex`],
    ]
    const seen = await Promise.all(relays.map(async ([name, url]) => {
      try { return (await fetchWithRetry(url)).ok ? name : null } catch { return null }
    }))
    return seen.find(Boolean) ?? null
  }

  async confirmLanded(txId, rawHex) {
    for (let i = 0; i < CONFIRM_POLL_TRIES; i++) {
      await delay(CONFIRM_POLL_INTERVAL_MS)
      const on = await this.visibleOn(txId)
      if (on) { console.info(`[broadcast] ${txId} confirmed live in mempool (seen by ${on})`); return }
    }
    const secs = Math.round(CONFIRM_POLL_TRIES * CONFIRM_POLL_INTERVAL_MS / 1000)
    console.warn(`[broadcast] ${txId} not visible on any relay after ~${secs}s — re-broadcasting (possible ARC orphan, arc #1006)`)
    try { const w = await this.relayBroadcast(rawHex); console.info(`[broadcast] ${txId} re-broadcast, accepted by ${w}`) }
    catch { console.error(`[broadcast] ${txId} re-broadcast rejected by all relays`) }
  }

  async awaitInMempool(txId, rawHex) {
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < GATE_POLL_TRIES; i++) {
        const on = await this.visibleOn(txId)
        if (on) { console.info(`[broadcast] parent ${txId} in mempool (seen by ${on}) — child tx clear to broadcast`); return }
        await delay(GATE_POLL_INTERVAL_MS)
      }
      if (round === 0) {
        const secs = Math.round(GATE_POLL_TRIES * GATE_POLL_INTERVAL_MS / 1000)
        console.warn(`[broadcast] parent ${txId} not in any mempool after ~${secs}s — re-broadcasting (possible ARC orphan, arc #1006)`)
        try { const w = await this.relayBroadcast(rawHex); console.info(`[broadcast] parent ${txId} re-broadcast, accepted by ${w}`) }
        catch { }
      }
    }
    throw new Error(`Parent tx ${txId} never appeared in a relay mempool — aborting before the dependent tx to avoid "Missing inputs". Please retry the mint.`)
  }

  rawInFlight = new Map()
  parsedInFlight = new Map()

  seedTransactions(entries) {
    for (const e of entries) if (!this.txCache.has(e.txId)) this.txCache.set(e.txId, e.rawHex)
  }

  async getRawTransaction(txId) {
    const cached = this.txCache.get(txId)
    if (cached) return cached
    const pending = this.rawInFlight.get(txId)
    if (pending) return pending
    const p = (async () => {
      const resp = await fetchWithRetry(`${WOC_BASE}/tx/${txId}/hex`)
      if (!resp.ok) throw new Error(`WoC raw TX fetch failed: ${resp.status}`)
      const hex = await resp.text()
      this.txCache.set(txId, hex)
      return hex
    })()
    this.rawInFlight.set(txId, p)
    try { return await p } finally { this.rawInFlight.delete(txId) }
  }

  async getSourceTransaction(txId) {
    const cached = this.parsedTxCache.get(txId)
    if (cached) return cached
    const pending = this.parsedInFlight.get(txId)
    if (pending) return pending
    const p = (async () => {
      const hex = await this.getRawTransaction(txId)
      const tx = Tx.parse(hex)
      this.parsedTxCache.set(txId, tx)
      return tx
    })()
    this.parsedInFlight.set(txId, p)
    try { return await p } finally { this.parsedInFlight.delete(txId) }
  }

  async getOutputScriptHexCapped(txId, index, maxBytes = 512 * 1024) {
    const resp = await fetchWithRetry(`${WOC_BASE}/tx/${txId}/out/${index}/hex`)
    if (resp.status === 404) return null
    if (!resp.ok) throw new Error(`WoC output fetch failed: ${resp.status}`)
    const capHex = maxBytes * 2
    const cl = Number(resp.headers.get('content-length') ?? 0)
    if (cl > capHex) { try { await resp.body?.cancel() } catch { } return 'oversized' }
    const reader = resp.body?.getReader()
    if (reader == null) { const t = (await resp.text()).trim(); return t.length > capHex ? 'oversized' : (t || null) }
    const chunks = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.length
      if (received > capHex) { try { await reader.cancel() } catch { } return 'oversized' }
      chunks.push(value)
    }
    let total = 0; for (const c of chunks) total += c.length
    const buf = new Uint8Array(total); let off = 0; for (const c of chunks) { buf.set(c, off); off += c.length }
    const hex = new TextDecoder().decode(buf).trim()
    return hex.length === 0 ? null : hex
  }

  async getTxConfirmation(txId) {
    try {
      const resp = await fetchWithRetry(`${BANANA_BASE}/tx/${txId}`)
      if (resp.ok) {
        const d = await resp.json()
        const h = (d?.block_height ?? 0)
        return h > 0 ? { blockHeight: h, time: (d?.block_time ?? 0) } : null
      }
    } catch { }
    const resp = await fetchWithRetry(`${WOC_BASE}/tx/hash/${txId}`)
    if (!resp.ok) return null
    const d = await resp.json()
    const h = (d?.blockheight ?? 0)
    if (h <= 0) return null
    return { blockHeight: h, time: (d?.blocktime ?? d?.time ?? 0) }
  }

  async getChainHeight() {
    const resp = await fetchWithRetry(`${WOC_BASE}/chain/info`)
    if (!resp.ok) throw new Error(`WoC chain info fetch failed: ${resp.status}`)
    const data = await resp.json()
    return (data?.blocks ?? 0)
  }

  async getBlockHeader(height) {
    const hashResp = await fetchWithRetry(`${WOC_BASE}/block/height/${height}`)
    if (!hashResp.ok) throw new Error(`WoC block height fetch failed: ${hashResp.status}`)
    const hashBody = await hashResp.text()

    let blockHash
    try {
      const parsed = JSON.parse(hashBody)
      blockHash = typeof parsed === 'string' ? parsed : parsed.hash
    } catch {
      blockHash = hashBody.replace(/"/g, '')
    }

    try {
      const parsed = JSON.parse(hashBody)
      if (typeof parsed === 'object' && parsed.merkleroot) {
        return {
          height,
          merkleRoot: parsed.merkleroot,
          hash: parsed.hash,
          timestamp: parsed.time,
          prevHash: parsed.previousblockhash,
        }
      }
    } catch {
    }

    const headerResp = await fetchWithRetry(`${WOC_BASE}/block/${blockHash}/header`)
    if (!headerResp.ok) throw new Error(`WoC block header fetch failed: ${headerResp.status}`)
    const hdr = await headerResp.json()

    return {
      height,
      merkleRoot: hdr.merkleroot,
      hash: hdr.hash,
      timestamp: hdr.time,
      prevHash: hdr.previousblockhash,
    }
  }

  async getAddressHistory(address = this.getAddress()) {
    const resp = await fetchWithRetry(`${WOC_BASE}/address/${address}/history`)
    if (resp.status === 404) return []
    if (!resp.ok) throw new Error(`WoC history fetch failed: ${resp.status}`)
    const data = await resp.json()
    if (!Array.isArray(data)) return []
    return data.map((entry) => ({
      txId: entry.tx_hash,
      blockHeight: (entry.height ?? 0),
    }))
  }

  async allPages(path, what) {
    const rows = []
    const tokens = new Set()
    let token = ''
    for (;;) {
      const resp = await fetchWithRetry(`${WOC_BASE}${path}${token === '' ? '' : `?token=${encodeURIComponent(token)}`}`)
      if (resp.status === 404 && token === '') return null
      if (!resp.ok) throw new Error(`WoC ${what} fetch failed: ${resp.status}`)
      const data = await resp.json()
      const page = Array.isArray(data?.result) ? data.result : (Array.isArray(data) ? data : [])
      rows.push(...page)
      const next = typeof data?.nextPageToken === 'string' ? data.nextPageToken : ''
      if (page.length === 0 || next === '' || tokens.has(next)) return rows
      tokens.add(next)
      token = next
    }
  }

  async getFullAddressHistory(address = this.getAddress()) {
    const heights = new Map()
    const rowsOf = (data) => Array.isArray(data?.result) ? data.result : (Array.isArray(data) ? data : [])
    for (const r of (await this.allPages(`/address/${address}/confirmed/history`, 'confirmed history')) ?? []) {
      heights.set(r.tx_hash, (r.height ?? 0))
    }
    const pending = await fetchWithRetry(`${WOC_BASE}/address/${address}/unconfirmed/history`)
    if (pending.ok) {
      for (const r of rowsOf(await pending.json())) {
        if (!heights.has(r.tx_hash)) heights.set(r.tx_hash, 0)
      }
    } else if (pending.status !== 404) {
      throw new Error(`WoC unconfirmed history fetch failed: ${pending.status}`)
    }
    return [...heights].map(([txId, blockHeight]) => ({ txId, blockHeight }))
  }

  async getSpendingTx(txId, outputIndex) {
    const resp = await fetchWithRetry(`${WOC_BASE}/tx/${txId}/${outputIndex}/spent`)
    if (resp.status === 404) return null
    if (!resp.ok) throw new Error(`WoC spent lookup failed: ${resp.status}`)
    const d = await resp.json().catch(() => null)
    if (d == null || typeof d.txid !== 'string' || !/^[0-9a-f]{64}$/i.test(d.txid)) return null
    return { txId: d.txid.toLowerCase(), unconfirmed: d.status === 'unconfirmed' }
  }

  async getUnspentByScriptHash(scriptHash) {
    const mapRows = (data) => {
      const rows = Array.isArray(data?.result) ? data.result : (Array.isArray(data) ? data : [])
      return rows
        .filter((u) => u.isSpentInMempoolTx !== true)
        .map((u) => ({ txId: u.tx_hash, outputIndex: u.tx_pos, satoshis: u.value, script: '', height: u.height }))
    }
    let rows = null
    try { rows = await this.allPages(`/script/${scriptHash}/unspent/all`, 'script-unspent') } catch { rows = null }
    if (rows == null) rows = (await this.allPages(`/script/${scriptHash}/unspent`, 'script-unspent')) ?? []
    return mapRows(rows)
  }

  async getUnspentByScriptHashes(scriptHashes) {
    const out = new Map()
    const exact = []
    const rowsOf = (r) => Array.isArray(r?.unspent) ? r.unspent : Array.isArray(r?.result) ? r.result : []
    const post = async (path, body) => {
      try {
        const r = await fetchWithRetry(`${WOC_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        const d = r.ok ? await r.json() : null
        return Array.isArray(d) ? d : null
      } catch { return null }
    }
    for (let i = 0; i < scriptHashes.length; i += BULK_SCRIPTS) {
      const chunk = scriptHashes.slice(i, i + BULK_SCRIPTS)
      const body = JSON.stringify({ scripts: chunk })
      const confirmed = await post('/scripts/unspent', body)
      const pending = confirmed == null ? null : await post('/scripts/unconfirmed/unspent', body)
      if (confirmed == null || pending == null || confirmed.length !== chunk.length || pending.length !== chunk.length) {
        exact.push(...chunk); continue
      }
      chunk.forEach((h, k) => {
        const c = confirmed[k], p = pending[k]
        const rows = rowsOf(c)
        if ((c?.error ?? '') !== '' || (p?.error ?? '') !== '' || rows.length >= BULK_UNSPENT_CAP || rowsOf(p).length > 0) { exact.push(h); return }
        out.set(h, rows.map((u) => ({ txId: u.tx_hash, outputIndex: u.tx_pos, satoshis: u.value, script: '', height: u.height })))
      })
    }
    for (const h of exact) { try { out.set(h, await this.getUnspentByScriptHash(h)) } catch { } }
    return out
  }

  async getRecentTxIdsForAddress(address) {
    const out = new Set()
    try {
      for (const u of (await this.allPages(`/address/${address}/unspent/all`, 'unspent')) ?? []) if (u.tx_hash) out.add(u.tx_hash)
    } catch { }
    return [...out]
  }

  async getMerkleProof(txId) {
    return (await this.merkleProofBanana(txId)) ?? (await this.merkleProofWoC(txId))
  }

  tscPath(nodes, index) {
    const path = []
    let idx = index
    for (const node of nodes) {
      path.push({ hash: node === '*' ? SELF_PAIR : node, position: (idx % 2 === 0) ? 'R' : 'L' })
      idx = idx >> 1
    }
    return path
  }

  async merkleProofBanana(txId) {
    try {
      const pResp = await fetchWithRetry(`${BANANA_WOC_BASE}/tx/${txId}/proof/tsc`)
      if (!pResp.ok) return null
      const raw = await pResp.json()
      const data = Array.isArray(raw) ? raw[0] : raw
      if (!data?.target) return null
      const path = this.tscPath(data.nodes ?? [], data.index ?? 0)

      const txResp = await fetchWithRetry(`${BANANA_BASE}/tx/${txId}`)
      if (!txResp.ok) return null
      const blockHash = (await txResp.json())?.block_hash
      if (!blockHash) return null

      const hResp = await fetchWithRetry(`${BANANA_WOC_BASE}/block/${blockHash}/header`)
      if (!hResp.ok) return null
      const header = await hResp.json()
      if (header?.merkleroot !== data.target) {
        console.debug(`getMerkleProof(banana): merkleroot mismatch for ${txId.slice(0, 12)}…`)
        return null
      }
      return { txId, blockHeight: header.height, merkleRoot: header.merkleroot, path }
    } catch { return null }
  }

  async merkleProofWoC(txId) {
    const resp = await fetchWithRetry(`${WOC_BASE}/tx/${txId}/proof/tsc`)
    if (!resp.ok) { console.debug(`getMerkleProof(woc): ${resp.status} for ${txId.slice(0, 12)}…`); return null }
    const raw = await resp.json()
    const data = Array.isArray(raw) ? raw[0] : raw
    if (!data?.target) return null
    const path = this.tscPath(data.nodes ?? [], data.index ?? 0)
    const headerResp = await fetchWithRetry(`${WOC_BASE}/block/${data.target}/header`)
    if (!headerResp.ok) return null
    const header = await headerResp.json()
    return { txId, blockHeight: header.height, merkleRoot: header.merkleroot, path }
  }
}

