#!/usr/bin/env node
/**
 * The JavaScript vector runner.
 *
 * ⚠⚠ WRITTEN FROM `vectors/SCHEMA.md`, NOT PORTED FROM THE PYTHON ONE. Two implementations that share
 * no code, asked the same question. A port would agree with its source about the things its source got
 * wrong — which is exactly the failure the vectors exist to find.
 *
 *   node runner/js/run.mjs [--selftest]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { canonHash, dispatch, NotImplementedOp } from './core.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
/* ── the runner ─────────────────────────────────────────────────────────────────────────────────── */
const selftest = process.argv.includes('--selftest')
const dir = join(ROOT, 'vectors')
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort()
if (!files.length) { console.log('  ⚠ no vector files found'); process.exit(1) }

let npass = 0, nfail = 0, nskip = 0
const seen = new Set(), failures = []

for (const f of files) {
  const doc = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  for (const v of doc.vectors) {
    if (seen.has(v.id)) { console.log(`  ⚠⚠ DUPLICATE VECTOR ID: ${v.id}`); process.exit(1) }
    seen.add(v.id)
    let got
    try { got = dispatch(v.op, v.in) }
    catch (e) {
      if (e instanceof NotImplementedOp) { nskip++; continue }
      nfail++; failures.push([v.id, `threw ${e.constructor.name}: ${e.message}`]); continue
    }
    let h = canonHash(got)
    if (selftest && v.id === doc.vectors[0].id) h = '0'.repeat(64)   // ⚠ deliberately wrong
    if (h === v.hash) npass++
    else { nfail++; failures.push([v.id, `expected ${v.hash.slice(0, 16)}… got ${h.slice(0, 16)}…`]) }
  }
}

for (const [id, why] of failures) console.log(`  ✗ ${id}  ${why}`)
console.log(`\n  ${npass} passed · ${nfail} failed · ${nskip} SKIPPED (not implemented)\n`)

if (selftest) {
  /* ★ A HARNESS NOBODY HAS WATCHED FAIL IS NOT A HARNESS. */
  const ok = nfail >= 1
  console.log(`  selftest: the runner ${ok ? 'DID' : 'DID NOT'} report the planted failure ${ok ? '✓' : '⚠⚠'}`)
  process.exit(ok ? 0 : 1)
}
if (nskip) console.log(`  ⚠ ${nskip} vectors were skipped. A skip is not a pass.`)
process.exit(nfail ? 1 : 0)
