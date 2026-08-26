#!/usr/bin/env node
/** Emit {vector id: hash-of-our-answer} for everything this side can compute. ⚠ Silent on the rest. */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { canonHash, OPS } from './core.mjs'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = {}
for (const f of readdirSync(join(ROOT, 'vectors')).filter(x => x.endsWith('.json')).sort()) {
  for (const v of JSON.parse(readFileSync(join(ROOT, 'vectors', f), 'utf8')).vectors) {
    const fn = OPS[v.op]; if (!fn) continue
    try { out[v.id] = canonHash(fn(v.in)) }
    catch (e) { console.error(`# ${v.id} threw ${e.message}`) }
  }
}
console.log(JSON.stringify(out))
