// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Collect REAL MAINNET P2PKH SPENDS as vectors for `impl/js/signer.mjs`.
 *
 * ★★★ THE ORACLE IS THE NETWORK'S OWN ACCEPTANCE. These signatures were checked by miners and buried
 *   under thousands of blocks. If our BIP-143 preimage, our DER decoding and our verifier agree that
 *   they are valid, then all three agree with consensus — a claim no amount of signing-and-verifying
 *   with our own code can make, because that only proves we agree with ourselves.
 *
 * ⚠⚠ A SPEND CANNOT BE CHECKED FROM THE SPENDING TRANSACTION ALONE. BIP-143 commits to the script and
 *   the amount of the output being spent, and a transaction does not contain either. ⇒ Every input
 *   needs one hop back to the funding transaction, which is what most of this file is doing.
 *
 * ⚠ Both transactions are round-tripped before anything is taken from them. If the bytes were not read
 *   correctly, nothing extracted from them is worth grading against.
 *
 *   node tools/gen-spend-vectors.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { Tx } from '../impl/js/transaction.mjs'
import { Script } from '../impl/js/script.mjs'
import { toHex, reversed } from '../impl/js/bytes.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WOC = 'https://api.whatsonchain.com/v1/bsv/main'
/** ⚠ Space the requests. A free endpoint is someone else's machine. */
const sleep = ms => new Promise(r => setTimeout(r, ms))

const cache = new Map()
async function rawTx(txid) {
  if (cache.has(txid)) return cache.get(txid)
  const r = await fetch(`${WOC}/tx/${txid}/hex`)
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${txid.slice(0, 12)}…`)
  const hex = (await r.text()).trim()
  // ⚠ THE GATE, on both hops.
  if (Tx.parse(hex).hex() !== hex) throw new Error(`${txid.slice(0, 12)}… does not round-trip`)
  cache.set(txid, hex)
  await sleep(400)
  return hex
}

/** The spending transactions to mine for P2PKH inputs. Taken from the script vectors already collected. */
const V = JSON.parse(readFileSync(join(HERE, '..', 'test', 'script-vectors.json'), 'utf8'))
const TXIDS = V.rawTxs.map(t => t.txid)

const vectors = []
for (const txid of TXIDS) {
  try {
    const spendHex = await rawTx(txid)
    const tx = Tx.parse(spendHex)
    for (const [n, inp] of tx.inputs.entries()) {
      const c = Script.fromBinary(inp.script).chunks
      // ★ the P2PKH unlocking shape: exactly two pushes, the second a 33- or 65-byte public key
      if (c.length !== 2 || !c[0].data || !c[1].data) continue
      if (c[1].data.length !== 33 && c[1].data.length !== 65) continue

      // ⚠ inp.txid is WIRE order; the API wants the DISPLAY form, which is its reverse.
      const prevHex = await rawTx(toHex(reversed(inp.txid)))
      const prevOut = Tx.parse(prevHex).outputs[inp.vout]
      if (!prevOut) { console.error(`  ⚠ ${txid.slice(0, 8)}:in${n} — no output ${inp.vout}`); continue }

      vectors.push({
        source: `${txid.slice(0, 8)}:in${n}`,
        spendingTx: spendHex,
        inputIndex: n,
        prevScript: toHex(prevOut.script),
        prevValue: prevOut.value,
        sig: toHex(c[0].data),
        pubkey: toHex(c[1].data),
      })
      console.error(`  ✓ ${txid.slice(0, 8)}:in${n}  sig ${c[0].data.length}B · key ${c[1].data.length}B `
                  + `· funded with ${prevOut.value} sat`)
    }
  } catch (e) { console.error(`  ⚠ ${txid.slice(0, 12)}… ${String(e.message).slice(0, 70)}`) }
}

const out = {
  _: 'REAL MAINNET P2PKH SPENDS, fetched and frozen. ★ The oracle is the network\'s own acceptance: '
   + 'these signatures were validated by miners and buried under thousands of blocks. Verifying them '
   + 'grades our BIP-143 preimage, our DER decoding and our verifier against consensus itself.',
  _why: 'Signing with our code and verifying with our code proves only that we agree with ourselves. '
   + 'This is the check that is not circular.',
  _needs: 'Each vector carries the FUNDING output\'s script and amount, because BIP-143 commits to both '
   + 'and the spending transaction contains neither.',
  source: 'WhatsOnChain, mainnet',
  generated: new Date().toISOString().slice(0, 10),
  vectors,
}
const dest = join(HERE, '..', 'test', 'spend-vectors.json')
writeFileSync(dest, JSON.stringify(out, null, 1))
console.error(`\n  ${vectors.length} real P2PKH spends\n  → ${dest}`)
