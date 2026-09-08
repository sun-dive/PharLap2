// © 2026 sun-dive.
/** BIP-39, against the specification's own vectors. */
import { toEntropy, fromEntropy, toSeed, isValid, words, nfkd } from '../impl/js/bip39.mjs'
import { toHex, fromHex, fromUtf8 } from '../impl/js/bytes.mjs'
import { sha256 } from '@noble/hashes/sha2.js'
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }
const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
ok(words().length === 2048, 'the wordlist is 2048 words')
// ★★★ THE PROVENANCE CLAIM, CHECKED RATHER THAN ASSERTED. The wordlist used to be a text file whose
//   bytes could be diffed against bitcoin/bips. It is now a module, so the check has to reconstruct
//   the file's exact form — one word per line, trailing newline — and hash it.
//   ⇒ Without this, "verified byte-identical to the official list" would be a claim in a document with
//     nothing behind it.
ok(toHex(sha256(fromUtf8(words().join('\n') + '\n')))
   === '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda',
   "★★★ the embedded wordlist reconstructs to BIP-39's official sha256")
// ⚠ BIP-39's own structural requirement: the first four letters must identify each word
ok(new Set(words().map(w => w.slice(0, 4))).size === 2048,
   '★ all 2048 four-letter prefixes are distinct — BIP-39 requires it, a corrupted list would fail')
ok(words().every((w, i) => i === 0 || w > words()[i - 1]), 'the list is in sorted order')
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
