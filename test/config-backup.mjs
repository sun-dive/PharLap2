// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The encrypted settings backup — a closed loop, and the two checks that make it yours.
 *
 * ★★★ THE LOOP IS THE TEST. `publishConfigBackup` writes a self-locked, self-encrypted record to a
 *   transaction; `resolveConfigBackup` has to find it on the address, recognise it as ours, decrypt it
 *   and parse it. A fake network captures the broadcast and serves it straight back, so the whole
 *   round trip runs offline with nothing stubbed in between.
 *
 * ⚠⚠ AND THE TWO REFUSALS ARE THE POINT. A backup is only ours if the record is locked to OUR key AND
 *   the envelope was sent by OUR key. Either check alone is insufficient: anyone can post a record to
 *   our address, and anyone can lock a record to our public key. Both are tested by forging each.
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { Script } from '../impl/js/script.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'cfg-'))
const out = join(tmp, 'configBackup.mjs')
await build({ entryPoints: [join(HERE, '..', 'src', 'configBackup.ts')], bundle: true, outfile: out,
              platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
const CB = await import(pathToFileURL(out).href)
// ★ the two collaborators, built the same way, so a forgery can be assembled exactly as an attacker would
for (const m of ['tokenCodec', 'messageCodec']) {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
}

const me = Signer.fromSeed(new Uint8Array(64).fill(11))
const other = Signer.fromSeed(new Uint8Array(64).fill(22))

/** a fake network that remembers what was broadcast and serves it back */
function net(owner) {
  const sent = []
  return {
    sent,
    async getUtxos() {
      return [{ txId: 'ab'.repeat(31) + '01', outputIndex: 0, satoshis: 100000, script: '' }]
    },
    async broadcast(hex) { sent.push(hex); return Tx.parse(hex).txid() },
    registerPendingTx() {},
    async getAddressHistory(addr) {
      return addr === owner ? sent.map(h => ({ txId: Tx.parse(h).txid(), blockHeight: 100 })) : []
    },
    async getRecentTxIdsForAddress() { return [] },
    async getSourceTransaction(txId) {
      const h = sent.find(x => Tx.parse(x).txid() === txId)
      if (h === undefined) throw new Error('not found')
      return Tx.parse(h)
    },
  }
}

const CFG = {
  alias: 'sundive', aliasAt: 1757000000000,
  contacts: { '02aa': 'Alice', '03bb': 'Bob' },
  contactsAt: { '02aa': 1757000000000, '03bb': 1757000001000 },
  prefs: { theme: 'dark' },
}

// ── ★★★ the closed loop ─────────────────────────────────────────────────────────────────────────────
{
  const p = net(me.address())
  const txId = await CB.publishConfigBackup(p, me, CFG, 1757000002000)
  ok(typeof txId === 'string' && txId.length === 64, `a backup is published (${txId.slice(0, 16)}…)`)
  ok(p.sent.length === 1, 'exactly one transaction was broadcast')

  const tx = Tx.parse(p.sent[0])
  ok(tx.outputs.length === 2, 'two outputs: the record and the change')
  ok(tx.outputs[0].value === 1, '★ the record output is 1 satoshi, never 0')
  ok(toHex(tx.outputs[1].script) === toHex(me.lockingScript()), 'the change comes back to us')
  ok(tx.outputs[1].value > 0 && tx.outputs[1].value < 100000, `and it is funded and paid a fee (${tx.outputs[1].value})`)

  // ⛔⛔ MUTATION TESTING FOUND THIS UNTESTED, and it is the whole point of the feature. Flipping the
  //   envelope to unencrypted published every contact name, alias and preference in CLEAR on a public
  //   chain, permanently, and every other assertion still passed. ⇒ The check that catches it is not
  //   "is a flag set" but "does my private data appear in the bytes that were broadcast".
  const raw = p.sent[0]
  const asBytes = Buffer.from(raw, 'hex').toString('latin1')
  const leaked = ['sundive', 'Alice', 'Bob', 'theme', 'dark', '"contacts"'].filter(w => asBytes.includes(w))
  ok(leaked.length === 0,
     `⛔★★ NONE of the settings appear in the broadcast bytes${leaked.length ? ': ' + leaked.join(', ') : ''}`)
  ok(asBytes.includes('BIE1'), '★ …and the record does carry an encrypted envelope, so it is not simply absent')

  const back = await CB.resolveConfigBackup(p, me)
  ok(back !== null, '★★★ and it reads back — found on our address, recognised, decrypted and parsed')
  ok(back.alias === CFG.alias, 'the alias survives')
  ok(back.contacts['02aa'] === 'Alice' && back.contacts['03bb'] === 'Bob', 'both contacts survive')
  ok(back.prefs?.theme === 'dark', 'preferences survive')
  ok(back.savedAt === 1757000002000, 'the saved-at timestamp survives exactly')
}

// ── ⛔ the two refusals ──────────────────────────────────────────────────────────────────────────────
{
  // ⚠ a record posted by SOMEONE ELSE, to their own key, sitting on a shared history. Not ours.
  const p = net(other.address())
  await CB.publishConfigBackup(p, other, CFG, 1757000002000)
  // ⇒ serve their transaction on OUR address, which is what an attacker would arrange
  const theirs = p.sent[0]
  const hostile = {
    ...net(me.address()),
    async getAddressHistory() { return [{ txId: Tx.parse(theirs).txid(), blockHeight: 100 }] },
    async getRecentTxIdsForAddress() { return [] },
    async getSourceTransaction() { return Tx.parse(theirs) },
  }
  const back = await CB.resolveConfigBackup(hostile, me)
  ok(back === null,
     '⛔★ a backup written by ANOTHER KEY is refused, even when served on our own address history')
}
// ── ⛔⛔ EACH CHECK ALONE, which is what the single hostile case above could not test ────────────────
// ⚠⚠⚠ MUTATION TESTING FOUND THIS. The case above uses a record that is BOTH locked to another key AND
//   sent by another key, so removing either check individually still rejects it and both mutations
//   survived. ⇒ To test a check you need input that ONLY that check refuses.
{
  const TC = await import(pathToFileURL(join(tmp, 'tokenCodec.mjs')).href)
  const MC = await import(pathToFileURL(join(tmp, 'messageCodec.mjs')).href)
  const myPub = toHex(me.publicKey())

  // ⚠ THE REALISTIC ATTACK: a public key is public, so anyone can lock a record to OURS and post it to
  //   our address. Only the SENDER check refuses it, and without that check we would load a stranger's
  //   settings - their contact names, their aliases - as if we had saved them ourselves.
  const forgedEnvelope = await MC.buildEnvelope({
    senderPriv: other, recipientPubKeyHex: myPub,
    parts: [{ kind: 'text', text: JSON.stringify({ schema: 1, contacts: { evil: 'Attacker' }, contactsAt: {}, savedAt: 9 }) }],
    encrypt: true,
  })
  const lockedToMe = TC.buildConfigScript(myPub, { envelope: forgedEnvelope })
  const t1 = new Tx(1, [{ txid: new Uint8Array(32).fill(9), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                       [{ value: 1, script: lockedToMe.toBinary() }], 0)
  const senderAttack = {
    ...net(me.address()),
    async getAddressHistory() { return [{ txId: t1.txid(), blockHeight: 100 }] },
    async getRecentTxIdsForAddress() { return [] },
    async getSourceTransaction() { return t1 },
  }
  ok(await CB.resolveConfigBackup(senderAttack, me) === null,
     '⛔★★ a record locked to OUR key but SENT BY ANOTHER is refused — the sender check alone stops it')

  // ⚠ and the mirror: our own envelope inside a record locked to someone else. Only the self-lock check
  //   refuses this one.
  const mineEnvelope = await MC.buildEnvelope({
    senderPriv: me, recipientPubKeyHex: myPub,
    parts: [{ kind: 'text', text: JSON.stringify({ schema: 1, contacts: { x: 'Y' }, contactsAt: {}, savedAt: 9 }) }],
    encrypt: true,
  })
  const lockedToThem = TC.buildConfigScript(toHex(other.publicKey()), { envelope: mineEnvelope })
  const t2 = new Tx(1, [{ txid: new Uint8Array(32).fill(8), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                       [{ value: 1, script: lockedToThem.toBinary() }], 0)
  const lockAttack = {
    ...net(me.address()),
    async getAddressHistory() { return [{ txId: t2.txid(), blockHeight: 100 }] },
    async getRecentTxIdsForAddress() { return [] },
    async getSourceTransaction() { return t2 },
  }
  ok(await CB.resolveConfigBackup(lockAttack, me) === null,
     '⛔★ a record locked to ANOTHER key but sent by us is refused — the self-lock check alone stops it')
}

// ── ⚠ the funding is actually signed ────────────────────────────────────────────────────────────────
// ⚠⚠ Also found by mutation testing: nothing verified the signatures, so removing the signing step
//   entirely produced a transaction that broadcast happily and would be refused by every node.
{
  const p = net(me.address())
  await CB.publishConfigBackup(p, me, CFG, 1757000002000)
  const tx = Tx.parse(p.sent[0])
  let verified = 0
  tx.inputs.forEach((inp, i) => {
    const sig = Script.fromBinary(inp.script).chunks[0]
    if (sig?.data !== undefined
        && Signer.verifyInput(tx, i, me.lockingScript(), 100000, me.publicKey(), sig.data)) verified++
  })
  ok(verified === tx.inputs.length && verified > 0,
     `★★ every funding input is SIGNED and verifies (${verified}/${tx.inputs.length})`)
}

{
  // ⚠ nothing at all on the address
  const empty = { ...net(me.address()), async getAddressHistory() { return [] }, async getRecentTxIdsForAddress() { return [] } }
  ok(await CB.resolveConfigBackup(empty, me) === null, 'an address with no history returns null, not an error')
}
{
  // ⚠ a transaction that cannot be fetched must be skipped, not fatal
  const flaky = {
    ...net(me.address()),
    async getAddressHistory() { return [{ txId: 'cd'.repeat(32), blockHeight: 100 }] },
    async getRecentTxIdsForAddress() { return [] },
    async getSourceTransaction() { throw new Error('gone') },
  }
  ok(await CB.resolveConfigBackup(flaky, me) === null, '⚠ an unfetchable transaction is skipped rather than throwing')
}

// ── ★★ newest-wins merging, which is pure and where the real logic lives ────────────────────────────
{
  const local = { alias: 'old', aliasAt: 100, contacts: { a: 'LocalA', b: 'LocalB' }, contactsAt: { a: 500, b: 100 } }
  const backup = { schema: 1, alias: 'new', aliasAt: 900, contacts: { a: 'BackupA', b: 'BackupB', c: 'BackupC' },
                   contactsAt: { a: 200, b: 800 }, savedAt: 700 }
  const m = CB.mergeConfig(local, backup)
  ok(m.contacts.a === 'LocalA', '⛔ a LOCAL label that is newer wins (500 > 200)')
  ok(m.contacts.b === 'BackupB', '★ a BACKUP label that is newer wins (800 > 100)')
  ok(m.contacts.c === 'BackupC', '★ a contact only in the backup is added')
  ok(m.alias === 'new' && m.aliasAt === 900, 'the newer alias wins')
  ok(m.changed === 2, `★ and it reports what the backup actually contributed (${m.changed})`)
}
{
  // ⚠ a contact present locally with NO timestamp: the backup should not silently overwrite a name
  //   the user typed. This is the case where "newest wins" has to decide with incomplete information.
  const m = CB.mergeConfig(
    { contacts: { a: 'Typed' }, contactsAt: {} },
    { schema: 1, contacts: { a: 'FromBackup' }, contactsAt: { a: 5 }, savedAt: 5 })
  ok(m.contacts.a === 'FromBackup',
     `⚠ an untimed local entry is treated as oldest, so the backup wins (got ${m.contacts.a})`)
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [config backup · a closed loop]`)
process.exit(fail === 0 ? 0 : 1)
