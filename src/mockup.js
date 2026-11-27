export const MOCKUP_MIME = 'application/vnd.bmf-mockup'
const TAG = 0x4d
const HEX64 = /^[0-9a-f]{64}$/i

const FLAG_PLACE = 0x01
const FLAG_WARP = 0x02
const FLAG_PROP_IDX = 0x04
const FLAG_DESIGN_IDX = 0x08
const FLAG_DESIGN_EMBEDDED = 0x10

export const RATIOS = [
  { id: 0, name: '1:1', w: 1, h: 1 },
  { id: 1, name: '4:5', w: 4, h: 5 },
  { id: 2, name: '2:3', w: 2, h: 3 },
  { id: 3, name: '16:9', w: 16, h: 9 },
  { id: 4, name: '9:16', w: 9, h: 16 },
]

export function ratioOf(width, height) {
  if (!(width > 0) || !(height > 0)) return 0
  const target = Math.log(width / height)
  let best = 0, bestD = Infinity
  for (const r of RATIOS) { const d = Math.abs(Math.log(r.w / r.h) - target); if (d < bestD) { bestD = d; best = r.id } }
  return best
}

export function ratioDims(id) {
  const r = RATIOS[id] ?? RATIOS[0]
  return { w: r.w, h: r.h }
}

const SIGNED = { u8: false, i8: true, unit: false, sunit: true, deg: false, q4: false }

export const WARP_TYPES = [
  'flat', 'cyl', 'disp', 'persp', 'bulge', 'sphere', 'cone', 'mesh',
  'ripple', 'wave', 'curl', 'emboss', 'fold', 'skew', '_r14', 'ext',
]
const WARP_ID = Object.fromEntries(WARP_TYPES.map((t, i) => [t, i]))

const WARP_SCHEMA = {
  flat: [],
  cyl: [['curve', 'unit'], ['bow', 'sunit'], ['axis', 'u8']],
  disp: [['str', 'q4'], ['map', 'u8']],
  persp: [['kx', 'sunit'], ['ky', 'sunit']],
  bulge: [['amt', 'sunit']],
  sphere: [['curve', 'unit']],
  cone: [['taper', 'unit'], ['curve', 'unit']],
  ripple: [['amp', 'u8'], ['freq', 'u8'], ['phase', 'u8'], ['axis', 'u8']],
  wave: [['amp', 'u8'], ['len', 'u8'], ['angle', 'deg']],
  curl: [['amt', 'u8'], ['corner', 'u8']],
  emboss: [['depth', 'sunit']],
  skew: [['sx', 'sunit'], ['sy', 'sunit']],
}

const TAG_PROP = 0x50
export const PROP_FIELD = {
  RATIO: 0x01, FABRIC: 0x02, PLACE: 0x03, WARP: 0x04, QUAD: 0x05,
  DISP: 0x06, MASK: 0x07, SHADE: 0x08, DIMS: 0x09, NAME: 0x0a, CONTOUR: 0x0b,
}

class W {
  b = []
  u8(v) { this.b.push(v & 0xff); return this }
  i8(v) { this.b.push((v | 0) & 0xff); return this }
  u16(v) { this.b.push(v & 0xff, (v >>> 8) & 0xff); return this }
  bytes(a) { for (const x of a) this.b.push(x & 0xff); return this }
  out() { return this.b }
}
class R {
  b
  i = 0
  constructor(b) { this.b = b }
  u8() { return this.b[this.i++] }
  i8() { const v = this.b[this.i++]; return v > 127 ? v - 256 : v }
  u16() { const v = this.b[this.i] | (this.b[this.i + 1] << 8); this.i += 2; return v }
  bytes(n) { const s = this.b.slice(this.i, this.i + n); this.i += n; return s }
  rem() { return this.b.length - this.i }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
function hexToBytes(hex) { const o = []; for (let i = 0; i < hex.length; i += 2) o.push(parseInt(hex.slice(i, i + 2), 16)); return o }
function bytesToHex(b) { return b.map(x => x.toString(16).padStart(2, '0')).join('') }
function utf8ToBytes(s) { return Array.from(new TextEncoder().encode(s)) }
function bytesToUtf8(b) { return new TextDecoder().decode(new Uint8Array(b)) }

function encParam(enc, v) {
  switch (enc) {
    case 'u8': return clamp(Math.round(v), 0, 255)
    case 'i8': return clamp(Math.round(v), -128, 127)
    case 'unit': return clamp(Math.round(v * 255), 0, 255)
    case 'sunit': return clamp(Math.round(v * 127), -127, 127)
    case 'deg': return clamp(Math.round((((v % 360) + 360) % 360) / 360 * 255), 0, 255)
    case 'q4': return clamp(Math.round(v * 4), 0, 255)
  }
}
function decParam(enc, byte) {
  switch (enc) {
    case 'u8': case 'i8': return byte
    case 'unit': return byte / 255
    case 'sunit': return byte / 127
    case 'deg': return byte / 255 * 360
    case 'q4': return byte / 4
  }
}

function packWarp(stages) {
  const w = new W().u8(stages.length)
  for (const st of stages) {
    const id = WARP_ID[st.t] ?? WARP_ID.ext
    const schema = WARP_SCHEMA[st.t]
    const pw = new W()
    if (schema != null) {
      for (const [name, enc] of schema) {
        const q = encParam(enc, Number(st[name] ?? 0))
        SIGNED[enc] ? pw.i8(q) : pw.u8(q)
      }
    } else if (Array.isArray(st.raw)) {
      pw.bytes(st.raw)
    }
    const pb = pw.out()
    w.u8(id).u8(pb.length).bytes(pb)
  }
  return w.out()
}
function parseWarp(r) {
  const n = r.u8()
  const stages = []
  for (let i = 0; i < n; i++) {
    const id = r.u8(), plen = r.u8()
    const name = WARP_TYPES[id] ?? 'ext'
    const schema = WARP_SCHEMA[name]
    const start = r.i
    if (schema != null) {
      const st = { t: name }
      for (const [pn, enc] of schema) {
        const byte = SIGNED[enc] ? r.i8() : r.u8()
        st[pn] = decParam(enc, byte)
      }
      r.i = start + plen
      stages.push(st)
    } else {
      stages.push({ t: name, raw: r.bytes(plen) })
    }
  }
  return stages
}

export function packCover(c) {
  const d = c.design
  const propIdx = c.prop.index != null
  const designIdx = d != null && d.index != null
  let flags = 0
  if (c.place) flags |= FLAG_PLACE
  if (c.warp) flags |= FLAG_WARP
  if (propIdx) flags |= FLAG_PROP_IDX
  if (designIdx) flags |= FLAG_DESIGN_IDX
  if (d == null) flags |= FLAG_DESIGN_EMBEDDED

  const w = new W().u8(TAG).u8(c.version & 0xff).u8(flags)
  propIdx ? w.u16(c.prop.index) : w.bytes(hexToBytes(c.prop.tx))
  if (d != null) {
    d.index != null ? w.u16(d.index) : w.bytes(hexToBytes(d.tx))
  }
  if (c.place) {
    w.u16(clamp(Math.round(c.place.x * 65535), 0, 65535))
      .u16(clamp(Math.round(c.place.y * 65535), 0, 65535))
      .u16(clamp(Math.round(c.place.scale * 1024), 0, 65535))
      .u8(clamp(Math.round((((c.place.rot % 360) + 360) % 360) / 360 * 255), 0, 255))
      .i8(clamp(Math.round(c.place.skewX * 127), -127, 127))
      .i8(clamp(Math.round(c.place.skewY * 127), -127, 127))
      .u8(clamp(Math.round(c.place.fabric * 255), 0, 255))
  }
  if (c.warp) w.bytes(packWarp(c.warp))
  return w.out()
}

export function parseCover(bytes) {
  if (bytes == null || bytes.length < 3 || bytes[0] !== TAG) return null
  const r = new R(bytes)
  r.u8()
  const version = r.u8()
  const flags = r.u8()
  try {
    const prop = (flags & FLAG_PROP_IDX) ? { tx: null, index: r.u16() } : { tx: bytesToHex(r.bytes(32)), index: null }
    let design = null
    if (!(flags & FLAG_DESIGN_EMBEDDED)) {
      design = (flags & FLAG_DESIGN_IDX) ? { tx: null, index: r.u16() } : { tx: bytesToHex(r.bytes(32)), index: null }
    }
    let place = null
    if (flags & FLAG_PLACE) {
      place = { x: r.u16() / 65535, y: r.u16() / 65535, scale: r.u16() / 1024, rot: r.u8() / 255 * 360, skewX: r.i8() / 127, skewY: r.i8() / 127, fabric: r.u8() / 255 }
    }
    const warp = (flags & FLAG_WARP) ? parseWarp(r) : null
    return { version, prop, design, place, warp }
  } catch {
    return null
  }
}

export function isMockup(mimeType, bytes) {
  if (mimeType === MOCKUP_MIME) return true
  return bytes != null && bytes.length >= 2 && (bytes[0] === TAG || bytes[0] === TAG_PROP)
}

export function isProp(bytes) {
  return bytes != null && bytes.length >= 2 && bytes[0] === TAG_PROP
}

function putBlock(w, id, val) {
  w.u8(id)
  if (val.length < 0xff) w.u8(val.length)
  else w.u8(0xff).u16(val.length)
  w.bytes(val)
}

export function packProp(p) {
  const w = new W().u8(TAG_PROP).u8(p.version & 0xff)
  putBlock(w, PROP_FIELD.RATIO, [p.ratio & 0xff])
  putBlock(w, PROP_FIELD.FABRIC, [clamp(Math.round(p.fabric * 255), 0, 255)])
  if (p.place) {
    putBlock(w, PROP_FIELD.PLACE, new W()
      .u16(clamp(Math.round(p.place.x * 65535), 0, 65535))
      .u16(clamp(Math.round(p.place.y * 65535), 0, 65535))
      .u16(clamp(Math.round(p.place.scale * 1024), 0, 65535))
      .u8(clamp(Math.round((((p.place.rot % 360) + 360) % 360) / 360 * 255), 0, 255))
      .i8(clamp(Math.round(p.place.skewX * 127), -127, 127))
      .i8(clamp(Math.round(p.place.skewY * 127), -127, 127))
      .out())
  }
  if (p.quad && p.quad.length === 4) {
    const qw = new W()
    for (const [x, y] of p.quad) qw.u16(clamp(Math.round(x * 65535), 0, 65535)).u16(clamp(Math.round(y * 65535), 0, 65535))
    putBlock(w, PROP_FIELD.QUAD, qw.out())
  }
  if (p.warp && p.warp.length) putBlock(w, PROP_FIELD.WARP, packWarp(p.warp))
  if (p.disp) putBlock(w, PROP_FIELD.DISP, [...hexToBytes(p.disp.tx), clamp(Math.round(p.disp.str * 255), 0, 255)])
  if (p.mask) putBlock(w, PROP_FIELD.MASK, hexToBytes(p.mask))
  if (p.shade) putBlock(w, PROP_FIELD.SHADE, hexToBytes(p.shade))
  if (p.dims) putBlock(w, PROP_FIELD.DIMS, new W().u16(p.dims.wmm).u16(p.dims.hmm).out())
  if (p.name) putBlock(w, PROP_FIELD.NAME, utf8ToBytes(p.name))
  if (p.contour) putBlock(w, PROP_FIELD.CONTOUR, [clamp(Math.round(p.contour), 0, 255)])
  for (const e of p.ext ?? []) putBlock(w, e.id, e.data)
  return w.out()
}

export function parseProp(bytes) {
  if (bytes == null || bytes.length < 2 || bytes[0] !== TAG_PROP) return null
  const r = new R(bytes)
  r.u8()
  const p = {
    version: r.u8(), ratio: 0, fabric: 0.8, place: null, quad: null, warp: null,
    disp: null, mask: null, shade: null, dims: null, name: null, contour: null, ext: [],
  }
  try {
    while (r.rem() >= 2) {
      const id = r.u8()
      let len = r.u8(); if (len === 0xff) len = r.u16()
      if (len > r.rem()) break
      const start = r.i
      switch (id) {
        case PROP_FIELD.RATIO: p.ratio = r.u8(); break
        case PROP_FIELD.FABRIC: p.fabric = r.u8() / 255; break
        case PROP_FIELD.PLACE: p.place = { x: r.u16() / 65535, y: r.u16() / 65535, scale: r.u16() / 1024, rot: r.u8() / 255 * 360, skewX: r.i8() / 127, skewY: r.i8() / 127 }; break
        case PROP_FIELD.QUAD: { const q = []; for (let k = 0; k < 4; k++) q.push([r.u16() / 65535, r.u16() / 65535]); p.quad = q; break }
        case PROP_FIELD.WARP: p.warp = parseWarp(r); break
        case PROP_FIELD.DISP: p.disp = { tx: bytesToHex(r.bytes(32)), str: r.u8() / 255 }; break
        case PROP_FIELD.MASK: p.mask = bytesToHex(r.bytes(32)); break
        case PROP_FIELD.SHADE: p.shade = bytesToHex(r.bytes(32)); break
        case PROP_FIELD.DIMS: p.dims = { wmm: r.u16(), hmm: r.u16() }; break
        case PROP_FIELD.NAME: p.name = bytesToUtf8(r.bytes(len)); break
        case PROP_FIELD.CONTOUR: p.contour = r.u8(); break
        default: p.ext.push({ id, data: r.bytes(len) }); break
      }
      r.i = start + len
    }
    return p
  } catch { return null }
}

function refFromJson(x) {
  if (typeof x === 'number') return { tx: null, index: x }
  const s = String(x ?? '').toLowerCase()
  return HEX64.test(s) ? { tx: s, index: null } : { tx: null, index: 0 }
}
function refToJson(r) { return r.index != null ? r.index : (r.tx ?? '') }

function warpFromJson(w) {
  const arr = Array.isArray(w) ? w : [w]
  return arr.filter(Boolean).map(s => {
    const o = s
    const st = { t: String(o.t ?? 'flat') }
    for (const k of Object.keys(o)) if (k !== 't') st[k] = o[k]
    return st
  })
}

export function coverFromJson(obj) {
  const P = obj.P
  return {
    version: Number(obj.v ?? 1),
    prop: refFromJson(obj.p),
    design: obj.d == null ? null : refFromJson(obj.d),
    place: Array.isArray(P) ? { x: P[0] ?? 0.5, y: P[1] ?? 0.5, scale: P[2] ?? 1, rot: P[3] ?? 0, skewX: P[4] ?? 0, skewY: P[5] ?? 0, fabric: P[6] ?? 0.8 } : null,
    warp: obj.w != null ? warpFromJson(obj.w) : null,
  }
}
export function coverToJson(c) {
  const o = { v: c.version, p: refToJson(c.prop) }
  if (c.design) o.d = refToJson(c.design)
  if (c.place) o.P = [c.place.x, c.place.y, c.place.scale, c.place.rot, c.place.skewX, c.place.skewY, c.place.fabric]
  if (c.warp) o.w = c.warp
  return o
}

export function propFromJson(obj) {
  const print = obj.print
  if (!Array.isArray(print) || print.length !== 4) return null
  return {
    version: Number(obj.v ?? 1),
    ratio: Number(obj.ratio ?? 0),
    print,
    warp: obj.warp != null ? warpFromJson(obj.warp) : [],
    fabric: obj.fabric != null ? Number(obj.fabric) : 0.8,
    roles: (obj.roles) ?? {},
    meta: obj.meta,
  }
}
export function propToJson(p) {
  const o = { v: p.version, ratio: p.ratio, print: p.print, warp: p.warp, fabric: p.fabric, roles: p.roles }
  if (p.meta) o.meta = p.meta
  return o
}
