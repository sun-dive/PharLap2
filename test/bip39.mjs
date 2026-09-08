// © 2026 sun-dive.
/** BIP-39, against the specification's own vectors. */
import { toEntropy, fromEntropy, toSeed, isValid, words, nfkd } from '../impl/js/bip39.mjs'
import { toHex, fromHex } from '../impl/js/bytes.mjs'
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }
const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
ok(words().length === 2048, 'the wordlist is 2048 words')
ok(toHex(toEntropy(M)) === '00'.repeat(16), 'mnemonic → entropy')
ok(fromEntropy(fromHex('00'.repeat(16))) === M, 'entropy → mnemonic')
// ★ the published BIP-39 seed for this mnemonic with passphrase TREZOR
ok(toHex(toSeed(M, 'TREZOR')).startsWith('c55257c360c07c72029aebc1b53c05ed'), '★ seed matches the BIP-39 vector')
ok(toHex(toSeed(M)) !== toHex(toSeed(M, 'TREZOR')), '⚠ a passphrase gives an entirely different wallet')
// ★★★ THE CHECKSUM EARNS THE WHOLE FORMAT: two transposed words are caught, where hex could not be
const w = M.split(' '); [w[0], w[1]] = [w[1], w[0]]
ok(!isValid(w.join(' ')) || w[0] === w[1], '★★ transposed words are rejected by the checksum')
ok(!isValid('abandon abandon abandon'), 'a wrong word count is rejected')
ok(!isValid(M.replace('about', 'zoo')), 'a wrong last word fails the checksum')
// ⚠ the full-width fold — a CJK input method produces visually identical, unusable words
const full = M.split(' ').map(x => [...x].map(ch => String.fromCharCode(ch.charCodeAt(0) - 0x21 + 0xff01)).join('')).join('　')
ok(isValid(full), '⚠ a full-width mnemonic is accepted — NFKD folds it')
ok(toHex(toSeed(full)) === toHex(toSeed(M)), '★★ …and yields the SAME seed, so a CJK keyboard cannot lose a wallet')
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [BIP-39]`)
process.exit(fail === 0 ? 0 : 1)
