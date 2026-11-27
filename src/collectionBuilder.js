// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { applyFee } from '../impl/js/coins.mjs'
import { txidToWire } from '../impl/js/signer.mjs'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import { toHex } from '../impl/js/bytes.mjs'

export const UNLOCK_P2PKH = 108

export function addFunding(tx, funding) {
  for (const f of funding) {
    tx.inputs.push({
      txid: txidToWire(f.utxo.txId), vout: f.utxo.outputIndex,
      script: new Uint8Array(0), sequence: 0xffffffff,
    })
  }
}

export function signFunding(tx, signer, funding, firstInput = 0) {
  const script = signer.lockingScript()
  funding.forEach((f, i) => {
    const at = firstInput + i
    if (tx.inputs[at] === undefined) throw new Error(`signFunding: no input at ${at} (funding entry ${i})`)
    tx.inputs[at].script = signer.unlockP2PKH(tx, at, script, f.utxo.satoshis)
  })
}
import {
  buildTemplateScript,
  buildFileScript,
  buildStorefrontScript,
  buildTokenScript,
  encodeTokenRules,
  classifyRecord,
  RESTRICTION_ENCRYPTED,
  RESTRICTION_COMPRESSED,
  buildMockupScript,
} from './tokenCodec.js'
import { compressIfSmaller } from './compress.js'
import { newContentKey, newKeySalt, encryptContent, wrapContentKey } from './contentCrypto.js'

export const PHARLAP_OUTPUT_SATS = 1
export const DEFAULT_FEE_PER_KB = 101

export async function getSafeUtxos(provider) {
  const utxos = await provider.getUtxos()
  return utxos.filter(u => u.satoshis > PHARLAP_OUTPUT_SATS)
}

export function selectFunding(utxos, target) {
  const sorted = [...utxos].sort((a, b) => b.satoshis - a.satoshis)
  const picked = []
  let total = 0
  for (const u of sorted) {
    picked.push(u)
    total += u.satoshis
    if (total >= target) return picked
  }
  throw new Error(`Insufficient funds: have ${total} sats, need ~${target}`)
}

export function sha256Hex(bytes) {
  return toHex(nobleSha256(Uint8Array.from(bytes)))
}

export async function buildTemplateTx(opts) {
  const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS
  const publisherPub = toHex(opts.key.publicKey())
  const tx = new Tx(1, [], [], 0)

  addFunding(tx, opts.funding)

  tx.outputs.push({ value: sats, script: buildTemplateScript(publisherPub, opts.template).toBinary() })
  const templateVout = 0
  let fileVout = null
  if (opts.file) {
    fileVout = tx.outputs.length
    tx.outputs.push({ value: sats, script: buildFileScript(publisherPub, opts.file).toBinary() })
  }
  let storefrontVout = null
  if (opts.storefront) {
    storefrontVout = tx.outputs.length
    tx.outputs.push({ value: sats, script: buildStorefrontScript(publisherPub, opts.storefront).toBinary() })
  }
  let mockupVout = null
  if (opts.mockup != null && opts.mockup.length > 0) {
    mockupVout = tx.outputs.length
    tx.outputs.push({ value: sats, script: buildMockupScript(publisherPub, opts.mockup).toBinary() })
  }

  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: opts.key.lockingScript() })

  applyFee(tx, {
    inputValues: opts.funding.map(f => f.utxo.satoshis),
    unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
    changeVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  signFunding(tx, opts.key, opts.funding)

  const changeSats = tx.outputs[changeVout]?.value ?? 0
  return {
    tx,
    tx1Id: tx.txid(),
    templateVout,
    fileVout,
    storefrontVout,
    mockupVout,
    changeVout: changeSats > 0 ? changeVout : null,
    changeSats,
  }
}

export async function buildGenesisTx(opts) {
  if (opts.mintCount < 1) throw new Error('mintCount must be >= 1')
  const sats = opts.outputSats ?? PHARLAP_OUTPUT_SATS
  const ownerPub = toHex(opts.key.publicKey())
  const stateData = opts.stateData ?? ''
  const tx = new Tx(1, [], [], 0)

  addFunding(tx, opts.funding)

  const tokenVouts = []
  for (let i = 0; i < opts.mintCount; i++) {
    tokenVouts.push(tx.outputs.length)
    tx.outputs.push({
      value: sats,
      script: buildTokenScript(ownerPub, { tx1Ref: opts.tx1Id, stateData }).toBinary(),
    })
  }

  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: opts.key.lockingScript() })

  applyFee(tx, {
    inputValues: opts.funding.map(f => f.utxo.satoshis),
    unlockingSizes: opts.funding.map(() => UNLOCK_P2PKH),
    changeVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  signFunding(tx, opts.key, opts.funding)

  const changeSats = tx.outputs[changeVout]?.value ?? 0
  return {
    tx,
    tx2Id: tx.txid(),
    tokenVouts,
    changeVout: changeSats > 0 ? changeVout : null,
    changeSats,
  }
}

export const SPEND_CANCELLED = 'SPEND_CANCELLED'

export function spentSats(selected, finalChangeSats) {
  return selected.reduce((s, u) => s + u.satoshis, 0) - finalChangeSats
}

export async function createCollection(
  provider,
  key,
  params,
) {
  const sats = params.outputSats ?? PHARLAP_OUTPUT_SATS
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const supply = params.supply ?? 1
  const mintCount = params.mintCount ?? (supply > 0 ? supply : 1)

  const encrypt = params.encrypt === true && params.file != null
  let storedBytes = params.file?.bytes
  let compressed = false
  let wrappedKey
  let keySalt
  if (params.file != null) {
    const z = await compressIfSmaller(params.file.bytes, params.file.mimeType, params.file.fileName)
    storedBytes = z.bytes
    compressed = z.compressed
    if (encrypt) {
      const K = newContentKey()
      keySalt = newKeySalt()
      storedBytes = encryptContent(storedBytes, K)
      wrappedKey = wrapContentKey(K, keySalt)
    }
  }
  const restrictions = (params.restrictions ?? 0) | (encrypt ? RESTRICTION_ENCRYPTED : 0) | (compressed ? RESTRICTION_COMPRESSED : 0)

  const template = {
    tokenName: params.tokenName,
    tokenRules: encodeTokenRules(supply, params.divisibility ?? 0, restrictions, params.rulesVersion ?? 1),
    covenantScript: params.covenantScript ?? '',
    fileHash: params.file == null ? undefined : encrypt ? sha256Hex(storedBytes) : sha256Hex(params.file.bytes),
    wrappedKey,
    keySalt,
    license: params.license,
    licenseRef: params.licenseRef,
  }
  const file = params.file
    ? { mimeType: params.file.mimeType, fileName: params.file.fileName, fileBytes: storedBytes }
    : undefined

  const hasStorefront = (params.description != null && params.description.length > 0) || params.cover != null
  const storefront = hasStorefront
    ? {
        description: params.description ?? '',
        coverMimeType: params.cover?.mimeType,
        coverFileName: params.cover?.fileName,
        coverBytes: params.cover?.bytes,
        backCoverMimeType: params.cover != null ? params.backCover?.mimeType : undefined,
        backCoverFileName: params.cover != null ? params.backCover?.fileName : undefined,
        backCoverBytes: params.cover != null ? params.backCover?.bytes : undefined,
      }
    : undefined

  const numOutputs = 1 + (file ? 1 : 0) + (storefront ? 1 : 0) + (params.mockupManifest?.length ? 1 : 0) + mintCount
  const tx1Bytes = 400 + (file ? file.fileBytes.length : 0)
    + (params.cover ? params.cover.bytes.length : 0)
    + (params.backCover ? params.backCover.bytes.length : 0)
  const tx2Bytes = 300 + mintCount * 80
  const estFee = Math.ceil(((tx1Bytes + tx2Bytes) * feePerKb) / 1000)
  const target = numOutputs * sats + estFee + Math.max(1000, Math.ceil(estFee * 0.1))
  const selected = selectFunding(await getSafeUtxos(provider), target)
  const funding = selected.map(u => ({ utxo: u }))

  const t1 = await buildTemplateTx({ key, funding, template, file, storefront, mockup: params.mockupManifest, outputSats: sats, feePerKb })
  if (t1.changeVout == null) {
    throw new Error('Insufficient funding: the template tx left no change to fund the genesis mint. Add more funds.')
  }
  const t2Funding = [
    {
      utxo: { txId: t1.tx1Id, outputIndex: t1.changeVout, satoshis: t1.changeSats, script: '' },
    },
  ]
  const t2 = await buildGenesisTx({
    key,
    funding: t2Funding,
    tx1Id: t1.tx1Id,
    mintCount,
    stateData: params.initialStateData ?? '',
    outputSats: sats,
    feePerKb,
  })

  if (params.confirmSpend != null && !(await params.confirmSpend(spentSats(selected, t2.changeSats)))) {
    throw new Error(SPEND_CANCELLED)
  }

  await provider.broadcast(t1.tx.hex(), { awaitSeen: true })
  provider.registerPendingTx(
    t1.tx1Id,
    selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    { outputIndex: t1.changeVout, satoshis: t1.changeSats },
  )
  await provider.broadcast(t2.tx.hex())
  provider.registerPendingTx(
    t2.tx2Id,
    [{ txId: t1.tx1Id, outputIndex: t1.changeVout }],
    t2.changeVout != null ? { outputIndex: t2.changeVout, satoshis: t2.changeSats } : undefined,
  )

  return {
    collectionId: t1.tx1Id,
    tx1Id: t1.tx1Id,
    tx2Id: t2.tx2Id,
    tokenOutpoints: t2.tokenVouts.map(v => ({ txId: t2.tx2Id, outputIndex: v })),
  }
}

export { classifyRecord }
