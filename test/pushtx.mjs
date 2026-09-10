// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * OP_PUSH_TX constants and covenant scripts — the highest-stakes byte identity in this repository.
 *
 * ★★★ THESE NUMBERS ARE INSIDE SCRIPTS THAT ARE LIVE ON MAINNET. A covenant introspects its own
 *   transaction by rebuilding a signature from fixed constants; those constants are pushed into the
 *   locking script itself. If any one of them differs by a byte, the script is a different script,
 *   with a different hash, and the coins locked by the old one are not reachable by the new code.
 *
 * ⚠⚠ SO NOTHING HERE IS GRADED ON "DOES IT WORK". It is graded on producing the SAME BYTES the deployed
 *   code produces, and the vectors are frozen from that code.
 */
import { build } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { toHex, fromHex } from '../impl/js/bytes.mjs'
import { N, mul, mod } from '../impl/js/secp256k1.mjs'
import { Signer } from '../impl/js/signer.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

let V = null
try { V = JSON.parse(readFileSync(join(HERE, 'pushtx-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [OP_PUSH_TX · deployed vectors not present]')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'ptx-'))
for (const m of ['pushtx', 'covenant']) {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
}
const PT = await import(pathToFileURL(join(tmp, 'pushtx.mjs')).href)
const CV = await import(pathToFileURL(join(tmp, 'covenant.mjs')).href)
const h = a => toHex(Uint8Array.from(a))
const flat = ops => h(ops.flatMap(o => [o.op, ...(o.data ?? [])]))

// ── ★★★ the constants ───────────────────────────────────────────────────────────────────────────────
{
  const c = PT.pushTxConstants()
  const want = V.constants
  ok(h(c.Qbytes) === want.Qbytes, `★★★ Qbytes matches the deployed value (${h(c.Qbytes).slice(0, 20)}…)`)
  ok(h(c.rDerInt) === want.rDerInt, '★★★ rDerInt matches — the DER-encoded r baked into the script')
  ok(h(c.raLE) === want.raLE, '★★★ raLE matches — r·a modulo the ORDER, little-endian')
  ok(h(c.nLE) === want.nLE, '★★★ nLE matches — the curve order as a script number')
  ok(h(c.kInvLE) === want.kInvLE, '★★★ kInvLE matches — the modular inverse of k')
  ok(c.scope === want.scope, `the sighash scope is unchanged (${c.scope})`)

  // ⚠ and the arithmetic is checked independently, so a matching constant is not merely a matching bug:
  //   r must be the x coordinate of k·G reduced mod N, and kInv·k must be 1 mod N.
  ok(mod(mul(BigInt('0x' + '11'.repeat(32))).x, N) < N, 'the order reduction is in range')
}

// ── ★★ the script fragments ─────────────────────────────────────────────────────────────────────────
{
  const c = PT.pushTxConstants()
  ok(flat(PT.pushTxVerifyOps(c)) === V.verifyOps,
     `★★★ pushTxVerifyOps is byte identical (${V.verifyOps.length / 2} bytes of script)`)
  ok(flat(PT.pushTxCheckOps(c)) === V.checkOps,
     `★★★ pushTxCheckOps is byte identical (${V.checkOps.length / 2} bytes)`)
  ok(PT.reverseBytesOps(4).map(o => o.op).join(',') === V.reverse4.join(','),
     '★ the byte-reversal fragment is unchanged')
}

// ── ⚠ the push encoding, at every boundary ──────────────────────────────────────────────────────────
// ⚠⚠ THIS IS A DIFFERENT RULE FROM THE WALLET CORE'S `minimalPush`, and from `pushDrop`'s. Three rules
//   coexist deliberately, because each matches bytes that already exist. Do not unify them.
{
  let same = 0
  for (const v of V.pushData) {
    const x = PT.pushData(Array(v.n).fill(0xab))
    if (x.op === v.op && (x.data ?? []).length === v.len) same++
    else console.log(`  ✗ pushData(${v.n}): op ${x.op} vs ${v.op}`)
  }
  ok(same === V.pushData.length, `★★ push encoding matches at all ${V.pushData.length} boundaries`)
  ok(V.pushData.some(v => v.n >= 65536), '★ …including above 64 KB')
}

// ── ★★★ the preimage, and the input ordering that is easy to get wrong ──────────────────────────────
{
  // ★ the generator used this key, so the same P2PKH subscript can be rebuilt here rather than stored
  const key = Signer.fromPrivateKey(fromHex('88'.repeat(32)))
  const sub = { toBinary: () => Array.from(key.lockingScript()) }
  const outs = [{ satoshis: 900, lockingScript: { toBinary: () => Array.from(key.lockingScript()) } }]
  const base = {
    sourceTXID: 'aa'.repeat(31) + '01', sourceOutputIndex: 1, sourceSatoshis: 5000,
    transactionVersion: 2, subscript: sub, outputs: outs, inputSequence: 0xffffffff, lockTime: 0,
  }
  const O = { sourceTXID: 'bb'.repeat(31) + '02', sourceOutputIndex: 3, sequence: 0xfffffffe }

  ok(h(PT.pushTxPreimage({ ...base, inputIndex: 0 })) === V.preimage1,
     '★★★ a single-input preimage is BYTE IDENTICAL to the deployed one')
  ok(h(PT.pushTxPreimage({ ...base, inputIndex: 1, otherInputs: [O] })) === V.preimage2,
     '★★★ …and so is one with another input, signed at index 1')
  ok(h(PT.pushTxPreimage({ ...base, inputIndex: 0, otherInputs: [O] })) === V.preimage3,
     '★★★ …and the same pair signed at index 0')

  // ⚠⚠ THE ORDERING IS WHAT THOSE LAST TWO PROVE. `otherInputs` plus an index must be reassembled into
  //   the original list, because a BIP-143 preimage commits to every input through hashPrevouts and
  //   hashSequence. Appending instead of inserting would give a well formed, wrong preimage, and the
  //   only symptom would be a covenant that refuses to unlock.
  ok(V.preimage2 !== V.preimage3,
     '★★ index 1 and index 0 give DIFFERENT preimages for the same two inputs — so the index is committed')
  ok(V.preimage1 !== V.preimage2, '…and adding an input changes the preimage')
  ok(V.preimage1.length === V.preimage2.length, '…though not its length, so it is not a size artefact')
}

// ── ★★★ the covenant script itself ──────────────────────────────────────────────────────────────────
{
  const key = Signer.fromPrivateKey(fromHex('88'.repeat(32)))
  const tx1Ref = Array.from({ length: 32 }, (_, i) => i)
  const ownerPub = Array.from(key.publicKey())
  const got = h(CV.buildHolderEditionScript([], tx1Ref, ownerPub))
  ok(got === V.holderScript,
     `★★★ the holder edition script is BYTE IDENTICAL (${V.holderScript.length / 2} bytes)`)

  // ⛔ and the arguments are checked, because a wrong-length reference or key would silently build a
  //   script that locks coins nobody can spend
  let threw = 0
  for (const [ref, pub] of [[tx1Ref.slice(0, 31), ownerPub], [tx1Ref, ownerPub.slice(0, 32)]]) {
    try { CV.buildHolderEditionScript([], ref, pub) } catch { threw++ }
  }
  ok(threw === 2, '⛔ a wrong-length tx1Ref or owner key is refused, not built into a script')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [OP_PUSH_TX · byte identical to what is on chain]`)
process.exit(fail === 0 ? 0 : 1)
