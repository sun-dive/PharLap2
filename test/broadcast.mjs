// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Publisher announcements — a closed loop, and the address derivation that decides whether anyone
 * ever finds them.
 *
 * ★★ A broadcast is PUBLIC by design: one flat-cost transaction reaches every holder, who pull it by
 *   scanning the publisher's address. So the two things that matter are that a published announcement
 *   comes back, and that the address a holder scans is the one the publisher actually posted to.
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

const tmp = mkdtempSync(join(tmpdir(), 'bc-'))
for (const m of ['broadcast', 'bytes']) {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
}
const B = await import(pathToFileURL(join(tmp, 'broadcast.mjs')).href)
const BY = await import(pathToFileURL(join(tmp, 'bytes.mjs')).href)

const pub = Signer.fromSeed(new Uint8Array(64).fill(31))
const COLLECTION = 'cc'.repeat(31) + '05'

function net(owner) {
  const sent = []
  return {
    sent,
    async getUtxos() { return [{ txId: 'ab'.repeat(31) + '01', outputIndex: 0, satoshis: 100000, script: '' }] },
    async broadcast(hex) { sent.push(hex); return Tx.parse(hex).txid() },
    registerPendingTx() {},
    async getAddressHistory(a) { return a === owner ? sent.map(h => ({ txId: Tx.parse(h).txid(), blockHeight: 100 })) : [] },
    async getRecentTxIdsForAddress() { return [] },
    async getSourceTransaction(id) {
      const h = sent.find(x => Tx.parse(x).txid() === id)
      if (h === undefined) throw new Error('not found')
      return Tx.parse(h)
    },
  }
}

// ── ★★★ the closed loop ─────────────────────────────────────────────────────────────────────────────
{
  const p = net(pub.address())
  const txId = await B.publishBroadcast(p, pub, COLLECTION, 'New edition available today', 'sundive')
  ok(typeof txId === 'string' && txId.length === 64, `an announcement is published (${txId.slice(0, 14)}…)`)

  const tx = Tx.parse(p.sent[0])
  ok(tx.outputs.length === 2, 'the record and the change')
  ok(tx.outputs[0].value === 1, '★ the record output is 1 satoshi')
  ok(toHex(tx.outputs[1].script) === toHex(pub.lockingScript()), 'change returns to the publisher')

  // ⚠ every input is signed, and against its own amount
  let verified = 0
  tx.inputs.forEach((inp, i) => {
    const sig = Script.fromBinary(inp.script).chunks[0]
    if (sig?.data && Signer.verifyInput(tx, i, pub.lockingScript(), 100000, pub.publicKey(), sig.data)) verified++
  })
  ok(verified === tx.inputs.length && verified > 0, `★★ every input verifies (${verified}/${tx.inputs.length})`)

  const list = await B.resolveBroadcasts(p, toHex(pub.publicKey()), COLLECTION)
  ok(Array.isArray(list) && list.length === 1, `★★★ and it reads back (${list.length} announcement)`)
  ok(list[0].text === 'New edition available today', 'the text survives')
}

// ── ⚠⚠ THREE DIFFERENT THINGS ARE CALLED "ENCRYPTED" IN THIS WALLET, and they are not equivalent ────
//
//   | a private MESSAGE   | REAL two-party encryption. Only the recipient's private key opens it, and
//     the MAC binds both parties. Nothing published makes it readable.                                |
//   | encrypted CONTENT   | ⚠ AES-GCM, but the content key is wrapped with a key derived from a salt
//     that is PUBLIC and stored in the template. Anyone can re-derive it. ⇒ Obfuscation, deliberately:
//     the wallet tells the user "an inconvenience, not DRM", twice.                                   |
//   | a BROADCAST         | not encrypted at all, and cannot be: one message cannot be encrypted to
//     every current holder at once, and the holder set changes as editions are transferred.           |
//
// ⇒ The point of this test is that the third is genuinely plaintext, so nobody reading a codebase full
//   of encryption assumes an announcement is private. Saying "the others are encrypted" would itself
//   mislead, because only the first of them is private in the sense a reader would expect.
{
  const p = net(pub.address())
  await B.publishBroadcast(p, pub, COLLECTION, 'READABLE BY ANYONE', 'sundive')
  const asBytes = Buffer.from(p.sent[0], 'hex').toString('latin1')
  ok(asBytes.includes('READABLE BY ANYONE'), '★★ an announcement is in the CLEAR on chain, readable by anyone')
  ok(!asBytes.includes('BIE1'), '…and carries no encrypted envelope, which would only imply a privacy it lacks')
}

// ── ★★★ the address a holder scans ──────────────────────────────────────────────────────────────────
// ⚠⚠ THE FAILURE HERE IS SILENT. Deriving the address from an uncompressed key without normalising
//   gives a different, perfectly valid address; a holder scans it, finds nothing, and concludes the
//   publisher has posted no announcements. Nothing errors.
{
  const c = toHex(pub.publicKey(true)), u = toHex(pub.publicKey(false))
  ok(BY.addressFromPubHex(c) === pub.address(), 'a compressed key gives the publisher’s own address')
  ok(BY.addressFromPubHex(u) === pub.address(),
     '★★★ …and so does the UNCOMPRESSED form, because it is normalised first')
  let threw = false
  try { BY.addressFromPubHex('00'.repeat(33)) } catch { threw = true }
  ok(threw, '⛔ a key that is not a curve point is refused rather than hashed anyway')

  // ⚠⚠⚠ AND HERE IS AN INCONSISTENCY IN THE DEPLOYED BEHAVIOUR, PRESERVED RATHER THAN FIXED.
  //   The ADDRESS is derived from a normalised key, so an uncompressed one finds the right address.
  //   The RECORDS are then matched by raw hex string, so that same uncompressed key matches nothing.
  //   ⇒ An uncompressed caller therefore scans exactly the right place and comes back empty.
  //   ⛔ Not corrected here. Normalising the comparison too would CHANGE which records the application
  //     considers its own, and this port's rule is that behaviour changes are decisions, not tidy-ups.
  //     In practice every public key in this application comes from a compressed serialisation, so the
  //     path is unreached - which is exactly why it has survived unnoticed.
  const p = net(pub.address())
  await B.publishBroadcast(p, pub, COLLECTION, 'from either form', 'sundive')
  ok((await B.resolveBroadcasts(p, c, COLLECTION)).length === 1, 'a compressed key finds the announcement')
  ok((await B.resolveBroadcasts(p, u, COLLECTION)).length === 0,
     '⚠⚠ …and an UNCOMPRESSED one finds the right address but matches no record — deployed behaviour, pinned')
}

// ── ⛔ the wrong collection, and the wrong publisher ─────────────────────────────────────────────────
{
  const p = net(pub.address())
  await B.publishBroadcast(p, pub, COLLECTION, 'for one collection only', 'sundive')
  ok((await B.resolveBroadcasts(p, toHex(pub.publicKey()), 'dd'.repeat(32))).length === 0,
     '⛔ an announcement keyed to another collection is not returned')
  const stranger = Signer.fromSeed(new Uint8Array(64).fill(32))
  ok((await B.resolveBroadcasts(p, toHex(stranger.publicKey()), COLLECTION)).length === 0,
     '⛔ and scanning a different publisher finds nothing')
}

// ── ⚠ the size cap ──────────────────────────────────────────────────────────────────────────────────
{
  ok(B.MAX_BROADCAST_BYTES === 480, `★ announcements are capped at ${B.MAX_BROADCAST_BYTES} bytes, so one stays cheap`)
  const p = net(pub.address())
  let msg = ''
  try { await B.publishBroadcast(p, pub, COLLECTION, 'x'.repeat(B.MAX_BROADCAST_BYTES + 200), 'sundive') }
  catch (e) { msg = String(e.message) }
  ok(msg !== '', `⛔ an oversized announcement is refused (${msg.slice(0, 48)})`)
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [broadcast · published, found, and public by design]`)
process.exit(fail === 0 ? 0 : 1)
