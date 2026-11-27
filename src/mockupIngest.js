import { utf8Of } from './bytes.js'
import { readStoreZip } from './bmc.js'
import { packCover, packProp,  } from './mockup.js'
import { createCollection } from './collectionBuilder.js'
import { createEdition } from './editionBuilder.js'

function mimeFromName(name) {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase()
  return ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'gif' ? 'image/gif' : ext === 'avif' ? 'image/avif' : 'image/webp'
}

export function readMockupBundle(zipBytes) {
  const files = readStoreZip(zipBytes)
  if (files == null || files['mockup.json'] == null) return null
  let recipe
  try { recipe = JSON.parse(utf8Of(files['mockup.json'])) } catch { return null }
  const roles = recipe.prop?.roles ?? {}
  const base = files[roles.base ?? 'base.webp']
  const designName = recipe.design ?? 'design.webp'
  const design = files[designName]
  if (base == null || design == null) return null
  const designMime = recipe.designMime ?? mimeFromName(designName)
  const maps = {}
  for (const role of ['mask', 'shade', 'disp']) {
    const file = roles[role]
    if (file != null && files[file] != null) maps[role] = files[file]
  }
  return { base, design, designMime, maps, recipe }
}

export function bundleToPropManifest(recipe, ratio) {
  const p = recipe.place
  return {
    version: 1,
    ratio,
    fabric: recipe.fabric ?? 0.8,
    place: p == null ? null : { x: p.cx, y: p.cy, scale: p.w, rot: p.rot, skewX: p.skewX, skewY: p.skewY },
    quad: null,
    warp: recipe.prop?.warp ?? null,
    disp: null, mask: null, shade: null,
    dims: null,
    name: recipe.prop?.name ?? null,
    contour: recipe.contour && recipe.contour > 0 ? Math.round(recipe.contour) : null,
  }
}

export function productCoverPointer(propTxid) {
  const cover = {
    version: 1,
    prop: { tx: propTxid, index: null },
    design: null,
    place: null,
    warp: null,
  }
  return packCover(cover)
}

export async function mintMockupProduct(provider, key, opts) {
  let propTxid = opts.propTxid
  if (propTxid == null) {
    const prop = await createCollection(provider, key, {
      tokenName: opts.propName ?? opts.recipe.prop?.name ?? 'prop',
      supply: 1, mintCount: 1,
      file: { mimeType: 'image/webp', fileName: 'base.webp', bytes: opts.base },
      mockupManifest: packProp(bundleToPropManifest(opts.recipe, opts.ratio ?? 0)),
    })
    propTxid = prop.collectionId
  }
  const manifest = productCoverPointer(propTxid)
  const supply = opts.supply ?? 1
  const dExt = opts.cleanDesign.mimeType === 'image/png' ? 'png' : opts.cleanDesign.mimeType === 'image/jpeg' ? 'jpg' : opts.cleanDesign.mimeType === 'image/avif' ? 'avif' : 'webp'
  const file = { mimeType: opts.cleanDesign.mimeType, fileName: `design.${dExt}`, bytes: opts.cleanDesign.bytes }
  const cover = { mimeType: opts.previewDesign.mimeType, fileName: 'preview.webp', bytes: opts.previewDesign.bytes }

  if (opts.covenant) {
    const product = await createEdition(provider, key, {
      tokenName: opts.productName,
      terms: opts.covenant.terms,
      mintCount: supply,
      file, cover,
      encrypt: opts.encrypt,
      description: opts.description,
      license: opts.license,
      mockupManifest: manifest,
      feePerKb: opts.feePerKb,
      confirmSpend: opts.confirmSpend,
    })
    return { propTxid, productTxid: product.collectionId, editions: product.editions }
  }

  const product = await createCollection(provider, key, {
    tokenName: opts.productName,
    supply, mintCount: supply,
    file,
    encrypt: opts.encrypt,
    description: opts.description,
    cover,
    license: opts.license,
    mockupManifest: manifest,
    feePerKb: opts.feePerKb,
    confirmSpend: opts.confirmSpend,
  })
  return { propTxid, productTxid: product.collectionId, tokenOutpoints: product.tokenOutpoints }
}
