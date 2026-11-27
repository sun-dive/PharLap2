export const ALBUM_MIME = 'application/x-pharlap-album'
export const MAX_ALBUM_TRACKS = 64

const MAGIC = [0x50, 0x4c, 0x45, 0x50]
const VERSION = 1

export function packAlbum(tracks) {
  if (tracks.length === 0) throw new Error('an album needs at least one track')
  if (tracks.length > MAX_ALBUM_TRACKS) throw new Error(`an album can hold at most ${MAX_ALBUM_TRACKS} tracks`)
  const header = { v: VERSION, tracks: tracks.map(t => ({ n: t.name, m: t.mimeType, l: t.bytes.length })) }
  const headerBytes = Array.from(new TextEncoder().encode(JSON.stringify(header)))
  const len = headerBytes.length >>> 0
  const out = [...MAGIC, VERSION, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...headerBytes]
  for (const t of tracks) for (const b of t.bytes) out.push(b)
  return out
}

export function isAlbum(mimeType, bytes) {
  if (mimeType === ALBUM_MIME) return true
  if (bytes != null && bytes.length >= 4 && bytes[0] === MAGIC[0] && bytes[1] === MAGIC[1] && bytes[2] === MAGIC[2] && bytes[3] === MAGIC[3]) return true
  return false
}

export function parseAlbum(bytes) {
  if (bytes.length < 9) return null
  for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) return null
  const len = ((bytes[5] << 24) | (bytes[6] << 16) | (bytes[7] << 8) | bytes[8]) >>> 0
  const headEnd = 9 + len
  if (headEnd > bytes.length) return null
  let header
  try { header = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes.slice(9, headEnd)))) } catch { return null }
  if (header == null || !Array.isArray(header.tracks)) return null
  const tracks = []
  let off = headEnd
  for (const t of header.tracks) {
    const l = Math.max(0, Number(t.l) || 0)
    if (off + l > bytes.length) return null
    tracks.push({
      name: String(t.n ?? 'track'),
      mimeType: String(t.m ?? 'application/octet-stream'),
      bytes: bytes.slice(off, off + l),
    })
    off += l
  }
  return tracks
}
