// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The marker backup — every transaction that brought the wallet a 1-sat marker or a token, through real
 * edition and replication transactions and a fake network.
 *
 * ⚠ The case it exists for: a token whose marker has been spent and whose transaction the explorer's
 *   history no longer lists. Only a record kept by the wallet itself still names that transaction.
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
const rejects = async (p, m) => { try { await p; return false } catch (e) { return String(e.message).includes(m) } }
const throws = (f, m) => { try { f(); return false } catch (e) { return String(e.message).includes(m) } }

const tmp = mkdtempSync(join(tmpdir(), 'mbak-'))
const load = async (name, file) => {
  await build({ entryPoints: [join(HERE, '..', 'src', file)], bundle: true, outfile: join(tmp, name),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
  return import(pathToFileURL(join(tmp, name)).href)
}
const MB = await load('mb.mjs', 'markerBackup.ts')
const EB = await load('eb.mjs', 'editionBuilder.ts')

const publisher = Signer.fromSeed(new Uint8Array(64).fill(81))
const holder = Signer.fromSeed(new Uint8Array(64).fill(82))
const buyer = Signer.fromSeed(new Uint8Array(64).fill(83))
const stranger = Signer.fromSeed(new Uint8Array(64).fill(84))
const HOLDER = { address: holder.address(), pub: toHex(holder.publicKey()) }
const TX1 = 'b6'.repeat(31) + '04'
// 1-sat fees: the publisher's and the holder's fee outputs are then 1-sat P2PKH markers
const terms = { publisherPubKeyHash: Array.from(publisher.hash160()), publisherFeeSats: 1, holderFeeSats: 1, tokenSats: 1 }
const funding = (n, sats) => [{ utxo: { txId: 'cc'.repeat(31) + n.toString(16).padStart(2, '0'), outputIndex: 0, satoshis: sats, script: '' } }]

const genesis = await EB.buildEditionGenesisTx({ key: publisher, funding: funding(1, 300000), tx1Ref: TX1, terms, ownerPubKey: Array.from(holder.publicKey()) })
const ev = genesis.editionVouts[0]
const replicate = async (n, from) => EB.buildReplicateTx({
  edition: { txId: from.txId, outputIndex: from.vout, satoshis: 1, lockBytes: Array.from(from.tx.outputs[from.vout].script) },
  terms, buyerKey: buyer, funding: funding(n, 300000),
})
const rep = await replicate(2, { txId: genesis.txId, vout: ev, tx: genesis.tx })
// a plain payment to the holder, of more than 1 sat: not a marker, and no token
const pay = new Tx(1, [{ txid: new Uint8Array(32).fill(9), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                     [{ value: 5000, script: holder.lockingScript() }, { value: 2, script: holder.lockingScript() }], 0)

// ── ★★★ 1 · what one transaction holds for the wallet ───────────────────────────────────────────────
{
  const r = MB.readMarkers(rep.tx, HOLDER.address, HOLDER.pub)
  ok(r.markerVouts.length === 1 && rep.tx.outputs[r.markerVouts[0]].value === 1, `★★★ the holder's 1-sat fee output is read as a marker (${r.markerVouts})`)
  ok(r.carries.length === 1 && r.carries[0].outputIndex === rep.holderTokenVout && r.carries[0].kind === 'edition' && r.carries[0].collectionId === TX1,
     '★★ …and the holder\'s copy, returned at out[0], as an edition of its collection')
  const b = MB.readMarkers(rep.tx, buyer.address(), toHex(buyer.publicKey()))
  ok(b.markerVouts.length === 0 && b.carries.length === 1 && b.carries[0].outputIndex === rep.replicaVout,
     '★★★ a bought copy comes with no 1-sat marker, and is still read: the token it carries')
  const s = MB.readMarkers(rep.tx, stranger.address(), toHex(stranger.publicKey()))
  ok(s.markerVouts.length === 0 && s.carries.length === 0, '⛔ a key the transaction does not pay reads nothing')
  const g = MB.readMarkers(genesis.tx, HOLDER.address, HOLDER.pub)
  ok(g.markerVouts.length === 0 && g.carries.length >= 1, '★ a 1-sat edition output is a token, not a marker')
  const p = MB.readMarkers(pay, HOLDER.address, HOLDER.pub)
  ok(p.markerVouts.length === 0 && p.carries.length === 0, '⛔ a payment of 2 or 5,000 sat is not a marker')
}

// ── a fake network: the full history, transactions that can be made to fail, and Merkle proofs ──────
// A proof for a block holding one transaction: no path, and the root is the txid itself.
function net(entries, { failing = new Set(), historyFails = false, proofs = 'good' } = {}) {
  const byId = new Map(entries.map(e => [e.tx.txid(), e.tx]))
  const fetched = [], proofAsked = []
  return {
    fetched, proofAsked,
    async getFullAddressHistory() {
      if (historyFails) throw new Error('WoC confirmed history fetch failed: 500')
      return entries.map(e => ({ txId: e.tx.txid(), blockHeight: e.h }))
    },
    async getSourceTransaction(id) {
      fetched.push(id)
      if (failing.has(id)) throw new Error('fetch failed')
      const t = byId.get(id); if (!t) throw new Error(`no tx ${id}`); return t
    },
    async getMerkleProof(id) {
      proofAsked.push(id)
      const e = entries.find(x => x.tx.txid() === id)
      if (proofs === 'none' || e == null || e.h === 0) return null
      return { txId: id, blockHeight: e.h, merkleRoot: proofs === 'bad' ? 'ff'.repeat(32) : id, path: [] }
    },
  }
}

// ── ★★★ 2 · first use reads everything; later uses read only what is new ────────────────────────────
const later = await replicate(3, { txId: rep.txId, vout: rep.holderTokenVout, tx: rep.tx })
let afterFirst
{
  const p = net([{ tx: genesis.tx, h: 100 }, { tx: rep.tx, h: 101 }, { tx: pay, h: 101 }])
  const { backup, added, fetched } = await MB.updateMarkerBackup(p, HOLDER.address, HOLDER.pub, MB.emptyMarkerBackup(HOLDER.address))
  ok(fetched === 3 && added === 2, `★★★ the first use reads all three and records the two that brought a token (${fetched}, ${added})`)
  ok(backup.readToHeight === 101, `★ …read to the top block (${backup.readToHeight})`)
  ok(!backup.markers.some(m => m.txId === pay.txid()), '⛔ the plain payment is not recorded')
  afterFirst = backup
}
{
  const p = net([{ tx: genesis.tx, h: 100 }, { tx: rep.tx, h: 101 }, { tx: pay, h: 101 }, { tx: later.tx, h: 105 }])
  const { backup, added } = await MB.updateMarkerBackup(p, HOLDER.address, HOLDER.pub, afterFirst)
  ok(!p.fetched.includes(genesis.txId), '★★★ a transaction below the height already read is not fetched again')
  ok(!p.fetched.includes(rep.txId), '★★ …nor one already recorded')
  ok(p.fetched.includes(later.txId) && added === 1, '★★★ the new replication is read and recorded')
  ok(p.fetched.includes(pay.txid()), '★ the top block already read is read again, in case it was not complete')
  ok(backup.markers.length === 3 && backup.readToHeight === 105, `★ three recorded, read to block 105 (${backup.markers.length}, ${backup.readToHeight})`)
}

// ── ★★★ 2b · each record keeps its whole transaction and, once confirmed, its Merkle proof ───────────
{
  const rec = afterFirst.markers.find(m => m.txId === rep.txId)
  ok(rec?.rawHex === rep.tx.hex(), '★★★ the whole transaction is kept')
  ok(rec?.proof?.merkleRoot === rep.txId && rec?.proof?.blockHeight === 101, '★★★ …and its Merkle proof')
  const p = net([{ tx: genesis.tx, h: 100 }, { tx: rep.tx, h: 101 }, { tx: pay, h: 101 }])
  await MB.updateMarkerBackup(p, HOLDER.address, HOLDER.pub, afterFirst)
  ok(p.proofAsked.length === 0, `★★ a proof already held is never asked for again (${p.proofAsked.length})`)
  const u = net([{ tx: later.tx, h: 0 }])
  const r = await MB.updateMarkerBackup(u, HOLDER.address, HOLDER.pub, MB.emptyMarkerBackup(HOLDER.address))
  ok(u.proofAsked.length === 0 && r.backup.markers[0]?.proof === undefined, '★ an unconfirmed transaction has no proof to ask for yet')
  const bad = net([{ tx: rep.tx, h: 101 }], { proofs: 'bad' })
  const rb = await MB.updateMarkerBackup(bad, HOLDER.address, HOLDER.pub, MB.emptyMarkerBackup(HOLDER.address))
  ok(rb.backup.markers[0]?.proof === undefined && rb.proved === 0, '⛔ a proof whose path does not reach its root is not kept')
}
// ── ★★ a format 1 backup (no transactions, no proofs) reads, and is filled in once ──────────────────
{
  const v1 = { schema: 1, address: HOLDER.address, readToHeight: 102,
    markers: [{ txId: rep.txId, markerVouts: [3], carries: [{ outputIndex: rep.holderTokenVout, kind: 'edition', collectionId: TX1 }], height: 101 }] }
  const parsed = MB.parseMarkerBackup(JSON.stringify(v1))
  ok(parsed.schema === 2 && parsed.tokens.length === 0 && parsed.markers[0].rawHex === undefined, '★★ a format 1 file reads, as format 2 with no transactions, proofs or tokens')
  const p = net([{ tx: rep.tx, h: 101 }])
  const { backup } = await MB.updateMarkerBackup(p, HOLDER.address, HOLDER.pub, parsed)
  ok(backup.markers[0].rawHex === rep.tx.hex() && backup.markers[0].proof != null, '★★ …and the next update fills in its transaction and its proof')
}

// ── ⛔ a transaction that cannot be fetched holds the height read, so it is tried again ──────────────
{
  const p = net([{ tx: genesis.tx, h: 100 }, { tx: rep.tx, h: 101 }, { tx: later.tx, h: 105 }], { failing: new Set([rep.txId]) })
  const { backup } = await MB.updateMarkerBackup(p, HOLDER.address, HOLDER.pub, MB.emptyMarkerBackup(HOLDER.address))
  ok(backup.readToHeight === 101, `★★★ a failed fetch at block 101 holds the height read at 101, not 105 (${backup.readToHeight})`)
  const retry = net([{ tx: genesis.tx, h: 100 }, { tx: rep.tx, h: 101 }, { tx: later.tx, h: 105 }])
  const again = await MB.updateMarkerBackup(retry, HOLDER.address, HOLDER.pub, backup)
  ok(retry.fetched.includes(rep.txId) && again.backup.markers.some(m => m.txId === rep.txId), '★★ …and the next use reads it')
  ok(again.backup.readToHeight === 105, '★ …and then moves on to the top')
}
{
  const p = net([{ tx: genesis.tx, h: 100 }], { historyFails: true })
  ok(await rejects(MB.updateMarkerBackup(p, HOLDER.address, HOLDER.pub, afterFirst), 'history fetch failed'),
     '⛔ a history that cannot be listed throws, so the caller keeps the backup it had')
}

// ── ★★ 3 · the file: read back, joined, and refused for another wallet ──────────────────────────────
{
  const round = MB.parseMarkerBackup(JSON.stringify(afterFirst, null, 1))
  ok(round.address === HOLDER.address && round.markers.length === afterFirst.markers.length && round.readToHeight === 101, '★★ a saved file reads back as it was')
  ok(throws(() => MB.parseMarkerBackup('not json'), 'not a token backup'), '⛔ a file that is not JSON is refused')
  ok(throws(() => MB.parseMarkerBackup('{"schema":1}'), 'not a token backup'), '⛔ JSON that is not a backup is refused')
  ok(throws(() => MB.parseMarkerBackup(JSON.stringify({ ...afterFirst, schema: 9 })), 'format 9'), '⛔ a later format is refused, by name')
  const other = { ...MB.emptyMarkerBackup(HOLDER.address), readToHeight: 200, markers: [{ txId: later.txId, markerVouts: [3], carries: [], height: 105 }] }
  const joined = MB.mergeMarkerBackups(afterFirst, other)
  ok(joined.markers.length === 3 && joined.readToHeight === 200, '★★ two backups of one wallet join: every transaction in either, the higher height read')
  ok(throws(() => MB.mergeMarkerBackups(afterFirst, MB.emptyMarkerBackup(stranger.address())), 'different wallet'), '⛔ a backup of another wallet is refused')
}
// ── ⛔ what a file claims is checked, not trusted ───────────────────────────────────────────────────
{
  const f = JSON.parse(JSON.stringify(afterFirst))
  const r = f.markers.find(m => m.txId === rep.txId)
  r.rawHex = genesis.tx.hex() // another transaction's bytes
  r.proof = { ...r.proof, merkleRoot: 'ee'.repeat(32) }
  const back = MB.parseMarkerBackup(JSON.stringify(f))
  const br = back.markers.find(m => m.txId === rep.txId)
  ok(br.rawHex === undefined, '⛔ bytes that do not hash to their txid are dropped, not trusted')
  ok(br.proof === undefined, '⛔ a proof that does not reach its root is dropped')
  ok(back.markers.find(m => m.txId === genesis.txId)?.rawHex === genesis.tx.hex(), '★ …while the records that check out are kept whole')
}
// ── ★★ joining keeps the most either copy holds; the provider is offered every whole transaction ────
{
  const bare = MB.parseMarkerBackup(JSON.stringify({ schema: 1, address: HOLDER.address, readToHeight: 300,
    markers: afterFirst.markers.map(m => ({ txId: m.txId, markerVouts: m.markerVouts, carries: m.carries, height: m.height })) }))
  const j = MB.mergeMarkerBackups(bare, afterFirst)
  ok(j.markers.every(m => m.rawHex && m.proof) && j.readToHeight === 300, '★★ joining keeps each transaction and proof, whichever copy held it')
  const token = { txId: genesis.txId, outputIndex: ev, collectionId: TX1, stateData: '', status: 'active', addedAt: '2026-06-01T00:00:00.000Z', kind: 'edition' }
  const withList = MB.parseMarkerBackup(JSON.stringify({ ...afterFirst, tokens: [token, { txId: 'bad' }] }))
  ok(withList.tokens.length === 1 && withList.tokens[0].addedAt === token.addedAt, '★★ the token list reads back, a malformed entry dropped')
  ok(MB.mergeMarkerBackups(MB.emptyMarkerBackup(HOLDER.address), withList).tokens.length === 1, '★ …and survives a join')
  ok(MB.heldTransactions(afterFirst).length === afterFirst.markers.length, '★ every transaction held whole is offered to the provider')
}

// ── ★ the file is named after the wallet's handle ───────────────────────────────────────────────────
{
  const A = '1TestAdr' + 'x'.repeat(26)
  const T = new Date(2026, 10, 16, 9, 5) // local time, single-digit hour and minute
  const name = h => MB.markerBackupFileName(A, h, T)
  ok(name('') === 'smartnfts-token-backup-1TestAdr_2026-11-16_0905.json', `★ with no handle, the plain name and the local date and time (${name('')})`)
  ok(name('alice') === 'alice-smartnfts-token-backup-1TestAdr_2026-11-16_0905.json', '★★ the handle leads the name')
  ok(name('@al ice/x') === 'al-ice-x-smartnfts-token-backup-1TestAdr_2026-11-16_0905.json', '⚠ an @, a space and a slash never reach the file name')
  ok(name('小明') === '小明-smartnfts-token-backup-1TestAdr_2026-11-16_0905.json', '★ a handle in Chinese is kept as it is')
  ok(name('..hidden') === 'hidden-smartnfts-token-backup-1TestAdr_2026-11-16_0905.json', '⛔ a leading dot is dropped, so the file is never hidden')
  ok(name('///') === 'smartnfts-token-backup-1TestAdr_2026-11-16_0905.json', '★ a handle with nothing usable falls back to the plain name')
  ok(!MB.markerBackupFileName(A, 'alice').includes(':'), '⛔ no colon in a name made from the current time')
}

// ── ★★★ 4 · restore: the backup finds an edition that neither the history nor the coins name ────────
{
  const byId = new Map([[genesis.txId, genesis.tx]])
  const blind = {
    getAddress() { return '' },
    async getSourceTransaction(id) { const t = byId.get(id); if (!t) throw new Error(`no tx ${id}`); return t },
    async getUtxos() { return [] },
    async getFullAddressHistory() { return [] },
    async getAddressHistory() { return [] },
    async getUnspentByScriptHash(sh) {
      const out = []
      genesis.tx.outputs.forEach((o, i) => { if (EB.wocScriptHash(Array.from(o.script)) === sh) out.push({ txId: genesis.txId, outputIndex: i, satoshis: o.value, height: 100 }) })
      return out
    },
  }
  ok((await EB.scanIncomingEditions(blind, HOLDER.pub)).length === 0, '⚠ with no history and no marker left, the scan alone finds nothing')
  const found = await EB.scanIncomingEditions(blind, HOLDER.pub, undefined, MB.markerTxIds(afterFirst))
  ok(found.some(f => f.txId === genesis.txId && f.outputIndex === ev), '★★★ given the backup, the same scan finds the edition')
  // local first: the list already holds the edition's script, and the history only has what was read before
  const read = []
  const old = { ...blind, async getFullAddressHistory() { return [{ txId: genesis.txId, blockHeight: 100 }] },
    async getSourceTransaction(id) { read.push(id); return blind.getSourceTransaction(id) } }
  const held = await EB.scanIncomingEditions(old, HOLDER.pub, { scripts: new Map([[toHex(genesis.tx.outputs[ev].script), TX1]]), sinceHeight: 100 }, [])
  ok(held.some(f => f.txId === genesis.txId && f.outputIndex === ev), '★★ an edition the list holds is found where it now is, from its script')
  ok(read.filter(id => id === genesis.txId).length <= 1, `★ …the old transaction read at most once, for its note (${read.length})`)
  // ⚠ an unspent list that has not caught up: it still lists the genesis outpoint the replication spends
  const stale = { ...blind,
    async getFullAddressHistory() { return [{ txId: genesis.txId, blockHeight: 100 }, { txId: rep.txId, blockHeight: 0 }] },
    async getSourceTransaction(id) { return id === rep.txId ? rep.tx : blind.getSourceTransaction(id) },
    async getUnspentByScriptHash() { return [{ txId: genesis.txId, outputIndex: ev, satoshis: 1, height: 100 }, { txId: rep.txId, outputIndex: rep.holderTokenVout, satoshis: 1, height: 0 }] } }
  const live = await EB.scanIncomingEditions(stale, HOLDER.pub)
  ok(!live.some(f => f.txId === genesis.txId) && live.some(f => f.txId === rep.txId && f.outputIndex === rep.holderTokenVout),
     '★★★ an outpoint spent by a transaction the scan read is never a holding, whatever the unspent list says')
  // ★ the bulk call is used when the provider has it, and the one-at-a-time call is not
  let one = 0, many = 0
  const bulky = { ...old,
    async getUnspentByScriptHash() { one++; return [] },
    async getUnspentByScriptHashes(hashes) { many++; return new Map(hashes.map(h => [h, [{ txId: genesis.txId, outputIndex: ev, satoshis: 1, height: 100 }]])) } }
  const viaBulk = await EB.scanIncomingEditions(bulky, HOLDER.pub, { scripts: new Map([[toHex(genesis.tx.outputs[ev].script), TX1]]), sinceHeight: 100 }, [])
  ok(many === 1 && one === 0 && viaBulk.some(f => f.txId === genesis.txId), `★★ every edition is checked in one bulk call (${many} bulk, ${one} single)`)
  // a restore from a file: the list is empty, the history names the transaction as already read, and only
  // the backup says to read it. ⚠ It must be read: a height from the history must not turn it into a skip.
  const restored = await EB.scanIncomingEditions(old, HOLDER.pub, { scripts: new Map(), sinceHeight: 100 }, [genesis.txId])
  ok(restored.some(f => f.txId === genesis.txId && f.outputIndex === ev), '★★★ a transaction the backup names is read even when the history calls it old')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [marker backup · real transactions, a fake network]`)
process.exit(fail === 0 ? 0 : 1)
