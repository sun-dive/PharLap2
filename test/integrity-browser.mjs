// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The page's file hashes, in real browsers. index.html carries an import map naming every module with its SHA-384.
 * This checks that the wallet runs from exactly those files; that a module changed by one byte stops the app, under
 * each cache header a server or anyone between could send (none, no-cache, no-store); and that the QR scanner the app adds later loads under the hash app.js gives it and is refused when
 * changed. Chromium is driven through DevTools; Firefox, which ran a changed module when only preload hashes guarded
 * it, loads the same pages and reports what it shows.
 *
 * Headless, fresh profiles, every outside host unresolvable in Chromium; all removed when done.
 *
 *   node test/integrity-browser.mjs        (CHROMIUM=…, FIREFOX=… to choose the browsers)
 */
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0, fail = 0
const ok = (c, what) => { if (c) pass++; else { fail++; console.log('  ✗ ' + what) } }

const page = readFileSync(join(ROOT, 'index.html'), 'utf8')
const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? '{}')
const listed = new Set(Object.keys(map.integrity ?? {}).map(p => p.replace(/^\.\//, '')))
const classic = [...page.matchAll(/<script src="\.\/([^"]+)" integrity="[^"]+"><\/script>/g)].map(m => m[1])
const app = readFileSync(join(ROOT, 'src', 'app.js'), 'utf8')
const jsqrHash = /const JSQR_INTEGRITY = '([^']+)'/.exec(app)?.[1]
const VERSION = /const APP_VERSION = '([^']+)'/.exec(app)?.[1]
const CACHES = ['none', 'no-cache', 'no-store']

// ── /<g|t>/<cache>/<c|f>/… : genuine or tampered files (src/keystore.js and jsqr.min.js changed by one byte), the
//    cache header sent with every file, and for Firefox (f) a reporting script added to the page ──
const TAMPERED = new Set(['/src/keystore.js', '/jsqr.min.js'])
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
const REPORT = "setTimeout(() => fetch('/__result?' + encodeURIComponent(location.pathname + '|' + (document.getElementById('appVersion')?.textContent ?? ''))), 6000)\n"
const requested = new Set(); const reports = []
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/__report.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(REPORT); return }
  if (url.pathname === '/__result') { reports.push(decodeURIComponent(url.search.slice(1))); res.end(); return }
  const parts = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '').split('/')
  const [, kind, cache, who] = parts
  let path = '/' + parts.slice(4).join('/')
  if (path.endsWith('/')) path += 'index.html'
  if (kind === 'g' && cache === 'none' && who === 'c') requested.add(path.slice(1))
  try {
    let body = await readFile(join(ROOT, path))
    if (kind === 't' && TAMPERED.has(path)) body = Buffer.concat([body, Buffer.from(' ')])
    if (who === 'f' && path === '/index.html') body = Buffer.from(body.toString('utf8').replace('</body>', '<script src="/__report.js"></script></body>'))
    const head = { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }
    if (cache !== 'none') head['cache-control'] = cache
    res.writeHead(200, head); res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`
const at = (kind, cache, who) => `${BASE}/${kind}/${cache}/${who}/`

const profile = await mkdtemp(join(tmpdir(), 'integrity-'))
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
let id = 0; const pending = new Map(); const waiters = []; const consoleLines = []
ws.onmessage = m => { const d = JSON.parse(m.data)
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) }
  if (d.method === 'Runtime.consoleAPICalled' || d.method === 'Log.entryAdded') consoleLines.push(d.params.entry?.text ?? (d.params.args ?? []).map(a => a.value ?? '').join(' '))
  if (d.method) for (const w of [...waiters]) if (w.method === d.method) { waiters.splice(waiters.indexOf(w), 1); w.res(d) } }
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async e => {
  const r = await Promise.race([send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }),
    sleep(20000).then(() => { throw new Error('page call hung: ' + e.slice(0, 80)) })])
  if (r.result?.exceptionDetails) throw new Error('page: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value
}
const event = method => new Promise(res => waiters.push({ method, res }))
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
async function go(url) { const loaded = event('Page.loadEventFired'); await send('Page.navigate', { url }); await loaded }
async function walletShown(tries = 100) { for (let i = 0; i < tries; i++) { await sleep(100); if ((await ev("document.getElementById('address')?.textContent ?? ''")) !== '') return true } return false }
const shown = () => ev("({ version: document.getElementById('appVersion')?.textContent ?? '' })")
const loadScanner = (base, hash) => ev(`new Promise(res => { const s = document.createElement('script'); s.src = ${JSON.stringify(base + 'jsqr.min.js')}; s.integrity = ${JSON.stringify(hash)}; s.onload = () => res(typeof window.jsQRlib); s.onerror = () => res('refused'); document.head.append(s) })`)

try {
  ok(listed.size > 50 && listed.has('src/app.js') && jsqrHash && VERSION,
    `index.html's import map names ${listed.size} modules with the app's entry, app.js gives the QR scanner's hash and the version`)

  console.log('1 · Chromium: the wallet runs from exactly the files index.html names')
  await go(at('g', 'none', 'c'))
  ok(await walletShown(), 'the wallet opens')
  const s1 = await shown()
  ok(s1.version === `Smart NFTs · v${VERSION}`, `the version reads v${VERSION} (${JSON.stringify(s1)})`)
  const scripts = [...requested].filter(p => /\.m?js$/.test(p))
  const unlisted = scripts.filter(p => !listed.has(p) && !classic.includes(p))
  ok(unlisted.length === 0, `every script the browser asked for is named (not named: ${unlisted.join(', ')})`)
  const unused = [...listed].filter(p => !requested.has(p))
  ok(unused.length === 0, `every module in the import map was fetched (not fetched: ${unused.join(', ')})`)
  ok(!consoleLines.some(l => /integrity|digest|Content Security/i.test(l)), `nothing refused: ${consoleLines.filter(l => /integrity|digest|Content Security/i.test(l)).slice(0, 2).join(' | ')}`)
  const genuine = await loadScanner(at('g', 'none', 'c'), jsqrHash)
  ok(genuine === 'function' || genuine === 'object', `the QR scanner loads under the hash app.js gives it (${genuine})`)

  console.log('2 · Chromium: one module changed by one byte, under each cache header: refused')
  for (const cache of CACHES) {
    consoleLines.length = 0
    await go(at('t', cache, 'c'))
    ok(!(await walletShown(40)), `${cache}: the wallet does not open`)
    const s = await shown()
    ok(s.version === '', `${cache}: no app code ran (${JSON.stringify(s)})`)
  }

  console.log('3 · Chromium: the QR scanner changed by one byte: refused')
  ok(await loadScanner(at('t', 'none', 'c'), jsqrHash) === 'refused', 'the changed scanner is refused')

  console.log('4 · Firefox: the same pages')
  const firefox = process.env.FIREFOX ?? 'firefox'
  if (spawnSync(firefox, ['--version'], { stdio: 'ignore' }).status !== 0) ok(false, 'Firefox did not start (set FIREFOX to its path): not checked')
  else {
    for (const [kind, cache] of [['g', 'none'], ...CACHES.map(c => ['t', c])]) {
      const dir = await mkdtemp(join(tmpdir(), 'integrity-ff-'))
      const before = reports.length
      const ff = spawn(firefox, ['--headless', '--no-remote', '--profile', dir, at(kind, cache, 'f')], { stdio: 'ignore' })
      for (let i = 0; i < 200 && reports.length === before; i++) await sleep(100)
      ff.kill(); await sleep(500); await rm(dir, { recursive: true, force: true })
      const [, version = ''] = (reports[before] ?? 'no report|').split('|')
      if (kind === 'g') ok(version === `Smart NFTs · v${VERSION}`, `genuine: the app runs (${reports[before] ?? 'no report'})`)
      else ok(version === '', `${cache}: refused, no app code ran (${reports[before] ?? 'no report'})`)
    }
  }
} catch (e) { fail++; console.log('  ✗ stopped: ' + e.message) }

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [integrity-browser · the page runs only the files it names]`)
await done(fail === 0 ? 0 : 1)
