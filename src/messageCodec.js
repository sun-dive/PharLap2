// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { encrypt as eciesEncrypt, decrypt as eciesDecrypt } from '../impl/js/ecies.mjs'
import { hexBytes, hexOf, utf8Bytes, utf8Of } from './bytes.js'

const hexBytesU8 = (hex) => Uint8Array.from(hexBytes(hex))
import { compressIfSmaller, decompress } from './compress.js'

export const ENVELOPE_VERSION = 0x01
const FLAG_ENCRYPTED = 0x01
const FLAG_COMPRESSED = 0x02

export const PART_TEXT = 0x01
export const PART_KEY = 0x02
export const PART_FILE_INLINE = 0x03
export const PART_FILE_REF = 0x04
export const PART_ALIAS = 0x05
export const PART_TIME = 0x06

function encodeTimeMs(ms) {
  const out = []
  let v = Math.max(0, Math.floor(ms))
  for (let i = 0; i < 6; i++) { out.push(v & 0xff); v = Math.floor(v / 256) }
  return out
}
function decodeTimeMs(b) {
  let n = 0
  for (let i = b.length - 1; i >= 0; i--) n = n * 256 + b[i]
  return n
}

function writeVarInt(n) {
  if (n < 0xfd) return [n]
  if (n <= 0xffff) return [0xfd, n & 0xff, (n >> 8) & 0xff]
  if (n <= 0xffffffff) return [0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
  throw new Error('writeVarInt: value too large')
}
function readVarInt(b, off) {
  const first = b[off]
  if (first < 0xfd) return [first, off + 1]
  if (first === 0xfd) return [b[off + 1] | (b[off + 2] << 8), off + 3]
  if (first === 0xfe) return [b[off + 1] | (b[off + 2] << 8) | (b[off + 3] << 16) | (b[off + 4] << 24), off + 5]
  throw new Error('readVarInt: 64-bit lengths unsupported')
}
function lenPrefixed(bytes) { return [...writeVarInt(bytes.length), ...bytes] }

function encodePartValue(p) {
  switch (p.kind) {
    case 'text': return { type: PART_TEXT, value: utf8Bytes(p.text) }
    case 'key': return { type: PART_KEY, value: [...p.key] }
    case 'file': return {
      type: PART_FILE_INLINE,
      value: [...lenPrefixed(utf8Bytes(p.mimeType)), ...lenPrefixed(utf8Bytes(p.fileName)), ...p.bytes],
    }
    case 'fileRef': {
      if (p.sha256.length !== 32) throw new Error('fileRef sha256 must be 32 bytes')
      return { type: PART_FILE_REF, value: [...p.sha256, ...utf8Bytes(p.uri)] }
    }
    case 'alias': return { type: PART_ALIAS, value: utf8Bytes(p.alias) }
    case 'time': return { type: PART_TIME, value: encodeTimeMs(p.ms) }
  }
}

export function encodeParts(parts) {
  const out = []
  for (const p of parts) {
    const { type, value } = encodePartValue(p)
    out.push(type, ...lenPrefixed(value))
  }
  return out
}

export function decodeParts(bytes) {
  const parts = []
  let off = 0
  try {
    while (off < bytes.length) {
      const type = bytes[off++]
      let len
      ;[len, off] = readVarInt(bytes, off)
      const value = bytes.slice(off, off + len)
      if (value.length !== len) return null
      off += len
      switch (type) {
        case PART_TEXT: parts.push({ kind: 'text', text: utf8Of(value) }); break
        case PART_KEY: parts.push({ kind: 'key', key: value }); break
        case PART_FILE_INLINE: {
          let o = 0, mlen = 0, nlen = 0
          ;[mlen, o] = readVarInt(value, o); const mime = value.slice(o, o + mlen); o += mlen
          ;[nlen, o] = readVarInt(value, o); const name = value.slice(o, o + nlen); o += nlen
          parts.push({ kind: 'file', mimeType: utf8Of(mime), fileName: utf8Of(name), bytes: value.slice(o) })
          break
        }
        case PART_FILE_REF:
          parts.push({ kind: 'fileRef', sha256: value.slice(0, 32), uri: utf8Of(value.slice(32)) })
          break
        case PART_ALIAS: parts.push({ kind: 'alias', alias: utf8Of(value) }); break
        case PART_TIME: parts.push({ kind: 'time', ms: decodeTimeMs(value) }); break
        default: return null
      }
    }
  } catch { return null }
  return parts
}

export async function buildEnvelope(opts) {
  const encrypt = opts.encrypt ?? true
  const senderPub = Array.from(opts.senderPriv.publicKey(true))
  if (senderPub.length !== 33) throw new Error('senderPub must be 33 bytes')

  const sentAt = opts.sentAt != null && opts.sentAt > 0 ? opts.sentAt : Date.now()
  const meta = [{ kind: 'time', ms: sentAt }]
  if (opts.senderAlias != null && opts.senderAlias !== '') meta.push({ kind: 'alias', alias: opts.senderAlias })
  const allParts = [...meta, ...opts.parts]

  let payload = encodeParts(allParts)
  let flags = 0
  const c = await compressIfSmaller(payload)
  if (c.compressed) { payload = c.bytes; flags |= FLAG_COMPRESSED }
  const body = encrypt
    ? Array.from(await eciesEncrypt(Uint8Array.from(payload), hexBytesU8(opts.recipientPubKeyHex), opts.senderPriv.d))
    : payload
  if (encrypt) flags |= FLAG_ENCRYPTED
  return [ENVELOPE_VERSION, flags, ...senderPub, ...body]
}

function splitMeta(parts) {
  const aliasPart = parts.find(p => p.kind === 'alias')
  const timePart = parts.find(p => p.kind === 'time')
  return {
    senderAlias: aliasPart != null && aliasPart.kind === 'alias' ? aliasPart.alias : undefined,
    sentAt: timePart != null && timePart.kind === 'time' ? timePart.ms : undefined,
    parts: parts.filter(p => p.kind !== 'alias' && p.kind !== 'time'),
  }
}

export async function openEnvelope(envelope, recipientPriv) {
  if (envelope.length < 35) return null
  if (envelope[0] !== ENVELOPE_VERSION) return null
  const encrypted = (envelope[1] & FLAG_ENCRYPTED) !== 0
  const compressed = (envelope[1] & FLAG_COMPRESSED) !== 0
  const senderPub = envelope.slice(2, 35)
  const senderPubKeyHex = hexOf(senderPub)
  const body = envelope.slice(35)
  let tlv
  if (encrypted) {
    try {
      tlv = Array.from(await eciesDecrypt(Uint8Array.from(body), recipientPriv.d, hexBytesU8(senderPubKeyHex)))
    } catch { return null }
  } else {
    tlv = body
  }
  if (compressed) { try { tlv = await decompress(tlv) } catch { return null } }
  const decoded = decodeParts(tlv)
  if (decoded == null) return null
  const { senderAlias, sentAt, parts } = splitMeta(decoded)
  return { senderPubKeyHex, encrypted, parts, senderAlias, sentAt }
}

export async function openPublicEnvelope(envelope) {
  if (envelope.length < 35 || envelope[0] !== ENVELOPE_VERSION) return null
  if ((envelope[1] & FLAG_ENCRYPTED) !== 0) return null
  const senderPubKeyHex = hexOf(envelope.slice(2, 35))
  let tlv = envelope.slice(35)
  if ((envelope[1] & FLAG_COMPRESSED) !== 0) { try { tlv = await decompress(tlv) } catch { return null } }
  const decoded = decodeParts(tlv)
  if (decoded == null) return null
  const { senderAlias, sentAt, parts } = splitMeta(decoded)
  return { senderPubKeyHex, encrypted: false, parts, senderAlias, sentAt }
}
