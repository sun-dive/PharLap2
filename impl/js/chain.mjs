// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { reversed, fromHex, toHex } from './bytes.mjs'
import { Tx } from './transaction.mjs'

export const MIN_REQUEST_GAP_MS = 350
export const WOC_MAIN = 'https://api.whatsonchain.com/v1/bsv/main'
export const BANANA_MAIN = 'https://bananablocks.com/api/v1'

export class ChainError extends Error {}

export class RateLimiter {
  constructor(minGapMs = MIN_REQUEST_GAP_MS, sleep = defaultSleep) {
    this.minGapMs = minGapMs
    this.sleep = sleep
    this.chain = Promise.resolve()
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      this.chain = this.chain.then(async () => {
        try { resolve(await fn()) } catch (e) { reject(e) }
        await this.sleep(this.minGapMs)
      })
    })
  }
}

const defaultSleep = ms => new Promise(r => setTimeout(r, ms))

export class ChainHttp {
  constructor({ fetchImpl, sleep = defaultSleep, minGapMs = MIN_REQUEST_GAP_MS, maxRetries = 3 } = {}) {
    this.fetchImpl = fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
    this.sleep = sleep
    this.minGapMs = minGapMs
    this.maxRetries = maxRetries
    this.limiters = new Map()
  }

  limiter(url) {
    let host
    try { host = new URL(url).host } catch { throw new ChainError(`not a URL: ${url}`) }
    if (!host) throw new ChainError(`no host in URL: ${url}`)
    if (!this.limiters.has(host)) this.limiters.set(host, new RateLimiter(this.minGapMs, this.sleep))
    return this.limiters.get(host)
  }

  async request(url, init) {
    if (this.fetchImpl === null) throw new ChainError('no fetch available and none was injected')
    const lim = this.limiter(url)
    for (let attempt = 0; ; attempt++) {
      const resp = await lim.run(() => this.fetchImpl(url, init))
      if (resp.status !== 429 || attempt >= this.maxRetries) return resp
      const after = resp.headers?.get?.('retry-after')
      const ms = after !== null && after !== undefined && after !== '' && Number.isFinite(Number(after))
        ? Number(after) * 1000
        : 500 * (attempt + 1)
      await this.sleep(Math.min(ms, 60000))
    }
  }

  async json(url, init) {
    const r = await this.request(url, init)
    if (!r.ok) throw new ChainError(`${url} returned HTTP ${r.status}`)
    return r.json()
  }
}

