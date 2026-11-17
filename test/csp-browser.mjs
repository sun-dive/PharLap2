// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The wallet page's Content-Security-Policy, in a real browser. The policy is read from .htaccess, the file that
 * sends it, and served on index.html as the host does. Checks that the page runs under it with nothing refused,
 * that the QR reader it loads on demand still loads, and that a publisher's SVG or HTML opened from the page as a
 * blob: page cannot run script. A control copy served WITHOUT the policy shows the probe can see script run.
 *
 * Headless Chromium, a fresh profile, every outside host unresolvable; both removed when done.
 *
 *   node build.mjs && node test/csp-browser.mjs        (CHROMIUM=/path/to/chromium to choose the browser)
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
if (policy == null) { console.log('⚠ no Content-Security-Policy for index.html in .htaccess'); process.exit(1) }

// ── the page: `/` as the host serves it (policy on index.html); `/nocsp/` the same files without it ──
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const control = path.startsWith('/nocsp/'); if (control) path = path.slice('/nocsp'.length)
  if (path.endsWith('/')) path += 'index.html'
  try {
    const body = await readFile(join(ROOT, path))
    const head = { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }
    if (path === '/index.html' && !control) head['content-security-policy'] = policy
    res.writeHead(200, head); res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

const profile = await mkdtemp(join(tmpdir(), 'csp-'))
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
let id = 0; const pending = new Map(); const waiters = []; const refused = []
ws.onmessage = m => { const d = JSON.parse(m.data)
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) }
  if (d.method === 'Runtime.consoleAPICalled' || d.method === 'Log.entryAdded') {
    const text = d.params.entry?.text ?? (d.params.args ?? []).map(a => a.value ?? '').join(' ')
    if (/Content Security Policy/i.test(text)) refused.push(text)
  }
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
// Every document records what the policy refused.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__refused = []; document.addEventListener('securitypolicyviolation', e => window.__refused.push(e.violatedDirective + ' ' + e.blockedURI))" })

async function go(url) { const loaded = event('Page.loadEventFired'); await send('Page.navigate', { url }); await loaded }
async function walletShown() { for (let i = 0; i < 100; i++) { await sleep(100); if ((await ev("document.getElementById('address')?.textContent ?? ''")) !== '') return true } return false }
const evGesture = async e => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true, userGesture: true })).result?.result?.value
/** The probe: a publisher's file whose script, if it runs, names its tab with what it reached of this site's storage. */
const probeSvg = "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><script>var r = 'ran'; try { r += ' storage:' + localStorage.length } catch (e) { r += ' storage-denied' } window.name = r</script></svg>"
const probeHtml = "<!doctype html><p>cover</p><script>var r = 'ran'; try { r += ' storage:' + localStorage.length } catch (e) { r += ' storage-denied' } window.name = r</script>"
const blobOf = (type, body) => ev(`URL.createObjectURL(new Blob([${JSON.stringify(body)}], { type: ${JSON.stringify(type)} }))`)
/** Evaluate in the tab showing `url` (a tab the page opened), through its own DevTools connection. */
async function inTab(url, expr) {
  for (let i = 0; i < 30; i++) { await sleep(100)
    const t = (await (await fetch(`http://127.0.0.1:${devPort}/json/list`)).json()).find(x => x.url === url)
    if (t) { const w = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => w.onopen = r)
      const v = await new Promise(res => { w.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result?.result?.value) }; w.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })) })
      w.close(); return v } }
  return 'no such tab'
}
/** Open a publisher's file from the wallet page at `base`, each way the page can: what its script did ('' = nothing ran). */
async function openedFrom(base) {
  const out = {}
  for (const [kind, type, body] of [['SVG', 'image/svg+xml', probeSvg], ['HTML', 'text/html', probeHtml]]) {
    await go(base); await walletShown()
    let u = await blobOf(type, body)
    { const l = event('Page.loadEventFired'); await ev(`location.href = ${JSON.stringify(u)}, 1`); await l; await sleep(800) }
    out[`${kind}, the page goes to it`] = await ev('window.name'); await ev("window.name = '', 1")
    await go(base); await walletShown()
    u = await blobOf(type, body); await evGesture(`window.open(${JSON.stringify(u)}, '_blank'), 1`)
    out[`${kind}, opened in a new tab`] = await inTab(u, 'window.name')
    u = await blobOf(type, body)
    await evGesture(`(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(u)}; a.target = '_blank'; document.body.append(a); a.click(); return 1 })()`)
    out[`${kind}, a link clicked to a new tab`] = await inTab(u, 'window.name')
  }
  return out
}
try {
  console.log(`policy from .htaccess: ${policy}`)
  console.log('1 · the wallet page runs under the policy, with nothing refused')
  await go(BASE + '/')
  ok(await walletShown(), 'the wallet opens')
  for (const t of await ev("[...document.querySelectorAll('.tab')].map(t => t.dataset.tab)")) {
    await ev(`document.querySelector('.tab[data-tab="${t}"]').click(), 1`); await sleep(250)
  }
  await ev("document.getElementById('btnQrAddr').click(), 1"); await sleep(300)
  ok(await ev("!!document.querySelector('.modal svg, .modal img')"), 'the QR code draws')
  await ev("document.querySelectorAll('.modal').forEach(m => m.remove()), 1")
  await ev("document.getElementById('btnContacts').click(), 1"); await sleep(300)
  const qr = await ev("new Promise(res => { const s = document.createElement('script'); s.src = './jsqr.min.js'; s.onload = () => res(typeof window.jsQRlib); s.onerror = () => res('failed'); document.head.append(s) })")
  ok(qr === 'function' || qr === 'object', `the QR reader loads on demand (${qr})`)
  ok(JSON.stringify(await ev('window.__refused')) === '[]' && refused.length === 0, `nothing refused: ${JSON.stringify(await ev('window.__refused'))} ${refused.slice(0, 3).join(' | ')}`)

  console.log('2 · a publisher\'s SVG or HTML opened from the wallet page cannot run script')
  for (const [how, r] of Object.entries(await openedFrom(BASE + '/'))) ok(r === '', `${how}: blocked (${r})`)

  console.log('3 · control: the same page served WITHOUT the policy, so the probe can see script run')
  for (const [how, r] of Object.entries(await openedFrom(BASE + '/nocsp/'))) ok(/^ran storage:/.test(r), `${how}: runs and reaches storage (${r})`)
  // ⚠ Not tested, and not covered by the policy: the file's address pasted into a new tab. A page the browser opens
  //   with no opener takes no policy from the wallet page, so its script runs and reaches storage (measured).
} catch (e) { fail++; console.log('  ✗ stopped: ' + e.message) }

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [csp-browser · the wallet page's script policy in Chromium]`)
await done(fail === 0 ? 0 : 1)
