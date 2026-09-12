// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * The edition mint, end to end through a fake network — graded on the one thing that failed live.
 *
 * ⚠ 12 Sept 2026: a mint with a 200 KB back cover selected ONE coin and then asked for a 25,684 sat fee,
 *   because the funding estimate counted the file and the front cover and not the back cover, which rides
 *   in the same transaction. The wallet held enough; the estimate did not ask for it. The coins here are the
 *   test wallet's real set at the time.
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { Signer } from '../impl/js/signer.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { toHex } from '../impl/js/bytes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'emint-'))
const load = async m => {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
  return import(pathToFileURL(join(tmp, `${m}.mjs`)).href)
}
const EB = await load('editionBuilder')
const TC = await load('tokenCodec')
const CV = await load('covenant')

const publisher = Signer.fromSeed(new Uint8Array(64).fill(81))
const coins = [17000, 8000, 4568, 2998, 1000, 952, 98, 98, 21].map((sats, i) => ({ txId: 'c0'.repeat(31) + i.toString(16).padStart(2, '0'), outputIndex: 0, satoshis: sats, script: '' }))

function net() {
  const sent = [], byId = new Map()
  return {
    sent,
    getAddress() { return publisher.address() },
    async getUtxos() { return coins },
    async getSourceTransaction(id) { const t = byId.get(id); if (!t) throw new Error(`no tx ${id}`); return t },
    async broadcast(hex) { const t = Tx.parse(hex); sent.push(t); byId.set(t.txid(), t); return t.txid() },
    registerPendingTx() {},
  }
}
const terms = { publisherPubKeyHash: Array.from(publisher.hash160()), publisherFeeSats: 1, holderFeeSats: 1, tokenSats: 1 }
const bytes = (n, seed) => Array.from({ length: n }, (_, i) => (i * seed + 7) & 0xff)

// ── ★★★ 1 · a mint whose back cover is the heaviest thing in it ─────────────────────────────────────
{
  const p = net()
  let r = null, threw = ''
  try {
    r = await EB.createEdition(p, publisher, {
      tokenName: 'Phar Lap 2 test mint', terms, mintCount: 1, description: 'a small file, a small cover, a large back cover',
      file: { mimeType: 'text/plain', fileName: 'hello.txt', bytes: bytes(112, 3) },
      cover: { mimeType: 'image/webp', fileName: 'cover.webp', bytes: bytes(1000, 5) },
      backCover: { mimeType: 'image/webp', fileName: 'back.webp', bytes: bytes(200_000, 11) },
    })
  } catch (e) { threw = String(e.message) }
  ok(threw === '' && r !== null, `★★★ the mint builds and broadcasts with a 200 KB back cover${threw ? ' — THREW: ' + threw : ''}`)
  ok(p.sent.length === 2, `★ two transactions went out (${p.sent.length})`)
  if (p.sent.length === 2) {
    const [t1, t2] = p.sent
    const inSats = t1.inputs.reduce((a, i) => a + coins.find(c => c.txId === toHex(Uint8Array.from(i.txid).reverse()))?.satoshis ?? 0, 0)
    const outSats = t1.outputs.reduce((a, o) => a + o.value, 0)
    ok(inSats > outSats && (inSats - outSats) >= Math.ceil(t1.serialize().length * 101 / 1000) - 1,
       `★★★ TX1 is funded: ${inSats.toLocaleString()} sat in, ${outSats.toLocaleString()} out, ${(inSats - outSats).toLocaleString()} fee for ${t1.serialize().length.toLocaleString()} bytes`)
    ok(t1.inputs.length >= 2, `★ …which took more than one coin (${t1.inputs.length}), as it must from this set`)
    const sf = t1.outputs.map(o => TC.parseStorefrontScript(LockingScript.fromBinary(o.script))).find(Boolean)
    ok(sf !== undefined && sf.fields.backCoverBytes?.length === 200_000, '★★ the back cover is in TX1\'s storefront record, all 200,000 bytes')
    const ed = t2.outputs.map(o => CV.parseEditionScript(LockingScript.fromBinary(o.script))).find(Boolean)
    ok(ed !== undefined && ed.tx1RefHex === t1.txid(), '★★ TX2 mints an edition that names TX1 as its collection')
    ok(r.collectionId === t1.txid() && r.editions.length === 1, '★ the result reports the collection id and the one edition')
  }
}

// ── ★ 2 · and a mint with no back cover still goes through on the same coins ────────────────────────
{
  const p = net()
  let threw = ''
  try { await EB.createEdition(p, publisher, { tokenName: 'plain', terms, mintCount: 1, file: { mimeType: 'text/plain', fileName: 'a.txt', bytes: bytes(112, 3) } }) } catch (e) { threw = String(e.message) }
  ok(threw === '' && p.sent.length === 2, `★ a plain mint still builds (${threw || 'ok'})`)
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [edition mint · funded for everything TX1 carries]`)
process.exit(fail === 0 ? 0 : 1)
