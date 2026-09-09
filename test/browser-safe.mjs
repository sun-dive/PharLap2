// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * ★★★ THE WALLET IS BROWSER-ONLY. This proves it, on every run.
 *
 * ⚠⚠ THIS CHECK EXISTS BECAUSE THE FAILURE IS INVISIBLE UNTIL IT ISN'T. Two different things go wrong,
 *   and only one of them announces itself:
 *
 *   | `import … from 'node:crypto'` | ⛔ esbuild REFUSES it — a loud build error |
 *   | `Buffer` | ⚠⚠ **bundles perfectly**, then is `undefined` in the browser — a runtime failure, on a user's machine, in code that built clean |
 *
 *   ⇒ The second is the dangerous one, so this check does not stop at "did it build". It builds, then
 *     **reads the output** for anything that only exists in Node.
 *
 * ★ `Buffer` is a hangover from the dependency this project removed, not a target. Node is used for the
 *   vector harness and for tooling; **it is never used by the wallet.** `impl/` must therefore be clean.
 *
 *   node test/browser-safe.mjs
 */
import { build } from 'esbuild'
import { readFileSync, readdirSync, rmSync, mkdtempSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMPL = join(ROOT, 'impl', 'js')

let pass = 0, fail = 0
const ok = (c, what) => { c ? pass++ : (fail++, console.log(`  ✗ ${what}`)) }

/** ⚠ Node-only globals. Each one bundles silently and fails at runtime. */
const NODE_ONLY = [
  [/\bBuffer\b/, 'Buffer', 'use Uint8Array — Buffer does not exist in a browser'],
  [/\bprocess\.[a-z]/i, 'process.*', 'not defined in a browser'],
  [/\b__dirname\b|\b__filename\b/, '__dirname/__filename', 'CommonJS only'],
  [/\brequire\s*\(/, 'require()', 'not defined in an ES module in a browser'],
  [/\bglobal\b(?!This)/, 'global', 'the browser spells it globalThis'],
]

const modules = readdirSync(IMPL).filter(f => f.endsWith('.mjs')).sort()
console.log(`── ${modules.length} modules under impl/js, each bundled for a browser ──`)

// ⚠⚠ APPLICATION FILES ARE CHECKED THE SAME WAY. They arrive in `src/` ADAPTED, one at a time, and the
//   allowlist above already refuses one that still imports the removed library. But an import check is
//   not a browser check: a file can import only permitted modules and still reach for `Buffer`. ⇒ These
//   are bundled and scanned exactly as the wallet core is. esbuild reads TypeScript natively, so this
//   costs nothing and closes the gap the moment a file lands rather than later.

const tmp = mkdtempSync(join(tmpdir(), 'browsersafe-'))
const SRC = join(ROOT, 'src')
let appFiles = []
try { appFiles = readdirSync(SRC).filter(f => /\.(ts|mjs|js)$/.test(f) && !f.endsWith('.d.ts')).sort() } catch {}
const all = [...modules.map(m => [IMPL, m]), ...appFiles.map(f => [SRC, f])]
if (appFiles.length) console.log(`   …and ${appFiles.length} adapted application file(s) under src/`)

for (const [dir, m] of all) {
  const out = join(tmp, m.replace(/\.(mjs|ts|js)$/, '') + '.bundle.js')
  let built = true, err = ''
  try {
    // ⚠ platform:'browser' is the point — it REFUSES node: builtins rather than shimming them.
    // ⚠⚠ minify:true IS NOT FOR SIZE. It strips COMMENTS, and without it this check scans prose as
    //   though it were code: the word "global" inside a JSDoc block failed a module that was perfectly
    //   browser-safe. ⇒ A checker that reads comments is policing spelling, and the same flaw would let
    //   a comment mentioning `Buffer` fail a clean file — or read as rigour while proving less than it
    //   claims. Free variables like `Buffer` and `process` survive minification, which is what we scan
    //   for, so nothing real is lost.
    await build({ entryPoints: [join(dir, m)], bundle: true, outfile: out, minify: true,
                  platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
  } catch (e) { built = false; err = String(e.message ?? e).split('\n').find(l => l.includes('ERROR')) ?? String(e).slice(0, 120) }
  if (!built) { ok(false, `${m} — does not bundle: ${err}`); continue }

  const src = readFileSync(out, 'utf8')
  const hits = NODE_ONLY.filter(([re]) => re.test(src)).map(([, name, why]) => `${name} (${why})`)
  ok(hits.length === 0, `${m} — bundles, but the output still needs: ${hits.join('; ')}`)
}

// ── ⛔ THE SILENT ONE: `.toString('hex')` on a Uint8Array ────────────────────────────────────────────
//
// ⚠⚠⚠ `Buffer.toString('hex')` returns hex. **`Uint8Array.toString('hex')` IGNORES THE ARGUMENT** and
//   returns comma-separated decimals — `"232,243,46,…"`. No error, no warning.
//   ⇒ Caught once by the sealed BIP-32 vectors, which threw only because the result was fed to
//     `BigInt('0x…')`. **Anywhere else it produces a plausible wrong string** — a txid, a script, a key
//     — that travels a long way before failing. ⇒ Since impl/ is Uint8Array throughout, this call is
//     never correct here, so it is a static error rather than something a vector has to notice.
console.log('\n── ⛔ no .toString(\'hex\') on a Uint8Array ──')
const { readFileSync: rf } = await import('node:fs')
const offenders = []
for (const m of modules) {
  const src = rf(join(IMPL, m), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  const n = (src.match(/\.toString\(\s*['"]hex['"]\s*\)/g) ?? []).length
  if (n > 0) offenders.push(`${m} (${n})`)
}
ok(offenders.length === 0, `⛔ .toString('hex') found — use toHex() from bytes.mjs: ${offenders.join(', ')}`)

// ── ⛔ UNDEFINED FREE VARIABLES — the gap this check had ─────────────────────────────────────────────
//
// ⚠⚠⚠ THIS CHECK ONCE REPORTED 12/12 ON A BROKEN MODULE. A `readFileSync(...)` call survived an edit
//   while its import did not. esbuild does not mind: an unresolved identifier is not a bundling error,
//   so the module built clean and failed the moment it ran. ⇒ Scanning for KNOWN Node globals could
//   never have caught it, because the name was not on any list.
//   ⚠⚠ AND THE OBVIOUS FIX DOES NOT WORK, which is worth recording so nobody trusts it: importing each
//     module catches an undefined name at TOP LEVEL, but the one that got through was inside a lazily
//     called function, so the import succeeds and the module is still broken. **Measured: with the bug
//     planted, this file reported 21/21 while `test/bip39.mjs` threw immediately.**
//
//   ★★★ SO THE BOUNDARY IS: this file proves the modules BUNDLE for a browser and carry no Node global.
//     Proving they RUN is the job of the per-module suites, because only calling a function executes
//     it. ⇒ `npm test` runs both, and neither alone is sufficient.
console.log('\n── ⛔ every module actually loads ──')
for (const m of modules) {
  let loaded = true, why = ''
  try { await import(join(IMPL, m)) } catch (e) { loaded = false; why = String(e.message ?? e).split('\n')[0].slice(0, 90) }
  ok(loaded, `${m} — bundles but does not LOAD: ${why}`)
}

// ── ⛔⛔ EVERY IMPORT IN THIS REPOSITORY MUST BE ON THE ALLOWLIST ────────────────────────────────────
//
// ⚠⚠ A verbatim copy of the old application — 25 files still importing a wallet library this project
//   exists to do without — was sitting untracked in the working tree, one careless `git add src/` away
//   from being published. ⇒ Ignoring the directory would have hidden the problem AND blocked the ported
//   files later. **The invariant is what wants enforcing, not the directory**: files arrive one at a
//   time, already clean, and this fails if one is not.
//
// ★★★ THIS IS AN ALLOWLIST, NOT A DENYLIST, FOR TWO REASONS.
//   1 · A denylist has to NAME what it forbids, and the name of that library is not wanted anywhere in
//       this repository — not even inside the check that rejects it.
//   2 · It is strictly stronger. A denylist stops one known package; this stops EVERY package that has
//       not been deliberately admitted, including ones nobody has thought of yet.
console.log('\n── ⛔ every import is on the allowlist ──')
/** Bare specifiers this project is allowed to depend on. ⚠ Adding one is a decision, not a formality. */
const ALLOWED = ['@noble/hashes', 'esbuild']
const { readdirSync: rd } = await import('node:fs')
const walk = d => rd(d, { withFileTypes: true }).flatMap(e =>
  e.name === 'node_modules' || e.name === '.git' ? []
  : e.isDirectory() ? walk(join(d, e.name))
  : /\.(mjs|js|ts)$/.test(e.name) ? [join(d, e.name)] : [])
const strays = []
for (const f of walk(ROOT)) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/(?:from|import|require\s*\()\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1]
    // relative paths are this project's own files; `node:` is flagged separately by the bundle checks
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue
    if (ALLOWED.some(a => spec === a || spec.startsWith(a + '/'))) continue
    strays.push(`${f.slice(ROOT.length + 1)} → ${spec}`)
  }
}
ok(strays.length === 0, `⛔ imports that are not on the allowlist: ${strays.join(', ')}`)

// ══ ⛔ THE BUILD CONFIG ITSELF ═══════════════════════════════════════════════════════════════════════
//
// ⚠⚠ TWO THINGS ABOUT `build.mjs` THAT NO OTHER CHECK WOULD NOTICE, because they are about what is
//   DISTRIBUTED rather than about whether the code runs.
console.log('\n── ⛔ the build config ──')
{
  const cfg = readFileSync(join(ROOT, 'build.mjs'), 'utf8')

  // ⛔ 1 · NO `global` DEFINE. The deployed build carries one, assumed necessary for the removed library.
  //   Measured 10 Sept 2026: building that application with and without it gives a BYTE-IDENTICAL
  //   bundle - nothing referenced bare `global` as an identifier at all.
  //   ⇒ It matters that it stays out. A define replacing a Node global silently patches over a real Node
  //     dependency creeping in, instead of letting the build fail and say so.
  ok(!/['"]?global['"]?\s*:/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')),
     '⛔ the build does NOT define `global` — dead config that would mask a real Node dependency')

  // ⛔⛔ 2 · THE BUNDLE MUST NOT BE CALLED `bundle.js`. Phar Lap 1 is LIVE, its script is `bundle.js`,
  //   and its deploy step is `cp bundle.js "$DEPLOYPATH"`. Two projects emitting the same filename are
  //   one wrong path away from this one replacing the live app's script. ⇒ A distinct name makes that
  //   impossible rather than unlikely, which is the deployment form of keeping each page's script
  //   isolated. The name is checked here so it cannot be tidied back.
  ok(/outfile:\s*['"]testbundle2\.js['"]/.test(cfg),
     '⛔★ the build emits testbundle2.js — NEVER bundle.js, which is the live app\'s script')
  ok(!/outfile:\s*['"]bundle\.js['"]/.test(cfg), '…and does not emit the live name')
  // ⚠ and nothing in the repository may ask a browser for the live app's script by name
  {
    const asks = walk(ROOT).concat(
      (() => { try { return readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => join(ROOT, f)) } catch { return [] } })(),
    ).filter(f => /\.(html|ts|mjs|js)$/.test(f))
      .filter(f => /(src|href)=["'][^"']*\bbundle\.js/.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(ROOT.length + 1))
    ok(asks.length === 0, `⛔ no page loads \`bundle.js\`: ${asks.join(', ')}`)
  }

  // ⛔ 3 · THE MIT NOTICE IS A BANNER. `@noble/hashes` is MIT and its notice must travel with its code.
  //   ⚠⚠ `legalComments` does NOT do this: it only preserves comments a source marks with `/*!`, and that
  //     dependency marks none, so building with and without it is byte-identical. Relying on it would
  //     have looked like compliance and been none. A banner is written in unconditionally.
  ok(/banner\s*:\s*\{\s*js\s*:/.test(cfg), '⛔ the bundle carries a licence BANNER, not just legalComments')
  ok(/Paul Miller/.test(cfg) && /MIT/.test(cfg),
     '★ …and it names the MIT holder, which is what the licence actually requires')

  // ★ and prove the banner really lands in a bundle, rather than trusting the setting
  const NOTICE = (cfg.match(/const NOTICE = `([\s\S]*?)`/) ?? [])[1]
  ok(NOTICE !== undefined && NOTICE.startsWith('/*!'), 'the banner is a legal comment esbuild will keep')
  const probe = await build({
    entryPoints: [join(IMPL, 'bip39.mjs')], bundle: true, write: false, banner: { js: NOTICE ?? '' },
    platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent',
  })
  const text = probe.outputFiles[0].text
  ok(text.startsWith('/*!') && /Paul Miller/.test(text),
     '★★ MEASURED: the notice is present in the built output, not merely configured')
}

// ── ⚠ the anti-vacuous guard ────────────────────────────────────────────────────────────────────────
// A check that would pass on an empty directory is not a check.
ok(modules.length >= 5, `★ and there are really ${modules.length} modules to check, not zero`)

// ── ⛔ and prove the check can FAIL, by feeding it something that should be rejected ─────────────────
const bad = join(tmp, 'deliberately-bad.mjs')
const { writeFileSync } = await import('node:fs')
writeFileSync(bad, "export const x = Buffer.from('ab', 'hex')\n")
let caught = false
try {
  await build({ entryPoints: [bad], bundle: true, outfile: join(tmp, 'bad.js'),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
  caught = /\bBuffer\b/.test(readFileSync(join(tmp, 'bad.js'), 'utf8'))
} catch { caught = true }
ok(caught, '⛔ a file using Buffer IS detected — the check discriminates rather than always passing')

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [browser-safe · impl/js has no Node dependency]`)
process.exit(fail === 0 ? 0 : 1)
