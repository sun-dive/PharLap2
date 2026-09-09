// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Collect REAL MAINNET SCRIPTS as vectors for `impl/js/script.mjs`.
 *
 * ★★★ THE ORACLE IS THE CHAIN, not another implementation. Round-tripping scripts that are actually on
 *   mainnet proves the parser handles what really exists — including whatever non-minimal encodings,
 *   odd pushes and unknown opcodes are out there — which agreement with one library never could.
 *
 * ⚠ Scripts are taken from this project's OWN transactions as well as ordinary ones, because the
 *   covenant scripts are the awkward cases: long, full of `OP_CAT`/`OP_SPLIT`/`OP_PICK`, and pushing
 *   data at sizes that cross the PUSHDATA boundaries.
 *
 * ⚠⚠ A round trip is the ONLY assertion made here, and deliberately so: the test must not encode any
 *   opinion about what a script MEANS. If bytes in equal bytes out, the parser and the serializer agree
 *   with the chain, and that is the whole claim.
 *
 * ⚠⚠⚠ SCRIPTS COME FROM THE **RAW TRANSACTION**, NOT THE JSON VIEW. Measured 9 Sept 2026: the JSON
 *   endpoint CAPS `scriptPubKey.hex` at exactly 50,000 bytes, silently. Five of the first scripts
 *   collected were truncated prefixes — the real one is 54,299 bytes — and they failed to round-trip
 *   for that reason and not because the parser was wrong.
 *   ★ So the raw hex is fetched and parsed instead. That is not circular: the WHOLE transaction is
 *     round-tripped against the chain's own bytes first, which proves the field boundaries were read
 *     correctly, and only then is each script taken from inside it.
 *
 *   node tools/gen-script-vectors.mjs
 */
import { writeFileSync } from 'node:fs'
import { Tx } from '../impl/js/transaction.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WOC = 'https://api.whatsonchain.com/v1/bsv/main'
/** ⚠ Space the requests. A free endpoint is someone else's machine. */
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** This project's own mainnet transactions — covenant outputs, 1-satoshi breadcrumbs, data pushes. */
const TXIDS = [
  '04e79181ecf6103ca89f368044c94e24917a1864839dcd24554030336e66de8b',
  '078a45523f5ba0597aeffe01296d0543566defc20a56c8b4de109ed783bbab17',
  '172cc9e2afa2699df0469ca52eb4019f41ad75ac663902073425b56fac4c0cd4',
  '0e5213e2257b413e58c2f4ed6622baa927c8594a925b2a05dd9deb37707bc937',
  '088613aa3bce05793d9f50adc2d563a1461517def11b2ecb39732dccafd69c76',
]

const scripts = []
const rawTxs = []
const seen = new Set()
const add = (hex, source) => {
  if (typeof hex !== 'string' || hex.length === 0 || seen.has(hex)) return
  seen.add(hex)
  scripts.push({ hex, bytes: hex.length / 2, source })
}

for (const txid of TXIDS) {
  try {
    const r = await fetch(`${WOC}/tx/${txid}/hex`)
    if (!r.ok) { console.error(`  ⚠ ${txid.slice(0, 12)}… HTTP ${r.status}`); await sleep(400); continue }
    const raw = (await r.text()).trim()
    const tx = Tx.parse(raw)
    // ⚠ THE GATE: if the whole transaction does not round-trip, the bytes were not read correctly and
    //   nothing taken from inside it can be trusted as a vector.
    if (tx.hex() !== raw) { console.error(`  ⛔ ${txid.slice(0, 12)}… raw tx does NOT round-trip — skipped`); await sleep(400); continue }
    rawTxs.push({ txid, hex: raw, bytes: raw.length / 2 })
    tx.outputs.forEach((o, n) => add(toHex(o.script), `${txid.slice(0, 8)}:out${n}`))
    tx.inputs.forEach((i, n) => add(toHex(i.script), `${txid.slice(0, 8)}:in${n}`))
    console.error(`  ${txid.slice(0, 12)}…  ${tx.outputs.length} outputs, ${tx.inputs.length} inputs, raw ${raw.length / 2} B ✓ round-trips`)
  } catch (e) { console.error(`  ⚠ ${txid.slice(0, 12)}… ${String(e).slice(0, 60)}`) }
  await sleep(400)
}

const out = {
  _: 'REAL MAINNET SCRIPTS, fetched and frozen. ★ The oracle is the chain: a script that round-trips '
   + 'byte for byte proves the parser and the serializer agree with what is actually deployed. No other '
   + 'implementation is consulted, and none is needed — these bytes are already settled by consensus.',
  _assertion: 'ONLY a round trip is asserted. The test encodes no opinion about what any script MEANS.',
  source: 'WhatsOnChain, mainnet',
  generated: new Date().toISOString().slice(0, 10),
  scripts: scripts.sort((a, b) => a.bytes - b.bytes),
  // ★ the transactions the scripts came from, so the suite can re-prove the gate rather than trust it
  rawTxs,
}
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'script-vectors.json')
writeFileSync(dest, JSON.stringify(out, null, 1))
console.error(`\n  ${scripts.length} distinct scripts, ${Math.min(...scripts.map(s => s.bytes))}–${Math.max(...scripts.map(s => s.bytes))} bytes`)
console.error(`  → ${dest}`)
