// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The sealed key, in a real browser: every path that loads, moves, replaces or removes it (src/keystore.js and
 * the wallet section of src/app.js), run against the page as it is served.
 *
 * It serves this folder on a free local port, starts headless Chromium with a fresh profile and every outside host
 * unresolvable (nothing reaches a chain API), and removes both when done. The keys are throwaway ones the page
 * makes itself.
 *
 *   node test/key-seal-browser.mjs        (CHROMIUM=/path/to/chromium to choose the browser)
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
// The wallet page carries its script policy in index.html, so every check here runs under it.
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = path.endsWith('/') ? path + 'index.html' : path
  try {
    const body = await readFile(join(ROOT, file)), head = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }
    res.writeHead(200, head); res.end(body)
  }
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
/** A sealed record opened by name, as the page's own code could: { wif, words }, or null. */
const openRecord = id => ev(`new Promise(res => { const r = indexedDB.open('pharlap2-keys', 1); r.onupgradeneeded = () => r.transaction.abort(); r.onerror = () => res(null)
  r.onsuccess = () => { const db = r.result, q = db.transaction('keys').objectStore('keys').get(${JSON.stringify(id)}); q.onsuccess = async () => { db.close(); const v = q.result
    if (v == null) return res(null); try { res(JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: v.iv }, v.key, v.ct)))) } catch { res('will not open') } } } })`)
/** Every Phar Lap 1 item (`p:`), less the picture caches both wallets share. */
const p1Items = () => ev("JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith('p:') && !/^p:(mime|thumb)/.test(k)).sort().map(k => [k, localStorage.getItem(k)]))")
const resetAll = () => ev("new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('pharlap2-keys'); q.onsuccess = q.onerror = q.onblocked = () => r(1) })")
const setItems = obj => ev(`(() => { const o = ${JSON.stringify(obj)}; for (const k in o) localStorage.setItem(k, o[k]); return 1 })()`)
const item = k => ev(`localStorage.getItem(${JSON.stringify(k)})`)
/** No Phar Lap 1 item written by this page since it loaded. */
const p1Untouched = async () => (await ev('JSON.stringify(window.__p1Writes ?? null)')) === '[]'
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

  console.log('7 · the store fails once while loading: never a new wallet, and nothing sealed is written over')
  const sealedCt = (await idb('get')).ct
  const { result: { identifier } } = await send('Page.addScriptToEvaluateOnNewDocument', { source:
    "{ const o = IDBFactory.prototype.open; let n = 0; IDBFactory.prototype.open = function (...a) { if (a[0] === 'pharlap2-keys' && n++ === 0) throw new Error('test: one failed open'); return o.apply(this, a) } }" })
  ok(await load() === 'modal', 'the "will not open" dialog, not a new wallet')
  ok(await ev("!!document.querySelector('.modal .unr-reload')"), 'it offers Reload')
  ok(JSON.stringify(await plain()) === '[null,null]', 'no new wallet kept')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  const reloaded = event('Page.loadEventFired'); await click('.modal .unr-reload'); await reloaded
  ok(await until(async () => (await ev("document.getElementById('address')?.textContent ?? ''")) === A1), 'Reload opens the sealed wallet, unharmed')
  ok((await idb('get')).ct === sealedCt, 'the sealed record was never written')

  console.log('7b · the same in a browser sealed before the flag existed: the sealed record is still never written')
  await ev("localStorage.removeItem('p2:wallet:sealed'), 1")
  const { result: { identifier: id7b } } = await send('Page.addScriptToEvaluateOnNewDocument', { source:
    "{ const o = IDBFactory.prototype.open; let n = 0; IDBFactory.prototype.open = function (...a) { if (a[0] === 'pharlap2-keys' && n++ === 0) throw new Error('test: one failed open'); return o.apply(this, a) } }" })
  ok(await load() === 'wallet', 'a wallet opens for this load')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id7b })
  ok(await load() === 'wallet' && await address() === A1, 'next load: the sealed wallet')
  ok((await idb('get')).ct === sealedCt, 'the sealed record was never written')
  ok(await item('p2:wallet:sealed') === '1', 'and the flag is set again')
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

  console.log('10 · a browser with only a Phar Lap 1 wallet: imported, and Phar Lap 1 left as it was')
  // From here on, every page records each write to a Phar Lap 1 item, even one that writes the same value.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "{ const s = Storage.prototype.setItem, r = Storage.prototype.removeItem; window.__p1Writes = []; const p1 = k => /^p:/.test(k) && !/^p:(mime|thumb)/.test(k); Storage.prototype.setItem = function (k, v) { if (p1(String(k))) window.__p1Writes.push(String(k)); return s.call(this, k, v) }; Storage.prototype.removeItem = function (k) { if (p1(String(k))) window.__p1Writes.push('-' + k); return r.call(this, k) } }" })
  await resetAll()
  const fakeToken = JSON.stringify([{ txId: 'ab'.repeat(32), outputIndex: 1, collectionId: 'cd'.repeat(32), status: 'active', addedAt: 1, heightHint: 900000, stateData: '' }])
  await setItems({ 'p:wallet:wif': WIF1, 'p:tokens': fakeToken, 'p:contacts': '{"02aa":"alice"}', 'p:myalias': 'tester', 'p:aliases': '{"02bb":"bob"}', 'p:nftview': 'grid', 'p:wallet:backedUp': '1' })
  const p1Before = await p1Items()
  ok(await load() === 'wallet' && await address() === A1, 'Phar Lap 1\'s wallet opens')
  ok((await openRecord('wallet'))?.wif === WIF1, 'its key is sealed as Phar Lap 2\'s')
  ok(await item('p2:tokens') === fakeToken, 'its token list is copied')
  ok(await item('p2:contacts') === '{"02aa":"alice"}' && await item('p2:myalias') === 'tester' && await item('p2:nftview') === 'grid', 'its contacts, name and settings are copied')
  ok(await item('p2:wallet:importedFrom1') === A1, 'recorded as imported')
  ok(await p1Items() === p1Before, 'every Phar Lap 1 item is unchanged'); ok(await p1Untouched(), 'and none was written')
  ok(await load() === 'wallet' && await address() === A1, 'a reload opens it again')

  console.log('11 · a wallet chosen in Phar Lap 2 afterwards is never replaced by the import again')
  await ev('window.confirm = () => true, 1'); await click('#btnNewWallet')
  ok(await until(async () => (await address()) !== A1), 'a new wallet')
  const A2 = await address()
  await ev("document.querySelector('.modal .seed-done')?.click(), 1")
  const WIF2 = await showWif()
  ok(await load() === 'wallet' && await address() === A2, 'it stays after a reload')
  ok(await p1Items() === p1Before, 'every Phar Lap 1 item is unchanged'); ok(await p1Untouched(), 'and none was written')

  console.log('12 · a different Phar Lap 1 wallet, not yet imported: it opens; the Phar Lap 2 wallet is kept aside')
  await setItems({ 'p:wallet:wif': WIF0 })
  const p1Before12 = await p1Items()
  ok(await load() === 'wallet' && await address() === A0, 'Phar Lap 1\'s wallet opens')
  ok((await openRecord('aside:' + A2))?.wif === WIF2, 'the Phar Lap 2 wallet is kept aside, sealed')
  ok(await item('p2:tokens') === fakeToken, 'the token list is Phar Lap 1\'s')
  ok(await p1Items() === p1Before12, 'every Phar Lap 1 item is unchanged'); ok(await p1Untouched(), 'and none was written')

  console.log('13 · the same key in both: nothing changes; a failing store offers the original wallet')
  ok(await load() === 'wallet' && await address() === A0, 'opens as it was')
  const { result: { identifier: id13 } } = await send('Page.addScriptToEvaluateOnNewDocument', { source:
    "{ const o = IDBFactory.prototype.open; let n = 0; IDBFactory.prototype.open = function (...a) { if (a[0] === 'pharlap2-keys' && n++ === 0) throw new Error('test: one failed open'); return o.apply(this, a) } }" })
  ok(await load() === 'modal', 'the "will not open" dialog')
  ok(await ev("!!document.querySelector('.modal .unr-p1')"), 'it offers the original wallet')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id13 })
  await click('.modal .unr-p1')
  ok(await until(async () => (await ev("!document.querySelector('.modal .unr-secret')")) && (await address()) === A0), 'the original wallet opens')
  ok(await p1Untouched(), 'opening it wrote no Phar Lap 1 item')
  ok(await load() === 'wallet' && await address() === A0, 'and after a reload')
  ok(await p1Items() === p1Before12, 'every Phar Lap 1 item is unchanged'); ok(await p1Untouched(), 'and none was written')

  console.log('14 · a Phar Lap 1 watch-only wallet and nothing here: imported as watch-only')
  const pubA0 = await ev("document.getElementById('pubkey').textContent")
  await resetAll(); await setItems({ 'p:wallet:watch': pubA0 })
  const p1Before14 = await p1Items()
  ok(await load() === 'wallet' && await ev("document.body.classList.contains('watch-only')") && await address() === A0, 'watch-only, same address')
  ok(await idb('count') === 0 && JSON.stringify(await plain()) === '[null,null]', 'no key on this box')
  ok(await p1Items() === p1Before14, 'every Phar Lap 1 item is unchanged'); ok(await p1Untouched(), 'and none was written')

  console.log('15 · a Phar Lap 1 key that does not parse: left alone, never imported')
  await resetAll(); await setItems({ 'p:wallet:wif': 'not a key' })
  ok(await load() === 'wallet' && (await item('p2:wallet:importedFrom1')) == null, 'a wallet opens; nothing imported')
  ok(await item('p:wallet:wif') === 'not a key', 'the Phar Lap 1 item is unchanged')
  ok(await p1Untouched(), 'and was not written')
} catch (e) { fail++; console.log('  ✗ stopped: ' + e.message) }

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [key-seal-browser · the sealed key in Chromium]`)
await done(fail === 0 ? 0 : 1)
