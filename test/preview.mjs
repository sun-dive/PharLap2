// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Preview clips — a large public payload, graded on BYTE-IDENTICAL TRANSACTIONS against the deployed
 * publisher, then resolved: the right collection, authored by the right key, and nothing else.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { fromHex, toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'preview-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [preview · deployed-transaction vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'prev-'))
await build({ entryPoints: [join(HERE, '..', 'src', 'preview.ts')], bundle: true, outfile: join(tmp, 'preview.mjs'),
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const PV = await import(pathToFileURL(join(tmp, 'preview.mjs')).href)

const key = Signer.fromPrivateKey(fromHex(V.key))

function net(fundings) {
  const sent = [], byId = new Map()
  return {
    sent,
    async getUtxos() { return fundings.map(f => ({ ...f, script: '' })) },
    async getSourceTransaction(id) { const t = byId.get(id); if (!t) throw new Error(`no tx ${id}`); return t },
    async broadcast(hex) { const t = Tx.parse(hex); sent.push(hex); byId.set(t.txid(), t); return t.txid() },
    registerPendingTx() {},
    // ⚠ served for EVERY address, so the resolver's own checks are what keep a stranger's key out
    async getAddressHistory() { return sent.map((h, i) => ({ txId: Tx.parse(h).txid(), blockHeight: 800000 + i })) },
    async getRecentTxIdsForAddress() { return [] },
  }
}

// ── ★★★ 1 · byte identity ───────────────────────────────────────────────────────────────────────────
{
  const p = net(V.funding)
  const txId = await PV.publishPreview(p, key, V.collectionId, { mimeType: V.clip.mimeType, bytes: V.clipBytes })
  ok(p.sent.length === 1 && p.sent[0] === V.hex, '★★★ the preview transaction is byte-identical to the deployed publisher')
  ok(txId === V.txId, '★ the deployed txid')
  ok(PV.MAX_PREVIEW_BYTES === V.maxPreviewBytes, '★ the clip cap is the deployed cap')
}

// ── ⛔ 2 · refusals before anything is built ─────────────────────────────────────────────────────────
{
  let threw = ''
  try { await PV.publishPreview(net(V.funding), key, V.collectionId, { mimeType: 'audio/mpeg', bytes: [] }) } catch (e) { threw = String(e.message) }
  ok(/empty/.test(threw), '⛔ an empty clip is refused')
  threw = ''
  try { await PV.publishPreview(net(V.funding), key, V.collectionId, { mimeType: 'audio/mpeg', bytes: new Array(V.maxPreviewBytes + 1).fill(0) }) } catch (e) { threw = String(e.message) }
  ok(/exceeds/.test(threw), '⛔ a clip over the cap is refused')
}

// ── ★★ 3 · resolve: right collection, right author ──────────────────────────────────────────────────
{
  const p = net(V.funding)
  const txId = await PV.publishPreview(p, key, V.collectionId, { mimeType: 'audio/mpeg', bytes: V.clipBytes })
  const got = await PV.resolvePreview(p, toHex(key.publicKey()), V.collectionId)
  ok(got !== null && got.txId === txId && got.mimeType === 'audio/mpeg', '★★ the clip resolves for its collection')
  ok(got !== null && got.bytes.length === V.clipBytes.length && got.bytes.every((b, i) => b === V.clipBytes[i]),
     '★★★ …with every byte intact')
  ok((await PV.resolvePreview(p, toHex(key.publicKey()), 'f'.repeat(64))) === null, '★ a different collection has no clip')
  const stranger = Signer.fromSeed(new Uint8Array(64).fill(94))
  ok((await PV.resolvePreview(p, toHex(stranger.publicKey()), V.collectionId)) === null,
     '⛔ the same transaction does NOT resolve under a stranger\'s key — authorship is checked, not assumed')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [preview · byte-identical transactions]`)
process.exit(fail === 0 ? 0 : 1)
