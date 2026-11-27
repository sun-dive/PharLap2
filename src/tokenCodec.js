// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { hexBytes, hexOf, utf8Of } from './bytes.js'
import { lock as pushDropLock, decode as pushDropDecode } from './pushDrop.js'

export const P_PREFIX = [0x50]
export const P_VERSION = 0x03

export const RECORD_TEMPLATE = 0x01
export const RECORD_TOKEN = 0x02
export const RECORD_FILE = 0x03
export const RECORD_MESSAGE = 0x04
export const RECORD_STOREFRONT = 0x06
export const RECORD_NOTE = 0x07
export const RECORD_PROFILE = 0x08
export const RECORD_CONFIG = 0x09
export const RECORD_PREVIEW = 0x0A
export const RECORD_MOCKUP = 0x0B

export const RESTRICTION_FUNGIBLE = 0x0001
export const RESTRICTION_REPLICABLE = 0x0002
export const RESTRICTION_TRACK_TRANSFERS = 0x0004
export const RESTRICTION_ENCRYPTED = 0x0008
export const RESTRICTION_COMPRESSED = 0x0010

function hexToBytes(hex) {
  return hex.length === 0 ? [] : hexBytes(hex)
}
function bytesToHex(bytes) {
  return hexOf(bytes)
}
function utf8ToBytes(s) {
  return Array.from(new TextEncoder().encode(s))
}
function bytesToUtf8(bytes) {
  return new TextDecoder().decode(new Uint8Array(bytes))
}

function isEmptyOrZero(bytes) {
  return bytes.length === 0 || (bytes.length === 1 && bytes[0] === 0)
}

export function classifyRecord(script) {
  const d = pushDropDecode(script)
  if (d == null || d.fields.length < 3) return null
  const prefix = d.fields[0]
  const version = d.fields[1]
  const recordType = d.fields[2]
  if (prefix.length !== 1 || prefix[0] !== P_PREFIX[0]) return null
  if (version.length !== 1 || version[0] !== P_VERSION) return null
  if (recordType.length !== 1) return null
  return recordType[0]
}

export function encodeTokenFields(data) {
  return [
    P_PREFIX,
    [P_VERSION],
    [RECORD_TOKEN],
    hexToBytes(data.tx1Ref),
    hexToBytes(data.stateData),
  ]
}

export function decodeTokenFields(fields) {
  if (fields.length < 5) return null
  if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null
  if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null
  if (fields[2].length !== 1 || fields[2][0] !== RECORD_TOKEN) return null
  if (fields[3].length !== 32) return null
  return {
    tx1Ref: bytesToHex(fields[3]),
    stateData: bytesToHex(fields[4]),
  }
}

export function buildTokenScript(ownerPubKeyHex, data) {
  return pushDropLock(ownerPubKeyHex, encodeTokenFields(data))
}

export function parseTokenScript(
  script,
) {
  const d = pushDropDecode(script)
  if (d == null) return null
  const fields = decodeTokenFields(d.fields)
  if (fields == null) return null
  return { ownerPubKeyHex: d.pubKeyHex, fields }
}

export function encodeMessageFields(data) {
  return [
    P_PREFIX,
    [P_VERSION],
    [RECORD_MESSAGE],
    hexToBytes(data.ref),
    data.envelope,
  ]
}

export function decodeMessageFields(fields) {
  if (fields.length < 5) return null
  if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null
  if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null
  if (fields[2].length !== 1 || fields[2][0] !== RECORD_MESSAGE) return null
  if (fields[3].length !== 32) return null
  return {
    ref: bytesToHex(fields[3]),
    envelope: fields[4],
  }
}

export function buildMessageScript(recipientPubKeyHex, data) {
  return pushDropLock(recipientPubKeyHex, encodeMessageFields(data))
}

export function parseMessageScript(
  script,
) {
  const d = pushDropDecode(script)
  if (d == null) return null
  const fields = decodeMessageFields(d.fields)
  if (fields == null) return null
  return { recipientPubKeyHex: d.pubKeyHex, fields }
}

export const TEMPLATE_TAG_LICENSE = 0x01
export const TEMPLATE_TAG_LICENSE_REF = 0x02
export const TEMPLATE_LICENSE_MAX = 30

export function encodeTemplateFields(data) {
  const fields = [
    P_PREFIX,
    [P_VERSION],
    [RECORD_TEMPLATE],
    utf8ToBytes(data.tokenName),
    hexToBytes(data.tokenRules),
    hexToBytes(data.covenantScript),
  ]
  if (data.fileHash != null && data.fileHash.length > 0) {
    fields.push(hexToBytes(data.fileHash))
    if (data.wrappedKey != null && data.keySalt != null) {
      fields.push(data.wrappedKey, data.keySalt)
    }
  }
  if (data.license != null && data.license.length > 0) {
    const code = utf8ToBytes(data.license)
    if (code.length > TEMPLATE_LICENSE_MAX) throw new Error(`license code too long (${code.length} > ${TEMPLATE_LICENSE_MAX} bytes)`)
    fields.push([TEMPLATE_TAG_LICENSE, ...code])
  }
  if (data.licenseRef != null && data.licenseRef.length > 0) {
    fields.push([TEMPLATE_TAG_LICENSE_REF, ...hexToBytes(data.licenseRef)])
  }
  return fields
}

export function decodeTemplateFields(fields) {
  if (fields.length < 6) return null
  if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null
  if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null
  if (fields[2].length !== 1 || fields[2][0] !== RECORD_TEMPLATE) return null
  const result = {
    tokenName: bytesToUtf8(fields[3]),
    tokenRules: bytesToHex(fields[4]),
    covenantScript: isEmptyOrZero(fields[5]) ? '' : bytesToHex(fields[5]),
  }
  let i = 6
  if (fields.length > i && fields[i].length === 32) {
    result.fileHash = bytesToHex(fields[i]); i++
    if (decodeTokenRules(result.tokenRules).isEncrypted && fields.length >= i + 2) {
      result.wrappedKey = fields[i]
      result.keySalt = fields[i + 1]
      i += 2
    }
  }
  for (; i < fields.length; i++) {
    const f = fields[i]
    if (f.length < 1) continue
    if (f[0] === TEMPLATE_TAG_LICENSE) result.license = bytesToUtf8(f.slice(1))
    else if (f[0] === TEMPLATE_TAG_LICENSE_REF) result.licenseRef = bytesToHex(f.slice(1))
  }
  return result
}

export function buildTemplateScript(publisherPubKeyHex, data) {
  return pushDropLock(publisherPubKeyHex, encodeTemplateFields(data))
}

export function parseTemplateScript(
  script,
) {
  const d = pushDropDecode(script)
  if (d == null) return null
  const fields = decodeTemplateFields(d.fields)
  if (fields == null) return null
  return { publisherPubKeyHex: d.pubKeyHex, fields }
}

export function encodeFileFields(data) {
  return [
    P_PREFIX,
    [P_VERSION],
    [RECORD_FILE],
    utf8ToBytes(data.mimeType),
    utf8ToBytes(data.fileName),
    data.fileBytes,
  ]
}

export function decodeFileFields(fields) {
  if (fields.length < 6) return null
  if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null
  if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null
  if (fields[2].length !== 1 || fields[2][0] !== RECORD_FILE) return null
  return {
    mimeType: bytesToUtf8(fields[3]),
    fileName: bytesToUtf8(fields[4]),
    fileBytes: fields[5],
  }
}

export function buildFileScript(publisherPubKeyHex, data) {
  return pushDropLock(publisherPubKeyHex, encodeFileFields(data))
}

export function parseFileScript(
  script,
) {
  const d = pushDropDecode(script)
  if (d == null) return null
  const fields = decodeFileFields(d.fields)
  if (fields == null) return null
  return { publisherPubKeyHex: d.pubKeyHex, fields }
}

const LEGACY_FILE_MARKERS = new Set(['MPT-FILE', 'P-FILE'])
function readLegacyPush(bytes, i) {
  const op = bytes[i++]
  let len
  if (op >= 0x01 && op <= 0x4b) len = op
  else if (op === 0x4c) len = bytes[i++]
  else if (op === 0x4d) { len = bytes[i] | (bytes[i + 1] << 8); i += 2 }
  else if (op === 0x4e) { len = bytes[i] + bytes[i + 1] * 0x100 + bytes[i + 2] * 0x10000 + bytes[i + 3] * 0x1000000; i += 4 }
  else return null
  if (i + len > bytes.length) return null
  return { data: bytes.slice(i, i + len), next: i + len }
}
export function parseLegacyFileScript(script) {
  const bytes = script.toBinary()
  let i = 0
  if (bytes[i] === 0x00) i++
  if (bytes[i] !== 0x6a) return null
  i++
  const parts = []
  while (i < bytes.length) { const r = readLegacyPush(bytes, i); if (r == null) break; parts.push(r.data); i = r.next }
  if (parts.length < 4) return null
  const marker = utf8Of(parts[0])
  if (!LEGACY_FILE_MARKERS.has(marker)) return null
  const fileBytes = []
  for (const p of parts.slice(3)) for (const b of p) fileBytes.push(b)
  return { fields: { mimeType: utf8Of(parts[1]), fileName: utf8Of(parts[2]), fileBytes }, marker }
}

export function encodeStorefrontFields(data) {
  const out = [
    P_PREFIX,
    [P_VERSION],
    [RECORD_STOREFRONT],
    utf8ToBytes(data.description ?? ''),
    utf8ToBytes(data.coverMimeType ?? ''),
    utf8ToBytes(data.coverFileName ?? ''),
    data.coverBytes ?? [],
  ]
  if (data.backCoverBytes != null && data.backCoverBytes.length > 0) {
    out.push(utf8ToBytes(data.backCoverMimeType ?? ''), utf8ToBytes(data.backCoverFileName ?? ''), data.backCoverBytes)
  }
  return out
}

export function decodeStorefrontFields(fields) {
  if (fields.length < 7) return null
  if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null
  if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null
  if (fields[2].length !== 1 || fields[2][0] !== RECORD_STOREFRONT) return null
  const hasCover = !isEmptyOrZero(fields[6])
  const hasBack = fields.length >= 10 && !isEmptyOrZero(fields[9])
  return {
    description: isEmptyOrZero(fields[3]) ? '' : bytesToUtf8(fields[3]),
    coverMimeType: hasCover ? bytesToUtf8(fields[4]) : undefined,
    coverFileName: hasCover ? bytesToUtf8(fields[5]) : undefined,
    coverBytes: hasCover ? fields[6] : undefined,
    backCoverMimeType: hasBack ? bytesToUtf8(fields[7]) : undefined,
    backCoverFileName: hasBack ? bytesToUtf8(fields[8]) : undefined,
    backCoverBytes: hasBack ? fields[9] : undefined,
  }
}

export function buildStorefrontScript(publisherPubKeyHex, data) {
  return pushDropLock(publisherPubKeyHex, encodeStorefrontFields(data))
}

export function parseStorefrontScript(
  script,
) {
  const d = pushDropDecode(script)
  if (d == null) return null
  const fields = decodeStorefrontFields(d.fields)
  if (fields == null) return null
  return { publisherPubKeyHex: d.pubKeyHex, fields }
}

export function encodeMockupFields(manifest) {
  return [P_PREFIX, [P_VERSION], [RECORD_MOCKUP], manifest]
}
export function decodeMockupFields(fields) {
  if (fields.length < 4) return null
  if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null
  if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null
  if (fields[2].length !== 1 || fields[2][0] !== RECORD_MOCKUP) return null
  return fields[3]
}
export function buildMockupScript(publisherPubKeyHex, manifest) {
  return pushDropLock(publisherPubKeyHex, encodeMockupFields(manifest))
}
export function parseMockupScript(script) {
  const d = pushDropDecode(script)
  if (d == null) return null
  const manifest = decodeMockupFields(d.fields)
  if (manifest == null) return null
  return { publisherPubKeyHex: d.pubKeyHex, manifest }
}

export function encodeProfileFields(data) {
  return [
    P_PREFIX,
    [P_VERSION],
    [RECORD_PROFILE],
    utf8ToBytes(data.alias ?? ''),
    utf8ToBytes(data.avatarMimeType ?? ''),
    data.avatarBytes ?? [],
  ]
}

export function decodeProfileFields(fields) {
  if (fields.length < 6) return null
  if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null
  if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null
  if (fields[2].length !== 1 || fields[2][0] !== RECORD_PROFILE) return null
  const hasAvatar = !isEmptyOrZero(fields[5])
  return {
    alias: isEmptyOrZero(fields[3]) ? undefined : bytesToUtf8(fields[3]),
    avatarMimeType: hasAvatar ? bytesToUtf8(fields[4]) : undefined,
    avatarBytes: hasAvatar ? fields[5] : undefined,
  }
}

export function buildProfileScript(ownerPubKeyHex, data) {
  return pushDropLock(ownerPubKeyHex, encodeProfileFields(data))
}

export function parseProfileScript(
  script,
) {
  const d = pushDropDecode(script)
  if (d == null) return null
  const fields = decodeProfileFields(d.fields)
  if (fields == null) return null
  return { ownerPubKeyHex: d.pubKeyHex, fields }
}

const BONUS_LINK = 1
const BONUS_CODE = 2
const NOTE_HEADING = 3
const NOTE_TAGS = 4

export function encodeNoteFields(data) {
  const fields = [
    P_PREFIX,
    [P_VERSION],
    [RECORD_NOTE],
    hexToBytes(data.collectionRef),
    utf8ToBytes(data.text),
  ]
  if (data.bonusKind != null && data.bonusValue != null && data.bonusValue.length > 0) {
    fields.push([data.bonusKind === 'link' ? BONUS_LINK : BONUS_CODE], utf8ToBytes(data.bonusValue))
  }
  if (data.heading != null && data.heading.length > 0) fields.push([NOTE_HEADING], utf8ToBytes(data.heading))
  if (data.tags != null && data.tags.length > 0) fields.push([NOTE_TAGS], utf8ToBytes(data.tags.join(' ')))
  return fields
}

export function decodeNoteFields(fields) {
  if (fields.length < 5) return null
  if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null
  if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null
  if (fields[2].length !== 1 || fields[2][0] !== RECORD_NOTE) return null
  if (fields[3].length !== 32) return null
  const result = {
    collectionRef: bytesToHex(fields[3]),
    text: isEmptyOrZero(fields[4]) ? '' : bytesToUtf8(fields[4]),
  }
  for (let i = 5; i + 1 < fields.length; i += 2) {
    const type = fields[i].length === 1 ? fields[i][0] : 0
    const val = fields[i + 1]
    if (type === BONUS_LINK || type === BONUS_CODE) { result.bonusKind = type === BONUS_LINK ? 'link' : 'code'; result.bonusValue = bytesToUtf8(val) }
    else if (type === NOTE_HEADING) { result.heading = bytesToUtf8(val) }
    else if (type === NOTE_TAGS) { const t = bytesToUtf8(val).split(/[\s,]+/).filter(Boolean); if (t.length > 0) result.tags = t }
  }
  return result
}

export function buildNoteScript(authorPubKeyHex, data) {
  return pushDropLock(authorPubKeyHex, encodeNoteFields(data))
}

export function parseNoteScript(
  script,
) {
  const d = pushDropDecode(script)
  if (d == null) return null
  const fields = decodeNoteFields(d.fields)
  if (fields == null) return null
  return { authorPubKeyHex: d.pubKeyHex, fields }
}

export function encodePreviewFields(data) {
  return [
    P_PREFIX,
    [P_VERSION],
    [RECORD_PREVIEW],
    hexToBytes(data.collectionRef),
    utf8ToBytes(data.mimeType),
    data.previewBytes,
  ]
}

export function decodePreviewFields(fields) {
  if (fields.length < 6) return null
  if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null
  if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null
  if (fields[2].length !== 1 || fields[2][0] !== RECORD_PREVIEW) return null
  if (fields[3].length !== 32) return null
  return {
    collectionRef: bytesToHex(fields[3]),
    mimeType: bytesToUtf8(fields[4]),
    previewBytes: fields[5],
  }
}

export function buildPreviewScript(publisherPubKeyHex, data) {
  return pushDropLock(publisherPubKeyHex, encodePreviewFields(data))
}

export function parsePreviewScript(
  script,
) {
  const d = pushDropDecode(script)
  if (d == null) return null
  const fields = decodePreviewFields(d.fields)
  if (fields == null) return null
  return { publisherPubKeyHex: d.pubKeyHex, fields }
}

export function encodeConfigFields(data) {
  return [P_PREFIX, [P_VERSION], [RECORD_CONFIG], data.envelope]
}

export function decodeConfigFields(fields) {
  if (fields.length < 4) return null
  if (fields[0].length !== 1 || fields[0][0] !== P_PREFIX[0]) return null
  if (fields[1].length !== 1 || fields[1][0] !== P_VERSION) return null
  if (fields[2].length !== 1 || fields[2][0] !== RECORD_CONFIG) return null
  return { envelope: fields[3] }
}

export function buildConfigScript(ownerPubKeyHex, data) {
  return pushDropLock(ownerPubKeyHex, encodeConfigFields(data))
}

export function parseConfigScript(
  script,
) {
  const d = pushDropDecode(script)
  if (d == null) return null
  const fields = decodeConfigFields(d.fields)
  if (fields == null) return null
  return { ownerPubKeyHex: d.pubKeyHex, fields }
}

export function encodeTokenRules(
  supply,
  divisibility,
  restrictions,
  version,
) {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint16(0, supply, true)
  view.setUint16(2, divisibility, true)
  view.setUint16(4, restrictions, true)
  view.setUint16(6, version, true)
  return bytesToHex(Array.from(new Uint8Array(buf)))
}

export function decodeTokenRules(rulesHex) {
  const bytes = hexToBytes(rulesHex)
  const view = new DataView(new Uint8Array(bytes).buffer)
  const supply = view.getUint16(0, true)
  const restrictions = view.getUint16(4, true)
  return {
    supply,
    divisibility: view.getUint16(2, true),
    restrictions,
    version: view.getUint16(6, true),
    isFungible: (restrictions & RESTRICTION_FUNGIBLE) !== 0,
    isReplicable: (restrictions & RESTRICTION_REPLICABLE) !== 0,
    isUnlimited: supply === 0,
    isTracked: (restrictions & RESTRICTION_TRACK_TRANSFERS) !== 0,
    isEncrypted: (restrictions & RESTRICTION_ENCRYPTED) !== 0,
    isCompressed: (restrictions & RESTRICTION_COMPRESSED) !== 0,
  }
}

export function collectionId(tx1Ref) {
  return tx1Ref
}
