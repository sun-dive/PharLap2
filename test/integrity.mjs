// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The page's file hashes, checked without a browser (test/integrity-browser.mjs checks them in one).
 *
 *   1 · index.html names every module the app loads, each with its current hash (tools/integrity.mjs --check)
 *   2 · and that check fails on a copy of the site with a module changed, a module left out, or a stale QR hash
 *   3 · the app's own code loads script only by import, or by a script element given a hash
 *
 *   node test/integrity.mjs
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = join(ROOT, 'tools', 'integrity.mjs')
let pass = 0, fail = 0
const ok = (c, what) => { c ? pass++ : (fail++, console.log(`  ✗ ${what}`)) }
const check = (root) => {
  try { execFileSync('node', [TOOL, '--check'], { env: { ...process.env, INTEGRITY_ROOT: root }, stdio: 'pipe' }); return true } catch { return false }
}

console.log('── 1 · every module listed with its current hash ──')
ok(check(ROOT), 'index.html lists every module with its hash (run node tools/integrity.mjs)')

console.log('── 2 · the check fails when it should ──')
const copy = () => {
  const d = mkdtempSync(join(tmpdir(), 'integrity-'))
  for (const p of ['index.html', 'jsqr.min.js', 'src', 'impl', 'vendor']) cpSync(join(ROOT, p), join(d, p), { recursive: true })
  return d
}
{
  const d = copy()
  ok(check(d), 'a faithful copy passes')
  appendFileSync(join(d, 'src', 'keystore.js'), ' ')
  ok(!check(d), 'a module changed by one byte fails')
  rmSync(d, { recursive: true, force: true })
}
{
  const d = copy()
  const page = readFileSync(join(d, 'index.html'), 'utf8')
  writeFileSync(join(d, 'index.html'), page.replace(/^.*href="\.\/src\/keystore\.js".*\n/m, ''))
  ok(!check(d), 'a module left out of index.html fails')
  rmSync(d, { recursive: true, force: true })
}
{
  const d = copy()
  appendFileSync(join(d, 'jsqr.min.js'), ' ')
  ok(!check(d), 'a changed QR scanner (stale JSQR_INTEGRITY) fails')
  rmSync(d, { recursive: true, force: true })
}
{
  const d = copy()
  const page = readFileSync(join(d, 'index.html'), 'utf8')
  writeFileSync(join(d, 'index.html'), page.replace(/("\.\/src\/keystore\.js": "sha384-)[^"]+"/, '$1AAAA"'))
  ok(!check(d), 'an import map entry with the wrong hash fails')
  rmSync(d, { recursive: true, force: true })
}
{
  const d = copy()
  const page = readFileSync(join(d, 'index.html'), 'utf8')
  writeFileSync(join(d, 'index.html'), page.replace(/'sha256-[^']+'/, "'sha256-AAAA'"))
  ok(!check(d), 'a policy that does not name the import map\'s hash fails')
  rmSync(d, { recursive: true, force: true })
}
{
  const d = copy()
  appendFileSync(join(d, 'src', 'startcheck.js'), ' ')
  ok(!check(d), 'a changed start check fails')
  rmSync(d, { recursive: true, force: true })
}

console.log('── 3 · script is loaded only by import, or by a script element with a hash ──')
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : /\.m?js$/.test(e.name) ? [join(d, e.name)] : [])
const OTHER_LOADS = [/\bimport\s*\(/, /\bnew\s+(Shared)?Worker\s*\(/, /\bimportScripts\s*\(/, /serviceWorker\s*\.\s*register\s*\(/]
/** What in a file loads script outside the page's list. */
function loads(text) {
  const found = OTHER_LOADS.filter((re) => re.test(text)).map(String)
  const lines = text.split('\n')
  lines.forEach((l, i) => {
    if (/createElement\(\s*['"]script['"]\s*\)/.test(l) && !lines.slice(i, i + 4).some((n) => /\.integrity\s*=/.test(n))) found.push(`script element without a hash at line ${i + 1}`)
  })
  return found
}
const shipped = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'impl'))]
ok(shipped.length > 50, `there are really ${shipped.length} files to scan`)
for (const f of shipped) {
  const l = loads(readFileSync(f, 'utf8'))
  ok(l.length === 0, `${f.slice(ROOT.length + 1)} loads script outside the list: ${l.join('; ')}`)
}
ok(loads("const s = document.createElement('script')\ns.src = './x.js'").length === 1, 'a script element with no hash is caught')
ok(loads("const m = await import('./x.js')").length === 1, 'an import() is caught')

console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [integrity · every file the page runs is named with its hash]`)
process.exit(fail === 0 ? 0 : 1)
