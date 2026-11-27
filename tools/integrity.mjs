// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The page's file hashes: index.html names every module the app loads, each with its SHA-384, and the browser
 * refuses a file that does not match. The hash of index.html then stands for the whole app.
 *
 *   node tools/integrity.mjs            refresh index.html (and app.js's QR scanner hash) from the files on disk
 *   node tools/integrity.mjs --staged   the same from the staged files, written into the commit (the pre-commit hook)
 *   node tools/integrity.mjs --check    change nothing; exit 1 if any hash is missing or stale
 *
 * The modules are found by following the imports from src/app.js with esbuild's parser. esbuild only reads here;
 * nothing it writes is shipped. jsqr.min.js is added by the app at run time, so its hash lives in app.js
 * (JSQR_INTEGRITY), which is itself hashed.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// INTEGRITY_ROOT points it at a copy of the site instead (the test checks it fails on a tampered copy)
const ROOT = resolve(process.env.INTEGRITY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
const ENTRY = 'src/app.js'
const PAGE = 'index.html'
const JSQR = 'jsqr.min.js'
const mode = process.argv[2] ?? 'write'
if (!['write', '--staged', '--check'].includes(mode)) { console.error(`unknown option ${mode}`); process.exit(2) }
const staged = mode === '--staged'

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] })
/** A file as it will be committed (staged) or as it is on disk. */
function read(rel) {
  if (!staged) return readFileSync(join(ROOT, rel))
  try { return git('show', `:${rel}`) } catch { throw new Error(`${rel} is used by the app but is not staged`) }
}
const sri = (bytes) => 'sha384-' + createHash('sha384').update(bytes).digest('base64')

/** Every module reachable from the entry, as repository paths, in a stable order. */
async function modules(appJs) {
  const result = await build({
    entryPoints: [ENTRY], absWorkingDir: ROOT, bundle: true, write: false, metafile: true, logLevel: 'silent',
    platform: 'browser', format: 'esm',
    plugins: [{ name: 'read', setup(b) {
      b.onLoad({ filter: /\.m?js$/ }, (a) => {
        const rel = relative(ROOT, a.path)
        return { contents: rel === ENTRY ? appJs : read(rel), loader: 'js' }
      })
    } }],
  })
  const inputs = Object.keys(result.metafile.inputs)
  const outside = inputs.filter((p) => p.startsWith('..') || p.includes('node_modules'))
  if (outside.length) throw new Error(`the app imports from outside the repository: ${outside.join(', ')}`)
  return inputs.sort()
}

const JSQR_LINE = /const JSQR_INTEGRITY = '[^']*'/
const BLOCK = /^([ \t]*)<link rel="modulepreload"[^\n]*\n(?:[ \t]*<link rel="modulepreload"[^\n]*\n)*[ \t]*<script type="module" src="\.\/src\/app\.js"[^\n]*<\/script>/m

/** app.js and index.html as they should read, given the files as they are. */
async function expected(appJs, page) {
  if (!JSQR_LINE.test(appJs)) throw new Error(`${ENTRY} has no JSQR_INTEGRITY constant`)
  const app = appJs.replace(JSQR_LINE, `const JSQR_INTEGRITY = '${sri(read(JSQR))}'`)
  const mods = await modules(app)
  const m = BLOCK.exec(page)
  if (!m) throw new Error(`${PAGE} has no module block (modulepreload links, then the app's module script)`)
  const ind = m[1]
  const lines = mods.filter((p) => p !== ENTRY).map((p) => `${ind}<link rel="modulepreload" href="./${p}" integrity="${sri(p === ENTRY ? app : read(p))}">`)
  lines.push(`${ind}<script type="module" src="./${ENTRY}" integrity="${sri(app)}"></script>`)
  return { app, page: page.replace(BLOCK, () => lines.join('\n')), count: mods.length }
}

function stage(rel, text) {
  const mode = git('ls-files', '-s', '--', rel).toString().split(' ')[0] || '100644'
  const sha = execFileSync('git', ['-C', ROOT, 'hash-object', '-w', '--stdin'], { input: text }).toString().trim()
  git('update-index', '--cacheinfo', `${mode},${sha},${rel}`)
}

try {
  const appJs = read(ENTRY).toString()
  const page = read(PAGE).toString()
  const want = await expected(appJs, page)
  const stale = [want.app !== appJs && ENTRY, want.page !== page && PAGE].filter(Boolean)

  if (mode === '--check') {
    if (stale.length) { console.log(`✗ stale hashes in ${stale.join(' and ')}: run node tools/integrity.mjs`); process.exit(1) }
    console.log(`✓ ${PAGE} lists all ${want.count} modules with their hashes`)
    process.exit(0)
  }
  if (staged) {
    if (want.app !== appJs) stage(ENTRY, want.app)
    if (want.page !== page) stage(PAGE, want.page)
    // the same lines on disk, so the working copy agrees with what is committed
    const diskApp = readFileSync(join(ROOT, ENTRY), 'utf8')
    writeFileSync(join(ROOT, ENTRY), diskApp.replace(JSQR_LINE, want.app.match(JSQR_LINE)[0]))
    const diskPage = readFileSync(join(ROOT, PAGE), 'utf8')
    if (BLOCK.test(diskPage)) writeFileSync(join(ROOT, PAGE), diskPage.replace(BLOCK, () => BLOCK.exec(want.page)[0]))
  } else {
    if (want.app !== appJs) writeFileSync(join(ROOT, ENTRY), want.app)
    if (want.page !== page) writeFileSync(join(ROOT, PAGE), want.page)
  }
  console.log(stale.length ? `hashes refreshed in ${stale.join(' and ')} (${want.count} modules)` : `hashes current (${want.count} modules)`)
} catch (e) {
  console.error(`✗ ${e.errors?.[0]?.text ?? e.message}`)
  process.exit(1)
}
