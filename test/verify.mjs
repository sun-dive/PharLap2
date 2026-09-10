// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Token verification — what makes an output a member of its collection.
 *
 * ★★ THE CLAIM IS NARROW AND WORTH STATING: this checks genesis plus the immediate parent, not a full
 *   lineage walk. A token is a member if its TX1 really contains a template, and its parent is either a
 *   same-collection token (a transfer) or not a token at all (a genesis mint).
 *
 * ⚠⚠ EVERY REFUSAL HERE IS A CASE WHERE SOMETHING PLAUSIBLE IS PRESENTED AS GENUINE. A token pointing at
 *   a transaction that has no template. A provider returning a different transaction from the one asked
 *   for. A parent from another collection. None of those look wrong; they have to be checked.
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer, txidToWire } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'vf-'))
for (const m of ['verify', 'tokenCodec']) {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
}
const V = await import(pathToFileURL(join(tmp, 'verify.mjs')).href)
const TC = await import(pathToFileURL(join(tmp, 'tokenCodec.mjs')).href)

const owner = Signer.fromSeed(new Uint8Array(64).fill(41))
const pub = toHex(owner.publicKey())
const TEMPLATE = { tokenName: 'A Collection', tokenRules: '0003000000000001', covenantScript: '' }

/** a transaction with the given outputs, funded from a stated parent outpoint */
const mkTx = (scripts, parentTxid) => new Tx(1,
  [{ txid: txidToWire(parentTxid), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
  scripts.map(s => ({ value: 1, script: s.toBinary() })), 0)

// ⚠ A REAL parent that is NOT a token: an ordinary payment output. It has to EXIST, because the
//   verifier treats an unfetchable parent as fatal rather than assuming it was not a token - which is
//   the right way round, since "I could not look" must never become "there was nothing there".
const funder = new Tx(1,
  [{ txid: txidToWire('ff'.repeat(31) + '01'), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
  [{ value: 5000, script: owner.lockingScript() }], 0)
const NOT_A_TOKEN = funder.txid()

const tx1 = mkTx([TC.buildTemplateScript(pub, TEMPLATE)], NOT_A_TOKEN)
const COLLECTION = tx1.txid()
const tokenTx = mkTx([TC.buildTokenScript(pub, { tx1Ref: COLLECTION, stateData: '' })], NOT_A_TOKEN)

/** dependencies that serve a fixed set of transactions by id */
const deps = (txs, extra = {}) => ({
  async getRawTransaction(id) {
    const t = txs.find(x => x.txid() === id)
    if (t === undefined) throw new Error(`no transaction ${id}`)
    return t
  },
  ...extra,
})

// ── ★★★ a genesis mint verifies ─────────────────────────────────────────────────────────────────────
// ⚠ The collection comes FROM the token - `tx1Ref` inside its own script - not from the caller. So the
//   question is never "is this in the collection I named", it is "does the collection this token claims
//   actually exist, with a template in it".
{
  const r = await V.verifyTokenLineage(tokenTx, 0, deps([funder, tx1, tokenTx]))
  ok(r.valid === true, `★★★ a token whose claimed TX1 carries a template is valid (${r.reason})`)
  ok(r.isGenesis === true, '★ …and is a genesis mint, its parent not being a token')
  ok(r.collectionId === COLLECTION, 'the collection is reported back, read from the token itself')
}

// ── ★★ a transfer, whose parent IS a same-collection token ──────────────────────────────────────────
{
  const child = mkTx([TC.buildTokenScript(pub, { tx1Ref: COLLECTION, stateData: '' })], tokenTx.txid())
  const r = await V.verifyTokenLineage(child, 0, deps([funder, tx1, tokenTx, child]))
  ok(r.valid === true, `★★ a token whose parent is a same-collection token is valid (${r.reason})`)
  ok(r.isGenesis === false, '…and is not reported as a genesis')
}

// ── ⛔ the refusals ──────────────────────────────────────────────────────────────────────────────────
{
  // ⚠ the claimed TX1 exists but carries NO template: the collection anchor is not there
  const bogus = mkTx([TC.buildTokenScript(pub, { tx1Ref: COLLECTION, stateData: '' })], NOT_A_TOKEN)
  const tok = mkTx([TC.buildTokenScript(pub, { tx1Ref: bogus.txid(), stateData: '' })], NOT_A_TOKEN)
  const r = await V.verifyTokenLineage(tok, 0, deps([funder, bogus, tok]))
  ok(r.valid === false, '⛔ a token claiming a TX1 with NO template is refused')
  ok(typeof r.reason === 'string' && r.reason.length > 0, `…with a stated reason (${r.reason})`)
}
{
  // ⚠⚠ THE PROVIDER RETURNS A DIFFERENT TRANSACTION THAN ASKED FOR. It is not obliged to be honest, and
  //   the only thing that catches it is recomputing the id from the bytes that came back.
  const r = await V.verifyTokenLineage(tokenTx, 0, { async getRawTransaction() { return tokenTx } })
  ok(r.valid === false, '⛔★ a provider returning the WRONG transaction is caught')
  ok(/mismatch|not|id/i.test(String(r.reason)), `…because the id is recomputed, not trusted (${r.reason})`)
}
{
  const r = await V.verifyTokenLineage(tx1, 0, deps([funder, tx1]))
  ok(r.valid === false && /not a/i.test(r.reason), `⛔ an output that is not a token is refused (${r.reason})`)
}
{
  const r = await V.verifyTokenLineage(tokenTx, 0, { async getRawTransaction() { throw new Error('offline') } })
  ok(r.valid === false, '⛔ an unfetchable TX1 is refused rather than assumed good')
  ok(!/^ok$/i.test(String(r.reason)), `…and the reason says why (${String(r.reason).slice(0, 40)})`)
}
{
  const r = await V.verifyTokenLineage(tokenTx, 9, deps([funder, tx1, tokenTx]))
  ok(r.valid === false, '⛔ an output index that does not exist is refused, not treated as absent-and-fine')
}

// ── ★★ the merkle proof, and what "unconfirmed" does and does not mean ──────────────────────────────
//
// ⚠⚠⚠ THE TWO CHECKS PROVE DIFFERENT THINGS, AND NEITHER IS THE LESSER ONE. Calling the second state
//   "unconfirmed" invites a proof-of-work reading imported from a chain this is not.
//
//   | the LINEAGE check, already done above | VALIDITY. The claimed TX1 exists and carries a template;
//     the immediate parent is a same-collection token or is not a token at all. That is ancestry, and
//     it is verified BY US, from the transactions themselves.                                        |
//   | the MERKLE proof                      | INCLUSION. A miner accepted this and put work behind it.
//     It says nothing about the inputs; it is someone ELSE's verification, corroborated.              |
//
// ★★ AND THE MEMPOOL IS NOT THE POORER CASE. For a transaction that is not yet mined you can obtain the
//   whole ancestry - every parent, and merkle proofs where those parents are already confirmed - and
//   check the lot yourself. For a mined transaction you are handed an inclusion proof and nothing about
//   its inputs. There is MORE available about a transaction in the mempool, not less.
//
// ★★★ AND DEPTH ONE IS SUFFICIENT BY DESIGN. These tokens are held by a miner-enforced covenant that
//   reconstructs its own successor, so consensus enforced the structure at every spend and a miner
//   checked it. Establishing that the parent is a same-collection token establishes the covenant ran.
//   ⇒ Walking the whole history back to genesis is what a token needs when NOTHING enforces its rules
//     at spend time - work that grows with every transfer and that every client repeats. That is not
//     the rigorous version of this; it is the version required when there is no covenant.
{
  const tracker = v => ({ async isValidRootForHeight() { return v }, async currentHeight() { return 900000 } })
  const proof = { async verify(_t, ct) { return ct.isValidRootForHeight('', 0) } }

  const good = await V.verifyTokenLineage(tokenTx, 0,
    deps([funder, tx1, tokenTx], { getProof: async () => proof, chainTracker: tracker(true) }))
  ok(good.valid === true && good.unconfirmed !== true, `★ a token whose proof verifies is valid and confirmed`)

  const bad = await V.verifyTokenLineage(tokenTx, 0,
    deps([funder, tx1, tokenTx], { getProof: async () => proof, chainTracker: tracker(false) }))
  ok(bad.valid === false || bad.unconfirmed === true,
     `⛔★ a proof that does NOT verify is not quietly accepted as confirmed (valid=${bad.valid}, unconfirmed=${bad.unconfirmed})`)

  const none = await V.verifyTokenLineage(tokenTx, 0,
    deps([funder, tx1, tokenTx], { getProof: async () => null, chainTracker: tracker(true) }))
  ok(none.valid === true,
     '★★ an unmined token is VALID — its lineage was checked, which is the part that proves the coins exist')
  ok(none.unconfirmed === true,
     '★ …and is marked unconfirmed, meaning no miner has included it yet, not that it is unverified')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [verify · membership, and what is refused]`)
process.exit(fail === 0 ? 0 : 1)
