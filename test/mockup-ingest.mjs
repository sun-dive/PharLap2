// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Mockup-bundle ingest (offline).
 *  - readMockupBundle pulls base/design/maps + recipe from a store-only ZIP
 *  - bundleToPropManifest maps the recipe → the PROP's manifest (geometry + socket ratio); the prop owns geometry
 *  - productCoverPointer maps a prop txid → the product's tiny pointer cover (design embedded, no geometry)
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (c, w) => { c ? pass++ : (fail++, console.log(`  ✗ ${w}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'mockup-'))
const load = async m => {
  await build({ entryPoints: [join(HERE, '..', 'src', `${m}.ts`)], bundle: true, outfile: join(tmp, `${m}.mjs`),
                platform: 'browser', format: 'esm', target: 'es2020', logLevel: 'silent' })
  return import(pathToFileURL(join(tmp, `${m}.mjs`)).href)
}
const MI = await load('mockupIngest')
const MK = await load('mockup')

// Minimal store-only ZIP writer (local file headers only — all readStoreZip needs).
function storeZip(entries) {
  const u16 = v => [v & 0xff, (v >> 8) & 0xff]
  const u32 = v => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]
  const out = []
  for (const e of entries) {
    const name = [...e.name].map(c => c.charCodeAt(0))
    out.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(e.bytes.length), ...u32(e.bytes.length), ...u16(name.length), ...u16(0), ...name, ...e.bytes)
  }
  return out
}
const jsonBytes = o => Array.from(new TextEncoder().encode(JSON.stringify(o)))

// ── readMockupBundle ─────────────────────────────────────────────────────────────────────────────────
{
  const recipe = {
    v: 1, prop: { name: 'mug', roles: { base: 'base.webp', mask: 'mask.webp' }, warp: [{ t: 'cyl', curve: 0.6, bow: 0.5, axis: 0 }] },
    design: 'design.webp', place: { cx: 0.5, cy: 0.5, w: 0.6, h: 0.4, rot: 0, skewX: 0, skewY: 0 }, fabric: 1,
  }
  const zip = storeZip([
    { name: 'base.webp', bytes: [1, 2, 3] },
    { name: 'design.webp', bytes: [4, 5, 6] },
    { name: 'mask.webp', bytes: [7, 8] },
    { name: 'mockup.json', bytes: jsonBytes(recipe) },
  ])
  const b = MI.readMockupBundle(zip)
  ok(b !== null, '★ a store-only zip with a recipe is a mockup bundle')
  ok(b !== null && b.base.join() === '1,2,3' && b.design.join() === '4,5,6', '★ base and design come out by their recipe roles')
  ok(b !== null && b.maps.mask?.join() === '7,8' && b.maps.shade === undefined, '★ present maps are read, absent ones stay absent')
  ok(b !== null && b.recipe.prop.name === 'mug' && b.designMime === 'image/webp', '★ the recipe and the design MIME')
  ok(MI.readMockupBundle(storeZip([{ name: 'base.webp', bytes: [1] }])) === null, '⛔ a zip without mockup.json is not a bundle')
  ok(MI.readMockupBundle([1, 2, 3]) === null, '⛔ …nor is something that is not a zip')
  const png = MI.readMockupBundle(storeZip([{ name: 'base.webp', bytes: [1] }, { name: 'design.png', bytes: [2] }, { name: 'mockup.json', bytes: jsonBytes({ v: 1, design: 'design.png' }) }]))
  ok(png !== null && png.designMime === 'image/png', '★ the design keeps its own format (png)')
}

// ── bundleToPropManifest ─────────────────────────────────────────────────────────────────────────────
{
  const recipe = {
    v: 1, prop: { name: 'tee', warp: [{ t: 'cyl', curve: 0.6, bow: 0.5, axis: 0 }] }, design: 'design.webp',
    place: { cx: 0.3, cy: 0.5, w: 0.6, h: 0.4, rot: 0, skewX: -0.2, skewY: 0.1 }, fabric: 0.83,
  }
  const prop = MI.bundleToPropManifest(recipe, 1)
  ok(prop.ratio === 1 && Math.abs(prop.fabric - 0.83) < 1e-6, '★ ratio and fabric carried')
  ok(Math.abs(prop.place.x - 0.3) < 1e-6 && Math.abs(prop.place.scale - 0.6) < 1e-6, '★ the recipe width becomes the print-box scale')
  ok(prop.warp[0].t === 'cyl' && prop.name === 'tee', '★ warp and name carried')
  const back = MK.parseProp(MK.packProp(prop))
  ok(back !== null && back.ratio === 1 && Math.abs(back.place.skewX - (-0.2)) < 0.008, '★★ …and it survives the packed round-trip')
  ok(MI.bundleToPropManifest({ v: 1, prop: { warp: [] } }, 0).place === null, '★ a recipe with no place packs a place-less manifest')
}

// ── productCoverPointer ──────────────────────────────────────────────────────────────────────────────
{
  const txid = 'a'.repeat(64)
  const packed = MI.productCoverPointer(txid)
  ok(packed.length === 35, `★ the product cover is a 35-byte pointer (${packed.length})`)
  const cover = MK.parseCover(packed)
  ok(cover !== null && cover.prop.tx === txid && cover.design === null && cover.place === null && cover.warp === null,
     '★★ …naming the prop, with the design embedded and no geometry of its own')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '⚠'}  ${pass} passed · ${fail} failed   [mockup ingest]`)
process.exit(fail === 0 ? 0 : 1)
