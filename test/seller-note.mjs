// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Seller notes — the seller's mutable listing text, and what "mutable" actually means here.
 *
 * ★★★ THE CENTRAL CLAIM IS ABOUT THE RESOLVER, NOT THE CHAIN. A seller can "overwrite" their note, but
 *   nothing is ever removed: every note they have published is still on chain, and the newest simply
 *   wins the scan. ⇒ That is worth a test rather than a comment, because a wallet that says "edit" while
 *   the previous text remains publicly readable is making a promise it cannot keep.
 *
 * ⚠⚠ AND THE ORDERING IS THE WHOLE MECHANISM. "Newest" here means unconfirmed first, then descending
 *   block height. Get that backwards and the storefront shows a buyer a note the seller replaced months
 *   ago, with nothing anywhere reporting an error.
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { Script } from '../impl/js/script.mjs'
import { toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'sn-'))
for (const m of ['sellerNote', 'bytes']) {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
}
const SN = await import(pathToFileURL(join(tmp, 'sellerNote.mjs')).href)
const BY = await import(pathToFileURL(join(tmp, 'bytes.mjs')).href)

const seller = Signer.fromSeed(new Uint8Array(64).fill(51))
const COLLECTION = 'ee'.repeat(31) + '07'

/**
 * ⚠ HEIGHTS ARE PART OF THE FIXTURE, not decoration. Each publish is given a height one higher than the
 *   last so "newest" is a real question the resolver has to answer, and `height:0` models the mempool.
 */
function net(owner, { unconfirmed = new Set() } = {}) {
  const sent = []
  let nextHeight = 800000
  return {
    sent,
    heights: new Map(),
    async getUtxos() { return [{ txId: 'cd'.repeat(31) + '01', outputIndex: 0, satoshis: 200000, script: '' }] },
    async broadcast(hex) {
      const id = Tx.parse(hex).txid()
      sent.push(hex)
      this.heights.set(id, unconfirmed.has(sent.length - 1) ? 0 : nextHeight++)
      return id
    },
    registerPendingTx() {},
    async getAddressHistory(a) {
      if (a !== owner) return []
      return sent.map(h => Tx.parse(h).txid()).filter(id => this.heights.get(id) !== 0)
        .map(id => ({ txId: id, blockHeight: this.heights.get(id) }))
    },
    async getRecentTxIdsForAddress(a) {
      if (a !== owner) return []
      return sent.map(h => Tx.parse(h).txid()).filter(id => this.heights.get(id) === 0)
    },
    async getSourceTransaction(id) {
      const h = sent.find(x => Tx.parse(x).txid() === id)
      if (h === undefined) throw new Error('not found')
      return Tx.parse(h)
    },
  }
}

const NOTE = { text: 'Signed first pressing. Includes the lyric sheet.', heading: 'First pressing', tags: ['vinyl', 'signed'] }

// ── ★★★ the closed loop ─────────────────────────────────────────────────────────────────────────────
{
  const p = net(seller.address())
  const txId = await SN.publishSellerNote(p, seller, COLLECTION, NOTE)
  ok(typeof txId === 'string' && txId.length === 64, `a note is published (${txId.slice(0, 14)}…)`)

  const tx = Tx.parse(p.sent[0])
  ok(tx.outputs.length === 2, 'the note and the change')
  ok(tx.outputs[0].value === 1, '★ the note output is 1 satoshi')
  ok(toHex(tx.outputs[1].script) === toHex(seller.lockingScript()), 'change returns to the seller')

  let verified = 0
  tx.inputs.forEach((inp, i) => {
    const sig = Script.fromBinary(inp.script).chunks[0]
    if (sig?.data && Signer.verifyInput(tx, i, seller.lockingScript(), 200000, seller.publicKey(), sig.data)) verified++
  })
  ok(verified === tx.inputs.length && verified > 0, `★★ every input verifies (${verified}/${tx.inputs.length})`)

  const got = await SN.resolveSellerNote(p, toHex(seller.publicKey()), COLLECTION)
  ok(got !== null, '★★★ and it reads back')
  ok(got.text === NOTE.text, 'the description survives')
  ok(got.heading === NOTE.heading, 'the heading survives')
  ok(JSON.stringify(got.tags) === JSON.stringify(NOTE.tags), 'the tags survive')
  ok(got.txId === txId, 'and it reports which transaction it came from')
}

// ── ★★★ "overwriting" a note, and what it does NOT do ───────────────────────────────────────────────
{
  const p = net(seller.address())
  await SN.publishSellerNote(p, seller, COLLECTION, { text: 'FIRST VERSION, later corrected' })
  await SN.publishSellerNote(p, seller, COLLECTION, { text: 'SECOND VERSION' })
  const got = await SN.resolveSellerNote(p, toHex(seller.publicKey()), COLLECTION)
  ok(got.text === 'SECOND VERSION', '★★★ the newest note wins the scan')

  // ⚠⚠ AND THE FIRST ONE IS STILL THERE, IN THE CLEAR. This is the test that stops the UI from calling
  //   this an edit: a buyer who looks at the seller's address reads both.
  const older = Buffer.from(p.sent[0], 'hex').toString('latin1')
  ok(older.includes('FIRST VERSION, later corrected'),
     '⚠⚠ …and the replaced note is STILL ON CHAIN, readable — "overwrite" is the resolver, not deletion')
  ok(p.sent.length === 2, '…because publishing a correction adds a transaction, it never removes one')
}

// ── ★★ the ordering, which is the whole mechanism ───────────────────────────────────────────────────
{
  // ⚠ the third publish is left UNCONFIRMED, and must still rank above two mined ones
  const p = net(seller.address(), { unconfirmed: new Set([2]) })
  await SN.publishSellerNote(p, seller, COLLECTION, { text: 'mined, older' })
  await SN.publishSellerNote(p, seller, COLLECTION, { text: 'mined, newer' })
  await SN.publishSellerNote(p, seller, COLLECTION, { text: 'still in the mempool' })
  const got = await SN.resolveSellerNote(p, toHex(seller.publicKey()), COLLECTION)
  ok(got.text === 'still in the mempool',
     '★★ an UNCONFIRMED note outranks mined ones — a seller sees their own edit immediately')

  const q = net(seller.address())
  await SN.publishSellerNote(q, seller, COLLECTION, { text: 'lower height' })
  await SN.publishSellerNote(q, seller, COLLECTION, { text: 'higher height' })
  ok((await SN.resolveSellerNote(q, toHex(seller.publicKey()), COLLECTION)).text === 'higher height',
     '★★ and among mined notes the HIGHER block height wins')
}

// ── ★ a note that rode in on someone else's transaction ─────────────────────────────────────────────
{
  const p = net(seller.address())
  await SN.publishSellerNote(p, seller, COLLECTION, NOTE)
  const tx = Tx.parse(p.sent[0])
  const read = SN.readNoteFromTx(tx, COLLECTION)
  ok(read !== null && read.text === NOTE.text, '★ a note is readable straight off a transaction')
  ok(SN.readNoteFromTx(tx, 'aa'.repeat(32)) === null, '⛔ …but not when the collection does not match')
}

// ── ⛔ what is refused ───────────────────────────────────────────────────────────────────────────────
{
  const p = net(seller.address())
  const refuses = async (note, why) => {
    let msg = ''
    try { await SN.publishSellerNote(p, seller, COLLECTION, note) } catch (e) { msg = String(e.message) }
    ok(msg !== '', `⛔ ${why} (${msg.slice(0, 44)})`)
  }
  await refuses({ text: '   ' }, 'an empty note is refused')
  await refuses({ text: 'x'.repeat(SN.MAX_NOTE_BYTES + 1) }, 'a note over the cap is refused')
  await refuses({ text: 'ok', heading: 'h'.repeat(200) }, 'an oversized heading is refused')
  await refuses({ text: 'ok', tags: Array.from({ length: 40 }, (_, i) => `tag${i}`) }, 'oversized tags are refused')
  ok(SN.MAX_NOTE_BYTES === 3072, `★ the cap is ${SN.MAX_NOTE_BYTES} bytes, as deployed`)

  // ⚠ a note with NO text but a heading is valid — the emptiness check is about the whole record
  ok(typeof (await SN.publishSellerNote(p, seller, COLLECTION, { text: '', heading: 'Just a heading' })) === 'string',
     '★ a note with only a heading is accepted — "empty" means the whole record, not the description')
  ok(SN.noteHasContent({ text: '', tags: ['x'] }) === true, '★ …and noteHasContent agrees')
  ok(SN.noteHasContent({ text: '  ' }) === false, '⛔ …while whitespace alone is not content')
}

// ── ⛔ the wrong collection, and the wrong seller ────────────────────────────────────────────────────
{
  const p = net(seller.address())
  await SN.publishSellerNote(p, seller, COLLECTION, NOTE)
  ok(await SN.resolveSellerNote(p, toHex(seller.publicKey()), 'bb'.repeat(32)) === null,
     '⛔ a note keyed to another collection is not returned')
  const stranger = Signer.fromSeed(new Uint8Array(64).fill(52))
  ok(await SN.resolveSellerNote(p, toHex(stranger.publicKey()), COLLECTION) === null,
     '⛔ and scanning a different seller finds nothing')
}

// ── ⚠⚠ the deployed inconsistency, pinned rather than fixed ──────────────────────────────────────────
// The ADDRESS is derived from a NORMALISED key, so an uncompressed one finds the right place to look.
// The RECORDS are then matched by RAW HEX, so that same uncompressed key matches nothing. ⇒ An
// uncompressed caller scans exactly the right address and comes back empty, with no error anywhere.
// ⛔ Not corrected here: normalising the comparison would change which records the application considers
//   its own, and this port's rule is that behaviour changes are decisions, not tidy-ups.
{
  const c = toHex(seller.publicKey(true)), u = toHex(seller.publicKey(false))
  ok(BY.addressFromPubHex(u) === seller.address(),
     '★★ an UNCOMPRESSED key gives the seller’s own address, because it is normalised first')
  const p = net(seller.address())
  await SN.publishSellerNote(p, seller, COLLECTION, NOTE)
  ok(await SN.resolveSellerNote(p, c, COLLECTION) !== null, 'a compressed key finds the note')
  ok(await SN.resolveSellerNote(p, u, COLLECTION) === null,
     '⚠⚠ …and an UNCOMPRESSED one finds the right address but matches no record — deployed behaviour, pinned')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [seller notes · newest wins, and nothing is deleted]`)
process.exit(fail === 0 ? 0 : 1)
