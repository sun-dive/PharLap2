// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Air-gapped signing — graded on BYTE-IDENTICAL TRANSACTIONS against the deployed offline signer.
 *
 * ★★★ THE REQUEST FILE IS A FORMAT THAT CROSSES MACHINES. The vectors hold requests the deployed watch side
 *   wrote; ours must decode them, sign them to the same raw bytes, and write the same file for the same inputs.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { fromHex, toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'airgap-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [air-gap · deployed vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'airgap-'))
await build({ entryPoints: [join(HERE, '..', 'src', 'airgap.ts')], bundle: true, outfile: join(tmp, 'airgap.mjs'),
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const AG = await import(pathToFileURL(join(tmp, 'airgap.mjs')).href)

const owner = Signer.fromPrivateKey(fromHex(V.ownerKey))
const attacker = Signer.fromSeed(new Uint8Array(64).fill(95))

// ── ★★★ 1 · the deployed requests, signed to the deployed bytes ─────────────────────────────────────
for (const [name, v] of [['burn', V.burn], ['transfer', V.transfer], ['payment', V.payment]]) {
  const req = AG.decodeAirgapRequest(v.request)
  ok(req.action === name, `★ the deployed ${name} request decodes`)
  const r = await AG.signAirgapRequest(req, owner)
  ok(r.rawTx === v.rawTx, `★★★ ${name}: signed offline to bytes identical to the deployed signer`)
  ok(r.txId === v.txId && r.txId === Tx.parse(r.rawTx).txid(), `★ ${name}: the deployed txid, and it is the signed transaction's`)
}

// ── ★★ 2 · the request we write is the file the deployed side wrote ─────────────────────────────────
{
  const genesis = Tx.parse(V.genesisHex)
  const ed = { txId: genesis.txid(), outputIndex: V.editionVout, satoshis: 2100, lockBytes: Array.from(genesis.outputs[V.editionVout].script), sourceTx: genesis }
  ok(AG.encodeAirgapRequest(AG.buildAirgapRequest('burn', ed)) === V.burn.request, '★★★ a burn request is written byte-for-byte as deployed')

  const f = V.transfer.funding[0]
  const fundingTx = Tx.parse(AG.decodeAirgapRequest(V.transfer.request).funding[0].sourceTxHex)
  const funding = [{ utxo: { txId: f.txId, outputIndex: f.outputIndex, satoshis: f.satoshis, script: '' }, sourceTx: fundingTx }]
  ok(AG.encodeAirgapRequest(AG.buildAirgapRequest('transfer', ed, { newOwnerPubKeyHex: V.recipientPub, funding })) === V.transfer.request,
     '★★★ a transfer request is written byte-for-byte as deployed')

  const pf = V.payment.funding[0]
  const payTx = Tx.parse(AG.decodeAirgapRequest(V.payment.request).funding[0].sourceTxHex)
  const payReq = AG.decodeAirgapRequest(V.payment.request)
  ok(AG.encodeAirgapRequest(AG.buildAirgapPaymentRequest({
    toAddress: payReq.payment.toAddress, amountSats: payReq.payment.amountSats,
    funding: [{ utxo: { txId: pf.txId, outputIndex: pf.outputIndex, satoshis: pf.satoshis, script: '' }, sourceTx: payTx }],
  })) === V.payment.request, '★★★ a payment request is written byte-for-byte as deployed')
}

// ── ⛔ 3 · the cold signer's refusals ────────────────────────────────────────────────────────────────
{
  let threw = ''
  try { await AG.signAirgapRequest(AG.decodeAirgapRequest(V.burn.request), attacker) } catch (e) { threw = String(e.message) }
  ok(/does not own that edition/.test(threw), '⛔ an edition the key does not own is refused')
  threw = ''
  try { await AG.signAirgapRequest(AG.decodeAirgapRequest(V.payment.request), attacker) } catch (e) { threw = String(e.message) }
  ok(/does not own one of the funding inputs/.test(threw), '⛔ funding the key does not own is refused')
  threw = ''
  try { AG.decodeAirgapRequest(JSON.stringify({ v: 999, action: 'burn' })) } catch (e) { threw = String(e.message) }
  ok(/version/.test(threw), '⛔ a wrong version is refused')
  threw = ''
  try { AG.decodeAirgapRequest(JSON.stringify({ v: 1, action: 'nope' })) } catch (e) { threw = String(e.message) }
  ok(/action/.test(threw), '⛔ an unknown action is refused')
  threw = ''
  try { AG.decodeAirgapRequest(JSON.stringify({ v: 1, action: 'payment', payment: { toAddress: owner.address(), amountSats: 1 }, funding: [] })) } catch (e) { threw = String(e.message) }
  ok(/no funding/.test(threw), '⛔ a payment with nothing to spend is refused')
  ok(AG.AIRGAP_VERSION === 1, '★ the request format is still version 1')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [air-gap · byte-identical requests and signatures]`)
process.exit(fail === 0 ? 0 : 1)
