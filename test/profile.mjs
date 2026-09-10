// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Profiles — publish-to-self, graded on BYTE-IDENTICAL TRANSACTIONS against the deployed publisher, then
 * resolved: the newest profile on the key's address wins, and a key with no history has no profile.
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
try { V = JSON.parse(readFileSync(join(HERE, 'profile-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [profile · deployed-transaction vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'prof-'))
await build({ entryPoints: [join(HERE, '..', 'src', 'profile.ts')], bundle: true, outfile: join(tmp, 'profile.mjs'),
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const PR = await import(pathToFileURL(join(tmp, 'profile.mjs')).href)

const key = Signer.fromPrivateKey(fromHex(V.key))

/** A fake network: one funding utxo, broadcasts captured, history served per address with rising heights. */
function net(fundings) {
  const sent = [], byId = new Map(), heights = new Map()
  let h = 800000
  return {
    sent,
    async getUtxos() { return fundings.map(f => ({ ...f, script: '' })) },
    async getSourceTransaction(id) { const t = byId.get(id); if (!t) throw new Error(`no tx ${id}`); return t },
    async broadcast(hex) { const t = Tx.parse(hex); sent.push(hex); byId.set(t.txid(), t); heights.set(t.txid(), h++); return t.txid() },
    registerPendingTx() {},
    async getAddressHistory(a) { return a === key.address() ? [...heights].map(([txId, blockHeight]) => ({ txId, blockHeight })) : [] },
    async getRecentTxIdsForAddress() { return [] },
  }
}

// ── ★★★ 1 · byte identity ───────────────────────────────────────────────────────────────────────────
for (const c of V.cases) {
  const p = net(c.funding)
  const profile = c.profile.avatar ? { alias: c.profile.alias, avatar: { mimeType: c.profile.avatar.mimeType, bytes: V.avatar } } : { alias: c.profile.alias }
  const txId = await PR.publishProfile(p, key, profile)
  ok(p.sent.length === 1 && p.sent[0] === c.hex, `★★★ ${c.name}: byte-identical to the deployed publisher`)
  ok(txId === c.txId, `★ ${c.name}: the deployed txid`)
}

// ── ★★ 2 · resolve: newest wins ─────────────────────────────────────────────────────────────────────
{
  const p = net(V.cases[0].funding)
  await PR.publishProfile(p, key, { alias: 'first', avatar: { mimeType: 'image/webp', bytes: V.avatar } })
  await PR.publishProfile(p, key, { alias: 'second' })
  const got = await PR.resolveProfile(p, toHex(key.publicKey()))
  ok(got !== null && got.alias === 'second', '★★★ the NEWEST profile on the address is the one resolved')
  ok(got !== null && got.avatarBytes === undefined, '★ …exactly as published: the later one carried no avatar')
  const stranger = Signer.fromSeed(new Uint8Array(64).fill(93))
  ok((await PR.resolveProfile(p, toHex(stranger.publicKey()))) === null, '★ a key with no history has no profile')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [profile · byte-identical transactions]`)
process.exit(fail === 0 ? 0 : 1)
