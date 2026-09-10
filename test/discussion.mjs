// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Corridor discussions.
 *
 * ★★★ THE FEED DERIVATIONS ARE ADDRESSES ON CHAIN. A node's feed, its downstream channel and its post ref are
 *   all derived from the node identity, and posts already made land at the deployed derivation. So those are
 *   graded on byte identity first, then the post transaction itself, then the walk up a real lineage.
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
try { V = JSON.parse(readFileSync(join(HERE, 'discussion-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [discussion · deployed vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'disc-'))
const load = async m => {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
  return import(pathToFileURL(join(tmp, `${m}.mjs`)).href)
}
const DS = await load('discussion')
const EB = await load('editionBuilder')
const CV = await load('covenant')
const h = a => toHex(Uint8Array.from(a))

const sender = Signer.fromPrivateKey(fromHex(V.key))
const c = V.collectionId, t = V.birthTxId

// ── ★★★ 1 · the derivations, byte for byte ──────────────────────────────────────────────────────────
ok(h(DS.nodeFeedHash160(c, t, 1)) === V.derive.nodeFeed, '★★★ node feed hash160 matches the deployed derivation')
ok(h(DS.nodeFeedHash160(c, t, 0)) === V.derive.nodeFeed0, '★★ …and for vout 0')
ok(h(DS.rootFeedHash160(c)) === V.derive.rootFeed, '★★★ root feed hash160 matches')
ok(h(DS.downFeedHash160(c, t, 1)) === V.derive.downFeed, '★★★ downstream channel hash160 matches')
ok(h(DS.rootDownFeedHash160(c)) === V.derive.rootDown, '★★★ root downstream hash160 matches')
ok(DS.nodeRef(c, t, 1) === V.derive.nodeRef, '★★★ the node ref matches')
ok(/^[0-9a-f]{64}$/.test(DS.nodeRef(c, t, 1)) && DS.nodeFeedHash160(c, t, 1).length === 20, '★ a 32-byte ref, a 20-byte hash')

// separation: the whole anti-cousin-leak invariant
ok(h(DS.nodeFeedHash160(c, t, 1)) !== h(DS.nodeFeedHash160(c, t, 0)), 'per-vout')
ok(h(DS.nodeFeedHash160(c, t, 1)) !== h(DS.nodeFeedHash160('11'.repeat(32), t, 1)), 'per-collection')
ok(h(DS.rootFeedHash160(c)) !== h(DS.nodeFeedHash160(c, c, 0)), 'root distinct from a node')
ok(h(DS.downFeedHash160(c, t, 1)) !== h(DS.nodeFeedHash160(c, t, 1)), '★ a node\'s downstream channel ≠ its own post feed')
ok(h(DS.rootDownFeedHash160(c)) !== h(DS.rootFeedHash160(c)), '★ root downstream ≠ root post feed')
ok(h(DS.downFeedHash160(c, t, 1)) !== h(DS.rootDownFeedHash160(c)), '★ node downstream ≠ root downstream')
ok(DS.nodeRef(c, t, 1) !== DS.nodeRef(c, t, 0), 'ref per-node')

// ── ★★★ 2 · a post, byte for byte — except the envelope's part order ───────────────────────────────
//
// ⚠ THE ENVELOPE IS THE ONE PLACE THIS REPOSITORY DELIBERATELY DIFFERS. The timestamp now goes FIRST inside
//   the plaintext (see the messaging commit that made it required), so two posts from one author no longer
//   share a leading block. The record's length, ref, recipient and what it opens to are unchanged, and every
//   other byte of the transaction is graded against the deployed one. The send time is pinned to the vector's.
const TC = await load('tokenCodec')
const MC = await load('messageCodec')
const LockingScript = (await import('../impl/js/script.mjs')).LockingScript
function net(fundings) {
  const sent = [], byId = new Map()
  return {
    sent, byId,
    async getUtxos() { return fundings.map(f => ({ ...f, script: '' })) },
    async getSourceTransaction(id) { const x = byId.get(id); if (!x) throw new Error(`no tx ${id}`); return x },
    async broadcast(hex) { const x = Tx.parse(hex); sent.push(hex); byId.set(x.txid(), x); return x.txid() },
    registerPendingTx() {},
    async getUnspentByScriptHash(sh) { return [...byId.values()].filter(x => x.outputs.some(o => EB.wocScriptHash(Array.from(o.script)) === sh)).map(x => ({ txId: x.txid() })) },
  }
}
const realNow = Date.now
Date.now = () => V.now
for (const k of V.cases) {
  const p = net(k.funding)
  const txId = await DS.postToNodeFeed(p, sender, {
    feedHash160: DS.nodeFeedHash160(c, t, 1), ref: DS.nodeRef(c, t, 1), text: V.text, senderAlias: V.senderAlias,
    downBreadcrumbs: k.downBreadcrumbs.map(x => Array.from(fromHex(x))),
  })
  const ours = Tx.parse(p.sent[0]), theirs = Tx.parse(k.hex)
  ok(ours.inputs.length === theirs.inputs.length && ours.inputs.every((i, n) => toHex(i.txid) === toHex(theirs.inputs[n].txid) && i.vout === theirs.inputs[n].vout),
     `★★ ${k.name}: the same inputs as the deployed post`)
  ok(ours.outputs.length === theirs.outputs.length && ours.outputs.every((o, n) => o.value === theirs.outputs[n].value),
     `★★★ ${k.name}: every output value matches — so the fee and the change match`)
  ok(ours.outputs.slice(1).every((o, n) => toHex(o.script) === toHex(theirs.outputs[n + 1].script)),
     `★★★ ${k.name}: the feed breadcrumb, downstream breadcrumbs and change are byte-identical`)
  const mo = TC.parseMessageScript(LockingScript.fromBinary(ours.outputs[0].script))
  const mt = TC.parseMessageScript(LockingScript.fromBinary(theirs.outputs[0].script))
  ok(mo !== null && mt !== null && mo.fields.ref === mt.fields.ref && mo.recipientPubKeyHex === mt.recipientPubKeyHex &&
     ours.outputs[0].script.length === theirs.outputs[0].script.length,
     `★★ ${k.name}: the post record has the deployed ref, lock key and length`)
  const oo = await MC.openPublicEnvelope(mo.fields.envelope), ot = await MC.openPublicEnvelope(mt.fields.envelope)
  ok(oo !== null && ot !== null && oo.parts[0].text === ot.parts[0].text && oo.sentAt === ot.sentAt && oo.senderPubKeyHex === ot.senderPubKeyHex,
     `★★★ ${k.name}: our envelope and the deployed one open to the same text, time and author`)
  ok(txId === ours.txid(), `★ ${k.name}: the reported txid is the broadcast transaction's`)

  // ★ and it reads back from the feed it was posted to
  const posts = await DS.scanNodeFeed(p, DS.nodeFeedHash160(c, t, 1), DS.nodeRef(c, t, 1))
  ok(posts.length === 1 && posts[0].text === V.text && posts[0].authorPubKeyHex === toHex(sender.publicKey()) && posts[0].senderAlias === V.senderAlias,
     `★★ ${k.name}: the post is found on the feed, authenticated to its author`)
  ok((await DS.scanNodeFeed(p, DS.nodeFeedHash160(c, t, 1), DS.nodeRef(c, t, 0))).length === 0, `★ ${k.name}: …and not under another node's ref`)
  if (k.downBreadcrumbs.length > 0) {
    ok((await DS.scanNodeFeed(p, DS.rootDownFeedHash160(c))).length === 1, `★★ ${k.name}: the root's downstream channel sees it too`)
  }
}
Date.now = realNow
{
  let threw = ''
  try { await DS.postToNodeFeed(net(V.cases[0].funding), sender, { feedHash160: DS.rootFeedHash160(c), ref: c, text: '   ' }) } catch (e) { threw = String(e.message) }
  ok(/empty/.test(threw), '⛔ an empty post is refused')
}

// ── ★★★ 3 · walking a real lineage: genesis → replica → replica ─────────────────────────────────────
{
  const publisher = Signer.fromSeed(new Uint8Array(64).fill(61))
  const holder = Signer.fromSeed(new Uint8Array(64).fill(62))
  const b1 = Signer.fromSeed(new Uint8Array(64).fill(63))
  const b2 = Signer.fromSeed(new Uint8Array(64).fill(64))
  const TX1 = 'cd'.repeat(32)
  const terms = { publisherPubKeyHash: Array.from(publisher.hash160()), publisherFeeSats: 5000, holderFeeSats: 1000, tokenSats: 2100 }
  const funding = (n, sats) => [{ utxo: { txId: 'bb'.repeat(31) + n.toString(16).padStart(2, '0'), outputIndex: 0, satoshis: sats, script: '' } }]
  const edition = (tx, txId, vout) => ({ txId, outputIndex: vout, satoshis: 2100, lockBytes: Array.from(tx.outputs[vout].script) })

  const genesis = await EB.buildEditionGenesisTx({ key: publisher, funding: funding(1, 300000), tx1Ref: TX1, terms, ownerPubKey: Array.from(holder.publicKey()) })
  const gVout = genesis.editionVouts[0]
  const rep1 = await EB.buildReplicateTx({ edition: edition(genesis.tx, genesis.txId, gVout), terms, buyerKey: b1, funding: funding(2, 300000) })
  const rep2 = await EB.buildReplicateTx({ edition: edition(rep1.tx, rep1.txId, 1), terms, buyerKey: b2, funding: funding(3, 300000) })
  const byId = { [genesis.txId]: genesis.tx, [rep1.txId]: rep1.tx, [rep2.txId]: rep2.tx }
  const provider = { getSourceTransaction: async id => byId[id] ?? (() => { throw new Error(`no tx ${id}`) })() }

  const nodes = await DS.walkNodeAncestors(provider, rep2.txId, 1, TX1)
  ok(nodes.length === 3, `★★★ root→self through a 3-deep lineage is 3 nodes (${nodes.length})`)
  ok(nodes[0]?.isGenesis === true && nodes[0]?.ownerPubKeyHex === toHex(holder.publicKey()), '★★ the root is the genesis copy, owned by the holder')
  ok(nodes[1]?.ownerPubKeyHex === toHex(b1.publicKey()) && nodes[1]?.isGenesis === false, '★ the upline is b1\'s copy')
  ok(nodes[2]?.ownerPubKeyHex === toHex(b2.publicKey()) && nodes[2]?.birthTxId === rep2.txId && nodes[2]?.birthVout === 1, '★ self is b2\'s copy, born at rep2 out[1]')

  const alone = await DS.walkNodeAncestors({ getSourceTransaction: async id => (id === genesis.txId ? genesis.tx : (() => { throw new Error('no tx') })()) }, genesis.txId, gVout, TX1)
  ok(alone.length === 1 && alone[0].isGenesis && alone[0].birthTxId === genesis.txId, '★ a genesis copy is its own only node')

  const corridor = await DS.resolveCorridor(provider, rep2.txId, 1, TX1)
  ok(corridor.length === 4 && corridor[0].isRoot && corridor[3].isSelf && corridor[3].ref === DS.nodeRef(TX1, rep2.txId, 1),
     '★★ the corridor is the collection root plus the three nodes, self last')
  const read = await DS.readCorridor({ ...provider, async getUnspentByScriptHash() { return [] } }, rep2.txId, 1, TX1, { rootDownstream: true })
  ok(read.nodes.length === 4 && read.posts.length === 0, '★ reading an empty corridor yields its nodes and no posts')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [discussion · byte-identical derivations and posts]`)
process.exit(fail === 0 ? 0 : 1)
