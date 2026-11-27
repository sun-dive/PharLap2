// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).

const MIN_COMPRESS = 64

const PRECOMPRESSED_MIME = new Set([
  'font/woff2', 'font/woff', 'application/font-woff2', 'application/font-woff', 'application/x-font-woff',
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'application/zip', 'application/gzip', 'application/x-gzip', 'application/x-zip-compressed', 'application/pdf',
])
const PRECOMPRESSED_EXT = new Set([
  'woff2', 'woff', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'heic', 'heif',
  'mp3', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'mp4', 'webm', 'mov', 'zip', 'gz', 'pdf',
])

export function isPrecompressed(mimeType, fileName) {
  const mt = mimeType != null ? mimeType.split(';')[0].trim().toLowerCase() : ''
  if (mt !== '' && PRECOMPRESSED_MIME.has(mt)) return true
  const ext = fileName != null ? (/\.([a-z0-9]+)$/i.exec(fileName)?.[1].toLowerCase() ?? '') : ''
  return ext !== '' && PRECOMPRESSED_EXT.has(ext)
}

async function run(bytes, stream) {
  const writer = stream.writable.getWriter()
  void writer.write(new Uint8Array(bytes))
  void writer.close()
  const buf = await new Response(stream.readable).arrayBuffer()
  return Array.from(new Uint8Array(buf))
}

export async function compressIfSmaller(
  bytes, mimeType, fileName,
) {
  if (isPrecompressed(mimeType, fileName) || bytes.length < MIN_COMPRESS || typeof CompressionStream === 'undefined') {
    return { bytes, compressed: false }
  }
  const z = await run(bytes, new CompressionStream('gzip'))
  return z.length < bytes.length ? { bytes: z, compressed: true } : { bytes, compressed: false }
}

export async function decompress(bytes) {
  return run(bytes, new DecompressionStream('gzip'))
}
