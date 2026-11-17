// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The sealed key, in a real browser: every path that loads, moves, replaces or removes it (src/keystore.ts and
 * the wallet section of src/app.ts), run against the built page, testbundle2.js.
 *
 * It serves this folder on a free local port, starts headless Chromium with a fresh profile and every outside host
 * unresolvable (nothing reaches a chain API), and removes both when done. The keys are throwaway ones the page
 * makes itself.
 *
 *   node build.mjs && node test/key-seal-browser.mjs        (CHROMIUM=/path/to/chromium to choose the browser)
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0, fail = 0
const ok = (c, what) => { if (c) pass++; else { fail++; console.log('  ✗ ' + what) } }

// ── the page, served from this folder ──
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  try { const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] ?? 'application/octet-stream' }); res.end(body) }
  catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const URL_ = `http://127.0.0.1:${server.address().port}/`

// ── a fresh headless browser ──
const profile = await mkdtemp(join(tmpdir(), 'key-seal-'))
const browser = spawn(process.env.CHROMIUM ?? 'chromium', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', 'about:blank'], { stdio: 'ignore' })
let ws
async function done(code) {
  try { ws?.close() } catch { /* closing */ }
  browser.kill(); server.close(); await sleep(300); await rm(profile, { recursive: true, force: true })
  process.exit(code)
}
let devPort = null
for (let i = 0; i < 100 && devPort == null; i++) { await sleep(100); const f = join(profile, 'DevToolsActivePort'); if (existsSync(f)) devPort = readFileSync(f, 'utf8').split('\n')[0] }
if (devPort == null) { console.log('⚠ Chromium did not start (set CHROMIUM to its path)'); await done(1) }
const tab = await (await fetch(`http://127.0.0.1:${devPort}/json/new?about:blank`, { method: 'PUT' })).json()
ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map(); const waiters = []
ws.onmessage = m => { const d = JSON.parse(m.data)
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) }
  if (d.method) for (const w of [...waiters]) if (w.method === d.method) { waiters.splice(waiters.indexOf(w), 1); w.res(d) } }
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async e => {
  const r = await Promise.race([send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }),
    sleep(20000).then(() => { throw new Error('page call hung: ' + e.slice(0, 80)) })])
  if (r.result?.exceptionDetails) throw new Error('page: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value
}
const event = method => new Promise(res => waiters.push({ method, res }))
await send('Page.enable'); await send('Runtime.enable')

/** Load (or reload) the page; wait until it shows a wallet ('wallet'), or the "will not open" dialog ('modal'). */
async function load() {
  const loaded = event('Page.loadEventFired'); await send('Page.navigate', { url: URL_ }); await loaded
  for (let i = 0; i < 100; i++) { await sleep(100)
    const s = await ev("(document.querySelector('.modal .unr-secret') ? 'modal' : '') + '|' + (document.getElementById('address')?.textContent ?? '')")
    if (s.startsWith('modal') || s.split('|')[1] !== '') return s.startsWith('modal') ? 'modal' : 'wallet' }
  return 'timeout'
}
/** The key store, read and written directly, as another script on the site could. */
const IDB = `((op, argIn) => Promise.resolve(argIn).then(arg => new Promise((res, rej) => { const r = indexedDB.open('pharlap2-keys', 1)
  r.onupgradeneeded = () => r.result.createObjectStore('keys')
  r.onsuccess = () => { const db = r.result, ro = op === 'get' || op === 'count', tx = db.transaction('keys', ro ? 'readonly' : 'readwrite'), s = tx.objectStore('keys')
    const q = op === 'get' ? s.get('wallet') : op === 'count' ? s.count('wallet') : op === 'put' ? s.put(arg, 'wallet') : s.delete('wallet')
    if (ro) q.onsuccess = () => { db.close(); const v = q.result; res(op === 'count' ? v : v == null ? null :
      { key: v.key instanceof CryptoKey, extractable: v.key?.extractable, alg: v.key?.algorithm?.name, ct: v.ct ? [...v.ct].map(b => b.toString(16).padStart(2, '0')).join('') : null }) }
    else tx.oncomplete = () => { db.close(); res(true) } }
  r.onerror = () => rej(r.error) })))`
const idb = (op, argExpr = 'undefined') => ev(`${IDB}('${op}', ${argExpr})`)
const address = () => ev("document.getElementById('address').textContent")
const plain = () => ev("JSON.stringify([localStorage.getItem('p2:wallet:wif'), localStorage.getItem('p2:wallet:mnemonic')])").then(JSON.parse)
const click = sel => ev(`document.querySelector('${sel}').click(), 1`)
const fieldVal = sel => ev(`document.querySelector('${sel}').value`)
async function revealWords() { await click('#btnSeedShow'); const w = await fieldVal('#seedPhrase'); await click('#btnSeedShow'); return w }
async function showWif() { await click('#btnWifShow'); const w = await fieldVal('#wif'); await click('#btnWifShow'); return w }
async function until(fn, ms = 8000) { const t = Date.now(); for (;;) { if (await fn()) return true; if (Date.now() - t > ms) return false; await sleep(100) } }
const anyStorageHolds = s => ev(`(() => { for (let i = 0; i < localStorage.length; i++) { if ((localStorage.getItem(localStorage.key(i)) ?? '').includes(${JSON.stringify(s)})) return localStorage.key(i) } return null })()`)

try {
  console.log('1 · first run: a new wallet, sealed')
  ok(await load() === 'wallet', 'the page shows a wallet')
  const A0 = await address()
  const rec = await idb('get')
  ok(rec != null && rec.key && rec.extractable === false && rec.alg === 'AES-GCM', `one sealed record under a non-extractable AES key: ${JSON.stringify(rec && { ...rec, ct: undefined })}`)
  ok(JSON.stringify(await plain()) === '[null,null]', 'no plain copies in localStorage')
  ok(await fieldVal('#wif') === '' && await fieldVal('#seedPhrase') === '', 'the WIF and the words are not in the page')
  ok((await ev("document.getElementById('keySealNote').textContent")).startsWith('🔒'), 'the note says sealed')
  const W0 = await revealWords(), WIF0 = await showWif()
  ok(W0.split(' ').length === 12, 'Reveal shows 12 words')
  ok(/^[KL][1-9A-HJ-NP-Za-km-z]{51}$/.test(WIF0), 'Show shows the WIF')
  ok(await fieldVal('#wif') === '' && await fieldVal('#seedPhrase') === '', 'Hide takes them out of the page again')
  ok(await anyStorageHolds(WIF0) == null && await anyStorageHolds(W0) == null, 'no localStorage item holds the WIF or the words')
  ok(!rec.ct.includes(Buffer.from(WIF0).toString('hex')), 'the record does not hold the WIF in the clear')

  console.log('2 · reload: the same wallet, from the seal')
  ok(await load() === 'wallet' && await address() === A0, 'same address after a reload')

  console.log('3 · a browser from before the seal: plain copies are moved in')
  await ev("new Promise(r => { const q = indexedDB.deleteDatabase('pharlap2-keys'); q.onsuccess = q.onerror = q.onblocked = () => r(1) })")
  await ev(`localStorage.setItem('p2:wallet:wif', ${JSON.stringify(WIF0)}); localStorage.setItem('p2:wallet:mnemonic', ${JSON.stringify(W0)}); 1`)
  ok(await load() === 'wallet' && await address() === A0, 'same address from the plain copy')
  ok(await idb('count') === 1, 'now sealed')
  ok(JSON.stringify(await plain()) === '[null,null]', 'plain copies deleted once sealed')
  ok(await revealWords() === W0, 'the words moved too')

  console.log('4 · New wallet replaces it; a plain copy of a DIFFERENT key is left alone')
  await ev('window.confirm = () => true, 1'); await click('#btnNewWallet')
  ok(await until(async () => (await address()) !== A0), 'a new address')
  const A1 = await address()
  ok(await ev("!!document.querySelector('.modal .seed-grid')"), 'the new words are shown to write down')
  await ev("document.querySelector('.modal .seed-done')?.click(), 1")
  const WIF1 = await showWif()
  await ev(`localStorage.setItem('p2:wallet:wif', ${JSON.stringify(WIF0)}); 1`)
  ok(await load() === 'wallet' && await address() === A1, 'the sealed wallet loads')
  ok((await plain())[0] === WIF0, 'the plain copy of the other key is still there')
  await ev("localStorage.removeItem('p2:wallet:wif'), 1")

  console.log('5 · a record the browser will not open (Safari: reads back null): never written over')
  await idb('put', 'null')
  ok(await load() === 'modal', 'the "will not open" dialog')
  ok(await idb('count') === 1 && await idb('get') === null, 'the record is untouched')
  ok(JSON.stringify(await plain()) === '[null,null]', 'no new wallet kept in localStorage')
  await click('.modal .unr-new')
  ok(await ev("document.querySelector('.modal .unr-new').textContent") === 'Yes, replace the saved wallet' && await ev("!!document.querySelector('.modal .unr-secret')"), 'Start a new wallet asks again first')
  ok(await idb('get') === null, 'still untouched')
  await ev("document.querySelector('.modal .unr-secret').value = 'not a key', 1"); await click('.modal .unr-restore')
  ok(await ev("!document.querySelector('.modal .unr-err').hidden"), 'a wrong entry is refused')
  ok(await idb('get') === null, 'still untouched')
  await ev(`document.querySelector('.modal .unr-secret').value = ${JSON.stringify(W0)}, 1`); await click('.modal .unr-restore')
  ok(await until(async () => (await ev("!document.querySelector('.modal .unr-secret')")) && (await address()) === A0), 'restored from the words')
  ok(await until(async () => (await idb('get'))?.key === true), 'and kept sealed')
  ok(await load() === 'wallet' && await address() === A0, 'the restored wallet loads after a reload')

  console.log('6 · a record that will not decrypt: never written over; restore by WIF')
  await idb('put', "(async () => { const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); return { v: 1, key, iv: new Uint8Array(12), ct: crypto.getRandomValues(new Uint8Array(64)) } })()")
  const badCt = (await idb('get')).ct
  ok(await load() === 'modal', 'the "will not open" dialog')
  ok((await idb('get')).ct === badCt, 'the record is untouched')
  await ev(`document.querySelector('.modal .unr-secret').value = ${JSON.stringify(WIF1)}, 1`); await click('.modal .unr-restore')
  ok(await until(async () => (await address()) === A1), 'restored from the WIF')
  ok(await until(async () => (await idb('get'))?.ct !== badCt), 'and kept sealed')
  ok(await load() === 'wallet' && await address() === A1, 'loads after a reload')
  ok(await revealWords() === '', 'a WIF wallet has no words')

  console.log('7 · the store fails once while loading: nothing sealed is written over, even when it works again')
  const sealedCt = (await idb('get')).ct
  const { result: { identifier } } = await send('Page.addScriptToEvaluateOnNewDocument', { source:
    "{ const o = IDBFactory.prototype.open; let n = 0; IDBFactory.prototype.open = function (...a) { if (a[0] === 'pharlap2-keys' && n++ === 0) throw new Error('test: one failed open'); return o.apply(this, a) } }" })
  ok(await load() === 'wallet', 'the page still opens')
  ok(await address() !== A1, 'with a wallet of its own for this load')
  ok((await ev("document.getElementById('keySealNote').textContent")).startsWith('⚠'), 'the note says unsealed')
  ok((await plain())[0] != null, 'kept as a plain copy')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  ok(await load() === 'wallet' && await address() === A1, 'next load: the sealed wallet, unharmed')
  ok((await idb('get')).ct === sealedCt, 'the sealed record was never written')
  await ev("localStorage.removeItem('p2:wallet:wif'); localStorage.removeItem('p2:wallet:mnemonic'), 1")

  console.log('8 · watch-only removes the key; leaving it makes a new sealed one')
  const pub = await ev("document.getElementById('pubkey').textContent")
  await ev(`document.getElementById('watchPubKey').value = ${JSON.stringify(pub)}, 1`); await click('#btnWatchLoad')
  ok(await until(async () => (await idb('count')) === 0), 'the sealed key is removed')
  ok(JSON.stringify(await plain()) === '[null,null]', 'no plain copies')
  ok(await load() === 'wallet' && await ev("document.body.classList.contains('watch-only')") && await address() === A1, 'reload: watch-only, same address')
  await ev('window.confirm = () => true, 1'); await click('#btnWatchExit')
  ok(await until(async () => (await idb('count')) === 1 && (await address()) !== A1), 'leaving watch-only makes a new sealed wallet')
  await ev("document.querySelector('.modal .seed-done')?.click(), 1")

  console.log('9 · Restore from WIF: kept sealed, and the field is cleared')
  await ev(`document.getElementById('restoreWif').value = ${JSON.stringify(WIF0)}, 1`); await click('#btnRestore')
  ok(await until(async () => (await address()) === A0), 'restored')
  ok(await fieldVal('#restoreWif') === '', 'the WIF is not left in the field')
  ok(await load() === 'wallet' && await address() === A0, 'loads after a reload')
} catch (e) { fail++; console.log('  ✗ stopped: ' + e.message) }

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [key-seal-browser · the sealed key in Chromium]`)
await done(fail === 0 ? 0 : 1)
