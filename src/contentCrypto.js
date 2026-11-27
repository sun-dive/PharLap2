// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { sha256Bytes, randomBytes, hexOf, utf8Bytes } from './bytes.js'

const AES = 'AES-GCM'
const IV_BYTES = 32

const importKey = (K, use) =>
  crypto.subtle.importKey('raw', Uint8Array.from(K), AES, false, [use])

async function gcmEncrypt (K, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await importKey(K, 'encrypt')
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: AES, iv }, key, Uint8Array.from(plain)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv, 0); out.set(ct, iv.length)
  return Array.from(out)
}

async function gcmDecrypt (K, packed) {
  const b = Uint8Array.from(packed)
  if (b.length < IV_BYTES + 16) throw new Error('ciphertext too short to hold an IV and a tag')
  const key = await importKey(K, 'decrypt')
  const pt = await crypto.subtle.decrypt({ name: AES, iv: b.subarray(0, IV_BYTES) }, key, b.subarray(IV_BYTES))
  return Array.from(new Uint8Array(pt))
}

const OBFUSCATION_SALT = utf8Bytes('PHARLAP/tier1/content-key/v1')

export function newContentKey() {
  return randomBytes(32)
}

export function newKeySalt() {
  return randomBytes(16)
}

export async function encryptContent(fileBytes, K) {
  return await gcmEncrypt(K, fileBytes)
}

export async function decryptContent(ciphertext, K) {
  return await gcmDecrypt(K, ciphertext)
}

function obfuscationKey(keySalt) {
  return sha256Bytes([...OBFUSCATION_SALT, ...keySalt])
}

export async function wrapContentKey(K, keySalt) {
  return await gcmEncrypt(obfuscationKey(keySalt), K)
}

export async function unwrapContentKey(wrappedK, keySalt) {
  try {
    return await gcmDecrypt(obfuscationKey(keySalt), wrappedK)
  } catch {
    return null
  }
}

export function contentHash(ciphertext) {
  return hexOf(sha256Bytes(ciphertext))
}
