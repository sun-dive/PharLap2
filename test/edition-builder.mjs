// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Edition covenants — mint, replicate, transfer, burn.
 *
 * ★★★ THE COVENANT IS THE ONLY THING IN THIS WALLET THAT A MINER ENFORCES. Everything else is a rule we
 *   keep; this is a rule the network keeps for us. A transaction that spends one either satisfies the
 *   script exactly or is refused — there is no partial credit and no warning.
 *
 * ⚠⚠ SO THE CHECKS HERE ARE ABOUT BYTES AND ORDER, NOT ABOUT OUTCOMES. The covenant reconstructs its own
 *   successor from the preimage it is handed, and compares. ⇒ Getting an output's POSITION wrong, or its
 *   value, or feeding it a preimage of a slightly different transaction, all produce the same symptom: a
 *   transaction that is well-formed, broadcasts, and is rejected.
 *
 * ⛔ WHAT THIS FILE CANNOT DO is prove the scripts match what is already on chain. That needs vectors
 *   frozen from a real mainnet spend, and it is the check that must exist before anything is broadcast.
 *   Nothing here should be read as standing in for it.
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer, txidToWire } from '../impl/js/signer.mjs'
import { Tx, preimage } from '../impl/js/transaction.mjs'
import { Script, LockingScript } from '../impl/js/script.mjs'
import { toHex, fromHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'eb-'))
for (const m of ['editionBuilder', 'covenant']) {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
}
const EB = await import(pathToFileURL(join(tmp, 'editionBuilder.mjs')).href)
const CV = await import(pathToFileURL(join(tmp, 'covenant.mjs')).href)

const publisher = Signer.fromSeed(new Uint8Array(64).fill(61))
const holder = Signer.fromSeed(new Uint8Array(64).fill(62))
const buyer = Signer.fromSeed(new Uint8Array(64).fill(63))
const TX1 = 'a1'.repeat(31) + '02'
const bytesOf = k => Array.from(k.publicKey())

const TERMS = {
  publisherPubKeyHash: Array.from(publisher.hash160()),
  publisherFeeSats: 500,
  holderFeeSats: 1500,
  tokenSats: 1000,           // the refundable bond
}
const funding = sats => [{ utxo: { txId: 'bb'.repeat(31) + '01', outputIndex: 0, satoshis: sats, script: '' } }]

// ── ★★★ 1 · GENESIS: minting editions ───────────────────────────────────────────────────────────────
let editionLock
{
  const r = await EB.buildEditionGenesisTx({
    key: publisher, funding: funding(200000), tx1Ref: TX1, terms: TERMS,
    ownerPubKey: bytesOf(holder), mintCount: 3,
  })
  ok(r.tx.version === 2,
     '★★ the transaction is VERSION 2 — a covenant spend under version 1 is refused by consensus, not policy')
  ok(r.editionVouts.length === 3 && r.editionVouts.join(',') === '0,1,2', '★ three editions, at outputs 0-2')
  ok(r.tx.outputs.slice(0, 3).every(o => o.value === 1000), '★ each carries the 1000-sat refundable bond')
  ok(r.tx.outputs.length === 4, '…and the change output after them')

  editionLock = Array.from(r.tx.outputs[0].script)
  const parsed = CV.parseEditionScript(LockingScript.fromBinary(Uint8Array.from(editionLock)))
  ok(parsed !== null && parsed.ownerPubKeyHex === toHex(holder.publicKey()),
     '★★★ the minted covenant names the intended owner, read back out of the script')
  ok(parsed !== null && parsed.tx1RefHex === TX1, '★★ …and the collection it belongs to')
  ok(parsed !== null && parsed.terms.publisherFeeSats === 500 && parsed.terms.holderFeeSats === 1500,
     '★★★ …and the economics, recovered from the script body — no out-of-band data')

  // ⚠ the funding input must actually be signed, and for its own amount
  const sig = Script.fromBinary(r.tx.inputs[0].script).chunks[0]
  ok(sig?.data != null && Signer.verifyInput(r.tx, 0, publisher.lockingScript(), 200000, publisher.publicKey(), sig.data),
     '★★ the funding input is signed, and verifies for the amount it actually holds')

  // ⛔ a wrong-length collection reference must not become a script nobody can spend
  let threw = false
  try { await EB.buildEditionGenesisTx({ key: publisher, funding: funding(200000), tx1Ref: 'ab', terms: TERMS }) }
  catch { threw = true }
  ok(threw, '⛔ a tx1Ref that is not 32 bytes is refused rather than built into a dead script')
}

// ── ★★★ 2 · REPLICATE: the permissionless copy ──────────────────────────────────────────────────────
//
// ⚠⚠ THE OUTPUT ORDER IS THE COVENANT'S RULE, NOT OURS. It rebuilds out0..out3 from the preimage and
//   compares; a swapped pair or a wrong value is simply an invalid spend.
{
  const edition = { txId: 'cc'.repeat(31) + '03', outputIndex: 0, satoshis: 1000, lockBytes: editionLock }
  const r = await EB.buildReplicateTx({
    edition, terms: TERMS, buyerKey: buyer, funding: funding(50000), ownerPubKey: bytesOf(buyer),
  })

  ok(toHex(r.tx.outputs[0].script) === toHex(Uint8Array.from(editionLock)),
     '★★★ out0 returns the holder’s token VERBATIM — the same script, byte for byte')
  ok(r.tx.outputs[0].value === 1000 && r.tx.outputs[1].value === 1000,
     '★★ out0 and out1 both carry the bond forward — it is never spent, only moved')

  const replica = CV.parseEditionScript(LockingScript.fromBinary(r.tx.outputs[1].script))
  ok(replica !== null && replica.ownerPubKeyHex === toHex(buyer.publicKey()),
     '★★★ out1 is the same covenant with ONE field changed: the owner')
  ok(replica !== null && replica.tx1RefHex === TX1 && replica.terms.publisherFeeSats === 500,
     '★★ …everything else identical, so the buyer inherits the same rules')

  ok(r.tx.outputs[2].value === 500, '★ out2 pays the publisher their 500')
  ok(r.tx.outputs[3].value === 1500, '★ out3 pays the holder their 1500')
  ok(r.holderTokenVout === 0 && r.replicaVout === 1, 'the outpoints are reported back')

  // ★★★ THE PREIMAGE THE UNLOCK CARRIES MUST BE THIS TRANSACTION'S OWN.
  // ⚠ This is the check that a covenant spend lives or dies on, and it cannot be eyeballed: the unlock
  //   is built BEFORE the fee settles the change, then rebuilt after. If the rebuild were skipped, the
  //   preimage would commit to outputs that no longer exist.
  const unlockChunks = Script.fromBinary(r.tx.inputs[0].script).chunks
  const want = toHex(preimage(r.tx, 0, Uint8Array.from(editionLock), 1000, CV.EDITION_SCOPE))
  ok(unlockChunks.some(c => c.data != null && toHex(c.data) === want),
     '★★★ the unlock carries the preimage of the FINAL transaction — outputs, change and all')

  // ⚠ and the fee is real: everything in must equal everything out, plus the fee
  const inSats = 1000 + 50000
  const outSats = r.tx.outputs.reduce((a, o) => a + o.value, 0)
  const fee = inSats - outSats
  const size = r.tx.hex().length / 2
  ok(fee > 0, `★★ the transaction pays a fee (${fee} sats over ${size} bytes)`)
  ok(fee >= Math.ceil(size / 1000), `★ …at or above the relay floor — a shortfall never confirms and never says why`)
}

// ── ★★★ 3 · TRANSFER: owner-signed, and the breadcrumb ──────────────────────────────────────────────
{
  const edition = { txId: 'dd'.repeat(31) + '04', outputIndex: 0, satoshis: 1000, lockBytes: editionLock }
  const r = await EB.buildEditionTransferTx({
    edition, ownerKey: holder, newOwnerPubKey: bytesOf(buyer), funding: funding(50000),
  })
  const moved = CV.parseEditionScript(LockingScript.fromBinary(r.tx.outputs[0].script))
  ok(moved !== null && moved.ownerPubKeyHex === toHex(buyer.publicKey()), '★★★ the token moves to the new owner')
  ok(r.tx.outputs[0].value === 1000, '★ with the bond preserved')

  // ⚠⚠ THE 1-SATOSHI BREADCRUMB IS NOT OPTIONAL IN PRACTICE. The covenant output is not indexed by
  //   address, so without this the recipient has no way to LEARN that they were sent anything.
  ok(r.tx.outputs[1].value === 1,
     '★★★ a 1-satoshi output goes to the new owner’s address — the only way they can discover the gift')
  ok(toHex(r.tx.outputs[1].script) === toHex(buyer.lockingScript()),
     '…and it really is their address, not the sender’s')

  // ★★ TWO PREIMAGES OF THE SAME TRANSACTION, UNDER DIFFERENT SCOPES. One the covenant introspects, one
  //   the owner signs. Using either in place of the other produces a plausible, invalid spend.
  const chunks = Script.fromBinary(r.tx.inputs[0].script).chunks
  const introspection = toHex(preimage(r.tx, 0, Uint8Array.from(editionLock), 1000, CV.EDITION_SCOPE))
  ok(chunks.some(c => c.data != null && toHex(c.data) === introspection),
     '★★★ the unlock carries the covenant’s introspection preimage')
  const sigChunk = chunks.find(c => c.data != null && c.data.length >= 70 && c.data.length <= 73)
  ok(sigChunk != null && Signer.verifyInput(r.tx, 0, Uint8Array.from(editionLock), 1000, holder.publicKey(), sigChunk.data),
     '★★★ …and an owner signature that verifies against THIS transaction, under SIGHASH_ALL')
}

// ── ★★ 4 · BURN: reclaiming the bond ────────────────────────────────────────────────────────────────
{
  const edition = { txId: 'ee'.repeat(31) + '05', outputIndex: 0, satoshis: 1000, lockBytes: editionLock }
  const r = await EB.buildEditionBurnTx({ edition, ownerKey: holder })
  ok(r.tx.outputs.length === 1, '★ a burn has exactly one output: the bond coming back')
  ok(r.reclaimSats > 0 && r.reclaimSats < 1000,
     `★★★ the owner reclaims the bond MINUS the fee (${r.reclaimSats} of 1000) — funded by the bond itself`)
  ok(toHex(r.tx.outputs[0].script) === toHex(holder.lockingScript()), '★ and it returns to the owner')
  const chunks = Script.fromBinary(r.tx.inputs[0].script).chunks
  const sigChunk = chunks.find(c => c.data != null && c.data.length >= 70 && c.data.length <= 73)
  ok(sigChunk != null && Signer.verifyInput(r.tx, 0, Uint8Array.from(editionLock), 1000, holder.publicKey(), sigChunk.data),
     '★★ the burn is owner-signed — nobody else can destroy your token')
}

// ── ★★★ 5 · THE INVARIANT THE FEE RESTS ON ──────────────────────────────────────────────────────────
// ⚠⚠⚠ A covenant unlock contains the preimage of the transaction it is part of, which commits to the
//   outputs, one of which is the change the fee decides. ⇒ The unlock must be measured before the fee
//   and rebuilt after, which is only sound because the LENGTH cannot move. `assertStableLength` checks
//   that on every build; this proves the check is live rather than decorative.
{
  const edition = { txId: 'ff'.repeat(31) + '06', outputIndex: 0, satoshis: 1000, lockBytes: editionLock }
  const sizes = new Set()
  for (const sats of [20000, 50000, 123456, 999999]) {
    const r = await EB.buildReplicateTx({ edition, terms: TERMS, buyerKey: buyer, funding: funding(sats), ownerPubKey: bytesOf(buyer) })
    sizes.add(r.tx.inputs[0].script.length)
  }
  ok(sizes.size === 1,
     `★★★ the covenant unlock is the SAME LENGTH whatever the change comes to (${[...sizes].join(', ')}) — which is why the fee can be computed before it exists`)

  /* ⚠⚠ AND FOR THE SIGNED UNLOCKS THE LENGTH IS *NOT* FIXED — a DER signature is 70, 71 or 72 bytes
     depending on whether r or s needs a leading zero. ⇒ They are sized against a 73-byte maximum, so the
     estimate is never short and can only over-pay by a byte or two.
     ★ THE OBSERVABLE PROPERTY IS THE FEE, so that is what is asserted, over a spread of amounts rather
       than one: a fee below the relay floor produces a transaction that is well-formed, broadcasts, and
       simply never confirms. */
  let short = 0, sigLens = new Set()
  for (const sats of [20000, 33333, 50000, 123456, 777777, 999999]) {
    for (const r of [
      await EB.buildEditionTransferTx({ edition, ownerKey: holder, newOwnerPubKey: bytesOf(buyer), funding: funding(sats) }),
      await EB.buildReplicateTx({ edition, terms: TERMS, buyerKey: buyer, funding: funding(sats), ownerPubKey: bytesOf(buyer) }),
    ]) {
      const paid = (1000 + sats) - r.tx.outputs.reduce((a, o) => a + o.value, 0)
      if (paid < Math.ceil(r.tx.hex().length / 2 / 1000)) short++
      const sig = Script.fromBinary(r.tx.inputs[0].script).chunks.find(c => c.data != null && c.data.length >= 70 && c.data.length <= 73)
      if (sig) sigLens.add(sig.data.length)
    }
  }
  ok(short === 0, `★★★ over 12 transactions, none pays less than the relay floor (${short} short)`)
  ok(sigLens.size > 1,
     `★★ …and the signature really does vary in length across them (${[...sigLens].sort().join(', ')} bytes) — so the fixed estimate is doing real work`)
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [edition covenants · mint, replicate, transfer, burn]`)
process.exit(fail === 0 ? 0 : 1)
