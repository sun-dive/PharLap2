export const BMF_MIME = 'application/x.bmf'

const HEX64 = /^[0-9a-f]{64}$/i
function toTxid(s) {
  const v = String(s ?? '').trim().split(':')[0].toLowerCase()
  return HEX64.test(v) ? v : null
}

export function fmtLrcTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0
  let cs = Math.round(sec * 100)
  const m = Math.floor(cs / 6000); cs -= m * 6000
  const s = Math.floor(cs / 100); cs -= s * 100
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function isBmf(mimeType, bytes) {
  if (mimeType === BMF_MIME || mimeType === 'application/vnd.blockmedia+json') return true
  if (bytes == null) return false
  const head = new TextDecoder().decode(new Uint8Array(bytes.slice(0, 256))).replace(/^﻿/, '').trimStart()
  if (head.startsWith('{') && /"bmf"\s*:/.test(head)) return true
  if (/^#\s*bmf\s*:/im.test(head)) return true
  return false
}

export function parseBmf(bytes) {
  const text = new TextDecoder().decode(new Uint8Array(bytes)).replace(/^﻿/, '').trim()
  if (text.startsWith('{')) {
    let j
    try { j = JSON.parse(text) } catch { return null }
    if (j == null || !Array.isArray(j.scenes)) return null
    const scenes = []
    for (const s of j.scenes) {
      const t = Number(s?.t)
      if (!isFinite(t)) continue
      scenes.push({ t, tx: toTxid(s?.tx), name: String(s?.name ?? 'scene') })
    }
    if (scenes.length === 0) return null
    const audio = j.audio != null ? { tx: toTxid(j.audio.tx), name: String(j.audio.name ?? 'audio') } : null
    return {
      audio, tempo: isFinite(Number(j.tempo)) && Number(j.tempo) > 0 ? Number(j.tempo) : null,
      license: j.license != null ? String(j.license) : null,
      attribution: j.attribution != null ? String(j.attribution) : null,
      scenes: scenes.sort((a, b) => a.t - b.t),
    }
  }
  const scenes = []
  let audioName = null
  let tempo = null
  let license = null
  let attribution = null
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^#\s*(audio|tempo|license|attribution)\s*:\s*(.+)$/i)
    if (h != null) {
      const key = h[1].toLowerCase(), val = h[2].trim()
      if (key === 'audio') audioName = val
      else if (key === 'tempo') { const v = Number(val); tempo = isFinite(v) && v > 0 ? v : null }
      else if (key === 'license') license = val
      else attribution = val
      continue
    }
    const m = line.match(/^\[(\d{1,2}):(\d{1,2}(?:\.\d{1,2})?)\](.+)$/)
    if (m != null) scenes.push({ t: parseInt(m[1], 10) * 60 + parseFloat(m[2]), tx: null, name: m[3].trim() })
  }
  if (scenes.length === 0) return null
  return { audio: audioName != null ? { tx: null, name: audioName } : null, tempo, license, attribution, scenes: scenes.sort((a, b) => a.t - b.t) }
}
