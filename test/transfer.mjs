// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Token transfers — graded on BYTE-IDENTICAL TRANSACTIONS against the deployed builder.
 *
 * A transfer spends a PushDrop token at input 0 and funding at input 1+, so it is the first builder here
 * whose inputs are signed two different ways in one transaction. The vectors freeze what the deployed
 * builder produced for fixed keys, a fixed genesis and fixed funding; ours must match the raw hex.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { Script, LockingScript } from '../impl/js/script.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { fromHex, toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'transfer-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [transfer · deployed-transaction vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'xfer-'))
const load = async m => {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
  return import(pathToFileURL(join(tmp, `${m}.mjs`)).href)
}
const TR = await load('transfer')
const TC = await load('tokenCodec')
const BY = await load('bytes')

const key = Signer.fromPrivateKey(fromHex(V.key))
const genesis = Tx.parse(V.genesisHex)
const fundingOf = list => list.map(f => ({ utxo: { txId: f.txId, outputIndex: f.outputIndex, satoshis: f.satoshis, script: '' } }))

// ── ★★★ 1 · byte identity, every case ────────────────────────────────────────────────────────────────
for (const c of V.cases) {
  const r = await TR.buildTransferTx({
    key, tokenOutputIndex: 0, tokenSourceTx: genesis, recipientPubKeyHex: V.recipientPub, funding: fundingOf(c.funding), ...c.opts,
  })
  ok(r.tx.hex() === c.hex, `★★★ ${c.name}: byte-identical to the deployed builder`)
  ok(r.txId === Tx.parse(c.hex).txid(), `★ ${c.name}: the txid is the signed transaction's`)
  ok(r.recipientVout === c.recipientVout && r.notifyVout === c.notifyVout && r.publisherNotifyVout === c.publisherNotifyVout,
     `★ ${c.name}: the output indexes are reported as deployed`)
  ok(r.changeVout === c.changeVout && r.changeSats === c.changeSats, `★ ${c.name}: change vout + sats as deployed`)
  ok(JSON.stringify(r.tokenFields) === JSON.stringify(c.tokenFields), `★ ${c.name}: the token fields carried forward`)
}

// ── ★★ 2 · what the transaction says, read back ──────────────────────────────────────────────────────
{
  const r = await TR.buildTransferTx({
    key, tokenOutputIndex: 0, tokenSourceTx: genesis, recipientPubKeyHex: V.recipientPub, funding: fundingOf(V.cases[0].funding),
  })
  const tok = TC.parseTokenScript(LockingScript.fromBinary(r.tx.outputs[r.recipientVout].script))
  ok(tok !== null && tok.ownerPubKeyHex === V.recipientPub, '★★ output 0 is a token locked to the RECIPIENT')
  ok(tok !== null && tok.fields.tx1Ref === V.tx1 && tok.fields.stateData === 'beef', '★ …in the same collection, state carried forward')
  ok(r.tx.outputs[r.notifyVout].value === 1 &&
     toHex(r.tx.outputs[r.notifyVout].script) === toHex(scriptForAddress(BY.addressFromPubHex(V.recipientPub))),
     '★★ the notification is 1 sat to the recipient\'s ADDRESS — the discovery breadcrumb')

  /* ⚠⚠ TWO SIGNATURES, TWO LOCKS. Input 0 satisfies the token's PushDrop lock (the signature alone, key in
     the lock); input 1 satisfies the wallet's P2PKH lock. Each is verified against ITS OWN script and amount. */
  const sig0 = Script.fromBinary(r.tx.inputs[0].script).chunks[0]?.data
  ok(sig0 != null && Signer.verifyInput(r.tx, 0, genesis.outputs[0].script, genesis.outputs[0].value, key.publicKey(), sig0),
     '★★★ input 0 (the token) is signed under the token\'s own lock and value')
  const sig1 = Script.fromBinary(r.tx.inputs[1].script).chunks[0]?.data
  ok(sig1 != null && Signer.verifyInput(r.tx, 1, key.lockingScript(), V.cases[0].funding[0].satoshis, key.publicKey(), sig1),
     '★★★ input 1 (the funding) is signed under the wallet\'s P2PKH lock and its amount')

  const mine = TR.findOwnedTokenOutputs(r.tx, V.recipientPub)
  ok(mine.length === 1 && mine[0].outputIndex === r.recipientVout && mine[0].fields.tx1Ref === V.tx1,
     '★★ findOwnedTokenOutputs finds the recipient\'s token')
  ok(TR.findOwnedTokenOutputs(r.tx, toHex(key.publicKey())).length === 0, '★ …and the sender does not own it')

  let threw = ''
  try { await TR.buildTransferTx({ key, tokenOutputIndex: 1, tokenSourceTx: genesis, recipientPubKeyHex: V.recipientPub, funding: fundingOf(V.cases[0].funding) }) }
  catch (e) { threw = String(e.message) }
  ok(/not a PHAR LAP token/.test(threw), '⛔ spending an output that is not a token is refused before anything is built')
}

// ── ★★ 3 · the network wrapper, and the incoming scan ────────────────────────────────────────────────
{
  const sent = []
  const byId = new Map([[genesis.txid(), genesis]])
  const provider = {
    async getUtxos() { return V.wrapper.funding.map(f => ({ ...f, script: '' })) },
    async getSourceTransaction(id) { const t = byId.get(id); if (!t) throw new Error(`no tx ${id}`); return t },
    async broadcast(h) { sent.push(h); const t = Tx.parse(h); byId.set(t.txid(), t); return t.txid() },
    registerPendingTx() {},
    async getAddressHistory() { return sent.map(h => ({ txId: Tx.parse(h).txid(), blockHeight: 1 })) },
  }
  const r = await TR.createTransfer(provider, key, { tokenTxId: genesis.txid(), tokenOutputIndex: 0, recipientPubKeyHex: V.recipientPub })
  ok(sent.length === 1 && sent[0] === V.wrapper.hex, '★★★ createTransfer broadcasts the deployed bytes')
  ok(r.txId === V.wrapper.txId, '★ …and reports the deployed txid')

  const incoming = await TR.scanIncoming(provider, V.recipientPub)
  ok(incoming.length === 1 && incoming[0].txId === r.txId && incoming[0].outputIndex === r.recipientVout,
     '★★ scanIncoming surfaces the transfer from the recipient\'s address history')
  ok((await TR.scanIncoming(provider, toHex(key.publicKey()))).length === 0, '★ …and nothing for the sender')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [transfer · byte-identical transactions]`)
process.exit(fail === 0 ? 0 : 1)
