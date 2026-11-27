// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { sha256, sha512 } from '../../vendor/noble-hashes/sha2.js'
import { pbkdf2 } from '../../vendor/noble-hashes/pbkdf2.js'
import { WORDLIST_ENGLISH } from './data/wordlist-english.mjs'
import { fromUtf8 } from './bytes.mjs'

let WORDS = null
export function words() {
  if (WORDS) return WORDS
  WORDS = WORDLIST_ENGLISH
  if (WORDS.length !== 2048) throw new Error('wordlist must be exactly 2048 words')
  return WORDS
}

const VALID_BITS = [128, 160, 192, 224, 256]
const bits = buf => [...buf].map(b => b.toString(2).padStart(8, '0')).join('')

export function nfkd(s, what = 'text') {
  if (/^[\x20-\x7e]*$/.test(s)) return s
  const folded = [...s].map(ch => {
    const cp = ch.codePointAt(0)
    if (cp >= 0xff01 && cp <= 0xff5e) return String.fromCharCode(cp - 0xff01 + 0x21)
    if (cp === 0x3000 || cp === 0x00a0) return ' '
    return ch
  }).join('')
  if (/^[\x20-\x7e]*$/.test(folded)) return folded
  const n = folded.normalize('NFKD')
  if (/^[\x20-\x7e]*$/.test(n)) return n
  return n
}

export function fromEntropy(entropy) {
  const n = entropy.length * 8
  if (!VALID_BITS.includes(n)) throw new Error(`entropy must be 16,20,24,28 or 32 bytes; got ${entropy.length}`)
  const bin = bits(entropy) + bits(sha256(entropy)).slice(0, n / 32)
  const w = words()
  return (bin.match(/.{11}/g) || []).map(c => w[parseInt(c, 2)]).join(' ')
}

export function toEntropy(mnemonic) {
  const parts = nfkd(mnemonic, 'mnemonic').trim().split(/\s+/u).filter(Boolean)
  if (![12, 15, 18, 21, 24].includes(parts.length))
    throw new Error(`a mnemonic is 12,15,18,21 or 24 words; got ${parts.length}`)
  const w = words(), index = new Map(w.map((x, i) => [x, i]))
  let bin = ''
  for (const p of parts) {
    const i = index.get(p.toLowerCase())
    if (i === undefined) throw new Error(`not a BIP-39 word: "${p}"`)
    bin += i.toString(2).padStart(11, '0')
  }
  const entBits = Math.floor(parts.length * 11 * 32 / 33)
  const entropy = Uint8Array.from((bin.slice(0, entBits).match(/.{8}/g) || []).map(b => parseInt(b, 2)))
  const want = bits(sha256(entropy)).slice(0, parts.length * 11 - entBits)
  if (bin.slice(entBits) !== want)
    throw new Error('checksum does not match — a word is wrong or in the wrong place')
  return entropy
}

export const isValid = m => { try { toEntropy(m); return true } catch { return false } }

export function toSeed(mnemonic, passphrase = '') {
  return pbkdf2(sha512, fromUtf8(nfkd(mnemonic, 'mnemonic')),
                fromUtf8('mnemonic' + nfkd(passphrase, 'passphrase')), { c: 2048, dkLen: 64 })
}

