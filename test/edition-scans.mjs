// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Edition scans — finding what a key holds, and who bought from a collection, through a fake network.
 *
 * ⚠ These scans read scripts out of transactions the network returns. The wallet core's transaction carries
 *   its outputs as `{ value, script }`, and the core is untyped, so a scan that still reads a field by its
 *   old name passes every static check and fails only when a real transaction arrives. That is what this
 *   file exists to run: the scans against real transaction objects, end to end.
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'escan-'))
await build({ entryPoints: [join(HERE, '..', 'src', 'editionBuilder.ts')], bundle: true, outfile: join(tmp, 'eb.mjs'),
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const EB = await import(pathToFileURL(join(tmp, 'eb.mjs')).href)

const publisher = Signer.fromSeed(new Uint8Array(64).fill(71))
const holder = Signer.fromSeed(new Uint8Array(64).fill(72))
const buyer = Signer.fromSeed(new Uint8Array(64).fill(73))
const TX1 = 'a5'.repeat(31) + '03'
const terms = { publisherPubKeyHash: Array.from(publisher.hash160()), publisherFeeSats: 500, holderFeeSats: 1500, tokenSats: 1000 }
const funding = (n, sats) => [{ utxo: { txId: 'bb'.repeat(31) + n.toString(16).padStart(2, '0'), outputIndex: 0, satoshis: sats, script: '' } }]

/** A fake network holding known transactions. History is served per address from the outputs paying it. */
function net(txs, heights) {
  const byId = new Map(txs.map(t => [t.txid(), t]))
  const spent = new Set(txs.flatMap(t => t.inputs.map(i => `${toHex(i.txid)}:${i.vout}`)))
  const wireOf = id => toHex(Uint8Array.from(Buffer.from(id, 'hex')).reverse())
  return {
    getAddress() { return '' },
    async getSourceTransaction(id) { const t = byId.get(id); if (!t) throw new Error(`no tx ${id}`); return t },
    async getUtxos() { return [] },
    // ⚠ served for EVERY address: the scans' own checks are what keep the wrong key's editions out
    async getAddressHistory() { return txs.map(t => ({ txId: t.txid(), blockHeight: heights.get(t.txid()) ?? 0 })) },
    async getUnspentByScriptHash(sh) {
      const out = []
      for (const t of txs) t.outputs.forEach((o, i) => {
        if (EB.wocScriptHash(Array.from(o.script)) === sh && !spent.has(`${wireOf(t.txid())}:${i}`)) {
          out.push({ txId: t.txid(), outputIndex: i, satoshis: o.value, height: heights.get(t.txid()) ?? 0 })
        }
      })
      return out
    },
  }
}

// ── ★★★ 1 · a holder finds the edition minted to them ───────────────────────────────────────────────
const genesis = await EB.buildEditionGenesisTx({ key: publisher, funding: funding(1, 300000), tx1Ref: TX1, terms, ownerPubKey: Array.from(holder.publicKey()) })
{
  const p = net([genesis.tx], new Map([[genesis.txId, 900001]]))
  const found = await EB.scanIncomingEditions(p, toHex(holder.publicKey()))
  ok(found.length === 1, `★★★ the holder's scan finds exactly one edition (${found.length})`)
  ok(found[0]?.txId === genesis.txId && found[0]?.outputIndex === genesis.editionVouts[0], '★★ …at the genesis outpoint')
  ok(found[0]?.tx1RefHex === TX1 && found[0]?.terms.publisherFeeSats === 500 && found[0]?.terms.holderFeeSats === 1500, '★★ …with the collection and terms read from the script')
  ok(found[0]?.lockHex === toHex(genesis.tx.outputs[genesis.editionVouts[0]].script), '★ …and the exact lock script')
  ok(found[0]?.height === 900001, '★ …and its height')
  ok((await EB.scanIncomingEditions(p, toHex(buyer.publicKey()))).length === 0, '⛔ a key that holds nothing finds nothing')
}

// ── ★★★ 2 · after a replication, the buyer holds a copy and the publisher sees the buyer ─────────────
{
  const vout = genesis.editionVouts[0]
  const rep = await EB.buildReplicateTx({
    edition: { txId: genesis.txId, outputIndex: vout, satoshis: 1000, lockBytes: Array.from(genesis.tx.outputs[vout].script) },
    terms, buyerKey: buyer, funding: funding(2, 300000),
  })
  const p = net([genesis.tx, rep.tx], new Map([[genesis.txId, 900001], [rep.txId, 900002]]))
  const mine = await EB.scanIncomingEditions(p, toHex(buyer.publicKey()))
  ok(mine.length === 1 && mine[0].txId === rep.txId && mine[0].outputIndex === rep.replicaVout, '★★★ the buyer finds their replica')
  const held = await EB.scanIncomingEditions(p, toHex(holder.publicKey()))
  ok(held.length === 1 && held[0].txId === rep.txId && held[0].outputIndex === rep.holderTokenVout, '★★ the holder\'s copy moved to the replication\'s out[0], and the genesis output is no longer listed')
  const r = await EB.scanCollectionBuyers(p, { collectionId: TX1, publisherPubKeyHashHex: toHex(publisher.hash160()) })
  ok(r.buyers.length === 1 && r.buyers[0].pubKeyHex === toHex(buyer.publicKey()) && r.buyers[0].count === 1, '★★★ the publisher\'s buyer scan names the buyer once')
  ok(r.scanned === 2 && r.capped === false, '★ …having read both transactions, uncapped')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [edition scans · through real transaction objects]`)
process.exit(fail === 0 ? 0 : 1)
