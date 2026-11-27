export const MANIFEST_MIME = 'application/x-pharlap-refs'
export const MAX_MANIFEST_REFS = 24

const MAGIC = [0x50, 0x52, 0x45, 0x46]
const VERSION = 1
const HEX64 = /^[0-9a-fA-F]{64}$/

export function packManifest(refs) {
  if (refs.length === 0) throw new Error('a reference manifest needs at least one entry')
  if (refs.length > MAX_MANIFEST_REFS) throw new Error(`a reference manifest can hold at most ${MAX_MANIFEST_REFS} entries`)
  for (const r of refs) {
    if (!HEX64.test(r.id)) throw new Error(`reference id must be a 32-byte txid hex: ${r.id}`)
    if (!HEX64.test(r.hash)) throw new Error(`reference hash must be a 32-byte sha256 hex: ${r.hash}`)
  }
  const header = { v: VERSION, refs: refs.map(r => ({ i: r.id.toLowerCase(), h: r.hash.toLowerCase(), n: r.name, m: r.mimeType })) }
  const headerBytes = Array.from(new TextEncoder().encode(JSON.stringify(header)))
  const len = headerBytes.length >>> 0
  return [...MAGIC, VERSION, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...headerBytes]
}

export function isManifest(mimeType, bytes) {
  if (mimeType === MANIFEST_MIME) return true
  if (bytes != null && bytes.length >= 4 && bytes[0] === MAGIC[0] && bytes[1] === MAGIC[1] && bytes[2] === MAGIC[2] && bytes[3] === MAGIC[3]) return true
  return false
}

export function parseManifest(bytes) {
  if (bytes.length < 9) return null
  for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) return null
  const len = ((bytes[5] << 24) | (bytes[6] << 16) | (bytes[7] << 8) | bytes[8]) >>> 0
  const headEnd = 9 + len
  if (headEnd > bytes.length) return null
  let header
  try { header = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes.slice(9, headEnd)))) } catch { return null }
  if (header == null || !Array.isArray(header.refs) || header.refs.length === 0) return null
  const refs = []
  for (const r of header.refs) {
    const id = String(r.i ?? ''), hash = String(r.h ?? '')
    if (!HEX64.test(id) || !HEX64.test(hash)) return null
    refs.push({ id: id.toLowerCase(), hash: hash.toLowerCase(), name: String(r.n ?? 'track'), mimeType: String(r.m ?? 'application/octet-stream') })
  }
  return refs
}
