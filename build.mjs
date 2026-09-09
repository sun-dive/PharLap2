// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * ══ THE BROWSER BUILD ═══════════════════════════════════════════════════════════════════════════════
 *
 *   node build.mjs
 *
 * ⚠⚠⚠ THE OUTPUT IS `testbundle2.js`, NOT `bundle.js`, AND THAT NAME IS A SAFETY MEASURE.
 *   Phar Lap 1 is LIVE, its bundle is called `bundle.js`, and its deploy step is literally
 *   `cp bundle.js "$DEPLOYPATH"`. ⇒ Two projects both producing `bundle.js` are one wrong path away
 *   from this one overwriting the live app's script. A different name makes that IMPOSSIBLE rather than
 *   unlikely, so testing at `example.com/pharlap2` cannot touch what is already running.
 *   ⛔ Do not "tidy" this back to `bundle.js`. The suite refuses the build config if it changes, and
 *     refuses the page if it asks for a file by the live app's name.
 *
 * ★ Produces `testbundle2.js` beside `index.html`. Both are RELATIVE-path only, so the app runs from any
 *   directory a web server can reach - `example.com/pharlap2` works with no configuration, and so does
 *   opening `index.html` straight off a USB stick on an air-gapped machine.
 *
 * ⚠⚠ `global: 'window'` IS NOT HERE, AND ITS ABSENCE IS DELIBERATE. The deployed build carries that
 *   define because the removed library was assumed to need it. ⇒ MEASURED, 10 Sept 2026: building the
 *   deployed application with and without it produces a BYTE-IDENTICAL bundle. Nothing referenced bare
 *   `global` as an identifier - the 46 occurrences of the word in that bundle are all inside comments
 *   and error-message strings. It was dead configuration.
 *   ⛔ A define that replaces a Node global is not harmless when it is unnecessary: it means a real Node
 *     dependency creeping in would be silently patched over instead of failing the build. The test
 *     suite refuses this build config if it comes back.
 *
 * ⚠⚠ THE MIT NOTICE IS A `banner`, NOT `legalComments`, AND THAT DISTINCTION IS THE POINT. `@noble/hashes`
 *   is MIT, which obliges us to carry its notice wherever its code goes, and a bundle IS distribution.
 *   ⛔ MEASURED: `legalComments: 'eof'` emits NOTHING here, because that setting only preserves comments
 *     the source already marks with `/*!`, and this dependency marks none. Building with it and without
 *     it gives byte-identical output. ⇒ Relying on it would have looked like compliance and been none.
 *   ⇒ A banner is unconditional: it is written into `bundle.js` itself, so the notice travels with the
 *     code. That matters here because deploying means copying `index.html`, `testbundle2.js` and `brand/`
 *     to a directory - a NOTICE file left behind in the repository goes nowhere.
 */
import { build } from 'esbuild'
import { execSync } from 'node:child_process'

const NOTICE = `/*!
 * Phar Lap 2 — Copyright 2026 sun-dive — Business Source License 1.1 (see LICENSE).
 * Converts to the Apache License 2.0 on 2030-09-09.
 *
 * Includes @noble/hashes 2.4.0 — Copyright (c) 2022 Paul Miller (https://paulmillr.com)
 * Licensed under the MIT License. Full text: https://github.com/paulmillr/noble-hashes/blob/main/LICENSE
 */`

const APP_VERSION = '0.1'
const buildId = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
})()
const buildDate = new Date().toISOString().slice(0, 10)

const result = await build({
  entryPoints: ['src/app.ts'],
  bundle: true,
  outfile: 'testbundle2.js',
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
  target: 'es2020',
  // ⚠ see the note above: this preserves `/*!` comments the sources carry, which our one dependency
  //   does not. Harmless, and NOT what satisfies the licence - the banner below is.
  legalComments: 'eof',
  banner: { js: NOTICE },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  metafile: true,
})

// ⚠ Report what actually went in. A bundle that silently grew a dependency is worth noticing at build
//   time rather than in a licence audit later.
const inputs = Object.keys(result.metafile.outputs['testbundle2.js'].inputs)
const external = inputs.filter(p => p.includes('node_modules'))
const packages = [...new Set(external.map(p => p.replace(/^.*node_modules\//, '').split('/').slice(0, 2).join('/')))]
console.log(`testbundle2.js  v${APP_VERSION} · ${buildId} · ${buildDate}`)
console.log(`  ${inputs.length} modules, ${packages.length} external package(s): ${packages.join(', ') || 'none'}`)
