// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The page's file hashes, in a real browser. index.html names every module with its SHA-384; this checks that the
 * wallet runs from exactly those files, that a module changed by one byte stops the app, and that the QR scanner
 * the app adds later loads under the hash app.js gives it and is refused when changed. Served with the policy
 * .htaccess sends.
 *
 * Headless Chromium, a fresh profile, every outside host unresolvable; both removed when done.
 *
 *   node test/integrity-browser.mjs        (CHROMIUM=/path/to/chromium to choose the browser)
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

const policy = /<Files "index\.html">\s*Header set Content-Security-Policy "([^"]+)"/.exec(readFileSync(join(ROOT, '.htaccess'), 'utf8'))?.[1]
const page = readFileSync(join(ROOT, 'index.html'), 'utf8')
const listed = new Set([...page.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)" integrity="[^"]+">/g)].map(m => m[1]))
const entry = /<script type="module" src="\.\/([^"]+)" integrity="[^"]+"><\/script>/.exec(page)?.[1]
const jsqrHash = /const JSQR_INTEGRITY = '([^']+)'/.exec(readFileSync(join(ROOT, 'src', 'app.js'), 'utf8'))?.[1]
const VERSION = /const APP_VERSION = '([^']+)'/.exec(readFileSync(join(ROOT, 'src', 'app.js'), 'utf8'))?.[1]

// ── `/` the site as it is; `/tampered/` the same with one module and the QR scanner each changed by one byte ──
const TAMPERED = new Set(['/src/keystore.js', '/jsqr.min.js'])
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
const requested = new Set()
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const tampered = path.startsWith('/tampered/'); if (tampered) path = path.slice('/tampered'.length)
  if (path.endsWith('/')) path += 'index.html'
  if (!tampered) requested.add(path.slice(1))
  try {
    let body = await readFile(join(ROOT, path))
    if (tampered && TAMPERED.has(path)) body = Buffer.concat([body, Buffer.from(' ')])
    const head = { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }
    if (path === '/index.html' && policy != null) head['content-security-policy'] = policy
    res.writeHead(200, head); res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

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
const loadScanner = (base, hash) => ev(`new Promise(res => { const s = document.createElement('script'); s.src = ${JSON.stringify(base + '/jsqr.min.js')}; s.integrity = ${JSON.stringify(hash)}; s.onload = () => res(typeof window.jsQRlib); s.onerror = () => res('refused'); document.head.append(s) })`)

try {
  ok(listed.size > 50 && entry === 'src/app.js' && jsqrHash && VERSION, `index.html lists ${listed.size} modules and the app's entry; app.js gives the QR scanner's hash and the version`)

  console.log('1 · the wallet runs from exactly the files index.html names')
  await go(BASE + '/')
  ok(await walletShown(), 'the wallet opens')
  ok(await ev("document.getElementById('appVersion')?.textContent") === `Smart NFTs · v${VERSION}`, `the version reads v${VERSION}`)
  const scripts = [...requested].filter(p => /\.m?js$/.test(p))
  const unlisted = scripts.filter(p => !listed.has(p) && p !== entry)
  ok(unlisted.length === 0, `every script the browser asked for is listed (not listed: ${unlisted.join(', ')})`)
  const unused = [...listed].filter(p => !requested.has(p))
  ok(unused.length === 0, `every listed module was fetched (not fetched: ${unused.join(', ')})`)
  ok(!consoleLines.some(l => /integrity|digest/i.test(l)), `no file refused: ${consoleLines.filter(l => /integrity|digest/i.test(l)).slice(0, 2).join(' | ')}`)
  const genuine = await loadScanner(BASE, jsqrHash)
  ok(genuine === 'function' || genuine === 'object', `the QR scanner loads under the hash app.js gives it (${genuine})`)

  console.log('2 · one module changed by one byte: the app does not start')
  consoleLines.length = 0
  await go(BASE + '/tampered/')
  ok(!(await walletShown(40)), 'the wallet does not open')
  ok(await ev("document.getElementById('appVersion')?.textContent ?? ''") === '', 'no app code ran')
  ok(consoleLines.some(l => /integrity|digest/i.test(l) && /keystore\.js/.test(l)), `the browser names the changed file: ${consoleLines.find(l => /integrity|digest/i.test(l)) ?? 'nothing said'}`)

  console.log('3 · the QR scanner changed by one byte: refused')
  ok(await loadScanner(BASE + '/tampered', jsqrHash) === 'refused', 'the changed scanner is refused')
} catch (e) { fail++; console.log('  ✗ stopped: ' + e.message) }

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [integrity-browser · the page runs only the files it names]`)
await done(fail === 0 ? 0 : 1)
