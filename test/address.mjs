// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/** WIF and addresses, against the frozen live-wallet vectors. */
import { wifEncode, wifDecode, b58decode, p2pkhAddress, p2pkhScript } from '../impl/js/address.mjs'
import { publicKey } from '../impl/js/ecdsa.mjs'
import { toHex, fromHex, equals } from '../impl/js/bytes.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// ⚠ NOT IN THE REPOSITORY — vectors are local. ⇒ SKIP loudly rather than pass silently.
let V = null
try { V = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'bsv-compat-vectors.json'), 'utf8')) } catch {}
if (V === null) {
  console.log('⚪  SKIPPED  [addresses and WIF · vectors not present locally]')
  process.exit(0)
}
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }
for (const v of V.vectors) {
  const d = wifDecode(v.wif)
  ok(d !== null, `WIF decodes: ${v.wif.slice(0, 10)}…`)
  ok(d && d.compressed === true, 'compression flag survives the round trip')
  ok(d && wifEncode(d.key, d.compressed) === v.wif, '★ WIF re-encodes byte for byte')
  ok(d && toHex(publicKey(BigInt('0x' + toHex(d.key)))) === v.pub, 'derives the reference public key')
  ok(d && p2pkhAddress(publicKey(BigInt('0x' + toHex(d.key)))) === v.address, `★★ address matches: ${v.address}`)
}
// ⚠ the checksum check reads the LAST FOUR BYTES — Buffer allowed subarray(-4), Uint8Array does not
const good = V.vectors[0].address
ok(b58decode(good) !== null, 'a valid address decodes')
ok(b58decode(good.slice(0, -1) + 'x') === null, '⛔ a mutated checksum is refused — the negative-index read was a Buffer-ism')
ok(b58decode('not-base58') === null, 'garbage is refused')
ok(toHex(p2pkhScript(new Uint8Array(20).fill(7))) === '76a914' + '07'.repeat(20) + '88ac', 'P2PKH script shape')
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [addresses and WIF]`)
process.exit(fail === 0 ? 0 : 1)
