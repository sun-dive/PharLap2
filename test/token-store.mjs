// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The token store — what a stored token keeps, driven through an in-memory key-value store.
 *
 * ⚠ `add` copies a fixed list of fields, so a field the caller passes and the list omits is dropped with no
 *   error: a spread argument escapes TypeScript's check. The block height was lost that way, and the
 *   holdings list then fell back to the moment each token was added, which after a restore is all one moment.
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'tstore-'))
await build({ entryPoints: [join(HERE, '..', 'src', 'pharlapStore.ts')], bundle: true, outfile: join(tmp, 'ps.mjs'),
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const PS = await import(pathToFileURL(join(tmp, 'ps.mjs')).href)

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) } } }
const A = 'a1'.repeat(32), B = 'b2'.repeat(32), C = 'c3'.repeat(32)
const base = (txId, extra = {}) => ({ txId, outputIndex: 0, collectionId: C, stateData: '', ...extra })

// ── ★★★ the block height is kept ────────────────────────────────────────────────────────────────────
{
  const kv = memory()
  const store = new PS.PharLapStore(kv)
  ok(store.add(base(A, { kind: 'edition', heightHint: 966716 })), 'a token with a block height is added')
  ok(new PS.PharLapStore(kv).list()[0]?.heightHint === 966716, '★★★ …and its height survives a reload')
  ok(store.add(base(B)) && store.list().find(t => t.txId === B)?.heightHint === undefined, '★ a token with no height is stored without one')
}

// ── ★★ a token stored without its height gets it later ──────────────────────────────────────────────
{
  const store = new PS.PharLapStore(memory())
  store.add(base(A))
  ok(store.setHeightHint(A, 0, 959890) === true, '★★ the height is filled in on a token stored without it')
  ok(store.list()[0].heightHint === 959890, '★★ …and kept')
  ok(store.setHeightHint(A, 0, 959890) === false, '★ the same height again changes nothing')
  ok(store.setHeightHint(A, 0, 0) === false && store.list()[0].heightHint === 959890, '⛔ height 0 (unconfirmed) never replaces a known block')
  ok(store.setHeightHint(B, 0, 1) === false, '⛔ an outpoint the store does not hold is not created')
  ok(store.list().length === 1 && store.list()[0].collectionId === C, '★ …and nothing else about the token changes')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [token store · an in-memory key-value store]`)
process.exit(fail === 0 ? 0 : 1)
