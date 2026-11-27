export function parseLyrics(raw) {
  if (raw == null || raw.trim() === '') return null
  const rawLines = raw.replace(/\r/g, '').split('\n')
  const tsRe = /\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g
  const synced = []
  for (const line of rawLines) {
    tsRe.lastIndex = 0
    const times = []
    let m
    while ((m = tsRe.exec(line)) != null) times.push(parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(':', '.')))
    if (times.length > 0) {
      const text = line.replace(/\[[^\]]*\]/g, '').trim()
      for (const t of times) synced.push({ t, text })
    }
  }
  if (synced.length > 0) { synced.sort((a, b) => a.t - b.t); return { synced: true, lines: synced } }
  const plain = rawLines.map(l => l.trim()).filter(l => l !== '').map(text => ({ t: -1, text }))
  return plain.length > 0 ? { synced: false, lines: plain } : null
}
