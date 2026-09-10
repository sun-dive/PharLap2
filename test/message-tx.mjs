// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Message transactions — graded on BYTE-IDENTICAL TRANSACTIONS against the deployed builder, then driven
 * end to end: a message sent through a fake network is found and opened by the recipient, and by nobody else.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { fromHex, toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'message-tx-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [message tx · deployed-transaction vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'msgtx-'))
const load = async m => {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
  return import(pathToFileURL(join(tmp, `${m}.mjs`)).href)
}
const MB = await load('messageBuilder')
const TC = await load('tokenCodec')
const MC = await load('messageCodec')
const BY = await load('bytes')

const sender = Signer.fromPrivateKey(fromHex(V.key))
const fundingOf = list => list.map(f => ({ utxo: { txId: f.txId, outputIndex: f.outputIndex, satoshis: f.satoshis, script: '' } }))

// ── ★★★ 1 · byte identity ───────────────────────────────────────────────────────────────────────────
for (const c of V.cases) {
  const r = await MB.buildMessageTx({ key: sender, funding: fundingOf(c.funding), recipientPubKeyHex: V.recipientPub, envelope: V.envelope, ...c.opts })
  ok(r.tx.hex() === c.hex, `★★★ ${c.name}: byte-identical to the deployed builder`)
  ok(r.messageVout === c.messageVout && r.notifyVout === c.notifyVout && r.changeVout === c.changeVout && r.changeSats === c.changeSats,
     `★ ${c.name}: vouts and change reported as deployed`)
}
{
  const r = await MB.buildMessageTx({ key: sender, funding: fundingOf(V.cases[0].funding), recipientPubKeyHex: V.recipientPub, envelope: V.envelope })
  const m = TC.parseMessageScript(LockingScript.fromBinary(r.tx.outputs[r.messageVout].script))
  ok(m !== null && m.recipientPubKeyHex === V.recipientPub && m.fields.envelope.length === V.envelope.length,
     '★★ output 0 is a RECORD_MESSAGE locked to the recipient, carrying the envelope')
  ok(toHex(r.tx.outputs[r.notifyVout].script) === toHex(scriptForAddress(BY.addressFromPubHex(V.recipientPub))) && r.tx.outputs[r.notifyVout].value === 1,
     '★★ the notification is 1 sat to the recipient\'s address')
}

// ── ★★ 2 · end to end: sent, found, opened — by the recipient only ──────────────────────────────────
{
  const recipient = Signer.fromSeed(new Uint8Array(64).fill(91))
  const stranger = Signer.fromSeed(new Uint8Array(64).fill(92))
  const byId = new Map()
  const sent = []
  const net = who => ({
    async getUtxos() { return who === sender ? [{ txId: 'cd'.repeat(31) + '05', outputIndex: 0, satoshis: 100000, script: '' }] : [] },
    async getSourceTransaction(id) { const t = byId.get(id); if (!t) throw new Error(`no tx ${id}`); return t },
    async broadcast(h) { sent.push(h); const t = Tx.parse(h); byId.set(t.txid(), t); return t.txid() },
    registerPendingTx() {},
    // the notification output puts the carrying tx in the RECIPIENT's history; nobody else's
    async getAddressHistory() { return who === recipient ? sent.map(h => ({ txId: Tx.parse(h).txid(), blockHeight: 0 })) : [] },
  })
  const parts = [{ kind: 'text', text: 'your unlock key + a bonus 🎁' }, { kind: 'key', key: Array.from({ length: 32 }, (_, i) => (i * 3) & 0xff) }]
  const s = await MB.sendMessage(net(sender), sender, { toPubKeyHex: toHex(recipient.publicKey()), parts, senderAlias: 'al', sentAt: 1757500000000 })
  ok(sent.length === 1 && s.messageOutpoint.outputIndex === 0, '★ the message went out, record at output 0')

  const inbox = await MB.scanIncomingMessages(net(recipient), recipient)
  ok(inbox.length === 1 && inbox[0].txId === s.txId, '★★★ the recipient finds it from their address history')
  ok(inbox.length === 1 && JSON.stringify(inbox[0].parts) === JSON.stringify(parts), '★★★ …and opens it: the parts come back exactly')
  ok(inbox.length === 1 && inbox[0].senderPubKeyHex === toHex(sender.publicKey()) && inbox[0].encrypted === true && inbox[0].senderAlias === 'al',
     '★★ …authenticated to the sender, encrypted, alias carried')
  ok((await MB.scanIncomingMessages(net(stranger), stranger)).length === 0, '⛔ a stranger\'s scan finds nothing')

  // and even holding the transaction, a stranger cannot open the envelope
  const m = TC.parseMessageScript(LockingScript.fromBinary(byId.get(s.txId).outputs[0].script))
  ok((await MC.openEnvelope(m.fields.envelope, stranger)) === null, '⛔ …and cannot open the envelope with the wrong key')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [message tx · byte-identical transactions]`)
process.exit(fail === 0 ? 0 : 1)
