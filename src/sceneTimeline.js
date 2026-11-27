import { parseLyrics } from './lyrics.js'

export function resolveCue(cueText, available) {
  const parsed = parseLyrics(cueText)
  if (parsed == null || !parsed.synced) return null
  const byName = new Map()
  for (const a of available) {
    byName.set(a.toLowerCase(), a)
    byName.set(a.toLowerCase().replace(/^.*[/\\]/, ''), a)
  }
  const scenes = []
  for (const l of parsed.lines) {
    const hit = byName.get(l.text.trim().toLowerCase())
    if (hit != null) scenes.push({ t: l.t, name: hit })
  }
  return scenes.length > 0 ? scenes : null
}
