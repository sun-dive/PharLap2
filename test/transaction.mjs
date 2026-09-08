// © 2026 sun-dive.
/** BIP-143's own worked examples — parse, preimage AND sighash, byte for byte.
 *  ★ Each case starts from the BIP's raw unsigned transaction, so a parse bug cannot hide behind a
 *    correct sighash, or the reverse. */
import { Tx, preimage, sighash, readVarint, varint, SIGHASH } from '../impl/js/transaction.mjs'
import { toHex, fromHex } from '../impl/js/bytes.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// ⚠ NOT IN THE REPOSITORY — vectors are local. ⇒ SKIP loudly rather than pass silently.
let V = null
try { V = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'bip143-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [BIP-143 · vectors not present locally]')
  process.exit(0)
}
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

for (const v of V.vectors) {
  const tx = Tx.parse(v.unsignedTx)
  ok(tx.hex() === v.unsignedTx, `${v.name} — the raw tx round-trips`)
  // ⚠ BIP-143 prints scriptCode WITH its varint prefix; prepending another double-prefixes it.
  const raw = fromHex(v.scriptCodeWithLen)
  const [, o] = readVarint(raw, 0)
  const sc = raw.subarray(o)
  ok(toHex(preimage(tx, v.inputIndex, sc, v.amount, v.sighashType)) === v.preimage, `${v.name} — PREIMAGE`)
  ok(toHex(sighash(tx, v.inputIndex, sc, v.amount, v.sighashType)) === v.sighash, `${v.name} — sighash`)
}
// ⚠ varint boundaries no BIP vector reaches, and the exact recovered length — at 256 bytes a
//   big-endian length misread as little-endian gives the SAME bytes, so a round trip alone passes.
for (const n of [0xfc, 0xfd, 0xffff, 0x10000]) {
  const t = new Tx(1, [{ txid: new Uint8Array(32).fill(3), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                      [{ value: 1, script: new Uint8Array(n).fill(0x51) }], 0)
  ok(Tx.parse(t.hex()).outputs[0].script.length === n, `a ${n}-byte script round-trips`)
}
const big = new Tx(1, [{ txid: new Uint8Array(32).fill(4), vout: 0, script: new Uint8Array(0), sequence: 0xffffffff }],
                      [{ value: 2 ** 32, script: Uint8Array.of(0x51) }], 0)
ok(Tx.parse(big.hex()).outputs[0].value === 2 ** 32, '⚠ an amount of exactly 2^32 survives — a 4-byte write loses it')
// ★ txid orientation, and hex() actually returning hex
ok(/^[0-9a-f]{64}$/.test(Tx.parse(V.vectors[1].unsignedTx).txid()),
   "★ txid() returns 64 hex characters — not Uint8Array's comma-separated decimals")
ok(/^[0-9a-f]+$/.test(Tx.parse(V.vectors[1].unsignedTx).hex()), '★ hex() likewise')
let threw = false
try { Tx.parse(V.vectors[0].unsignedTx + 'ff') } catch { threw = true }
ok(threw, '⛔ trailing bytes are refused')
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [BIP-143 · the BIP's own vectors]`)
process.exit(fail === 0 ? 0 : 1)
