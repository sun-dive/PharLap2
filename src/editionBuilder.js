// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { preimage, SIGHASH } from '../impl/js/transaction.mjs'
import { LockingScript, UnlockingScript as CoreUnlockingScript } from '../impl/js/script.mjs'

const UnlockingScript = {
  from: (chunks) =>
    new CoreUnlockingScript(chunks.map(c => ({ op: c.op, data: c.data === undefined ? undefined : Uint8Array.from(c.data) }))),
}
import { applyFee } from '../impl/js/coins.mjs'
import { hexBytes, hexOf, sha256Bytes, hash160Bytes, addressFromPubHex } from './bytes.js'
import { beBytes } from '../impl/js/bytes.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { Signer, txidToWire, wireToTxid } from '../impl/js/signer.mjs'
import {
  buildEditionLock, swapEditionOwner, editionOwnerPubKey, p2pkhScript, serializeOutput,
  editionReplicateUnlockChunks, editionTransferUnlockChunks, editionBurnUnlockChunks, EDITION_SCOPE, parseEditionScript,
  buildHolderEditionScript,
} from './covenant.js'
import {
  PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, getSafeUtxos, selectFunding, buildTemplateTx, sha256Hex,
  SPEND_CANCELLED, spentSats, addFunding, signFunding, UNLOCK_P2PKH,
} from './collectionBuilder.js'
import { encodeTokenRules, buildNoteScript, RESTRICTION_REPLICABLE, RESTRICTION_ENCRYPTED, RESTRICTION_COMPRESSED } from './tokenCodec.js'
import { compressIfSmaller } from './compress.js'
import { readNoteFromTx, noteHasContent } from './sellerNote.js'
import { newContentKey, newKeySalt, encryptContent, wrapContentKey } from './contentCrypto.js'

function pubKeyBytes(key) {
  return Array.from(key.publicKey())
}

export async function buildEditionGenesisTx(opts) {
  const tokenSats = opts.terms.tokenSats ?? PHARLAP_OUTPUT_SATS
  const ownerPub = opts.ownerPubKey ?? pubKeyBytes(opts.key)
  const tx1Ref = hexBytes(opts.tx1Ref)
  if (tx1Ref.length !== 32) throw new Error('buildEditionGenesisTx: tx1Ref must be a 32-byte txid hex')

  const tx = new Tx(2, [], [], 0)
  addFunding(tx, opts.funding)

  const editionVouts = []
  for (let i = 0; i < (opts.mintCount ?? 1); i++) {
    const lock = buildEditionLock({
      tx1Ref, ownerPubKey: ownerPub,
      publisherPubKeyHash: opts.terms.publisherPubKeyHash, publisherFeeSats: opts.terms.publisherFeeSats,
      holderFeeSats: opts.terms.holderFeeSats, tokenSats,
    })
    editionVouts.push(tx.outputs.length)
    tx.outputs.push({ value: tokenSats, script: Uint8Array.from(lock.toBinary()) })
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
  return { tx, txId: tx.txid(), editionVouts, changeVout: changeSats > 0 ? changeVout : null, changeSats }
}

const otherInputsOf = (tx, inputIndex) => tx.inputs.filter((_, i) => i !== inputIndex)

const covenantPreimage = (tx, inputIndex, subscript, sourceSatoshis, scope) =>
  Array.from(preimage(tx, inputIndex, Uint8Array.from(subscript), sourceSatoshis, scope))

const enforcedSliceBytes = (tx, enforced) =>
  tx.outputs.slice(enforced).flatMap(o => serializeOutput(o.value, Array.from(o.script)))

function assertExactLength(sized, actual, what) {
  if (sized !== actual) {
    throw new Error(`${what}: unlock length moved between fee and signing (${sized} → ${actual}) — the fee would be wrong`)
  }
}
function assertNotLonger(sized, actual, what) {
  if (actual > sized) {
    throw new Error(`${what}: unlock came out LONGER than the fee allowed for (${sized} → ${actual}) — the fee is short`)
  }
}

const MAX_SIG_LEN = 73

export function replicateUnlock(tx, inputIndex, opts) {
  const pre = covenantPreimage(tx, inputIndex, opts.lockBytes, opts.sourceSatoshis, EDITION_SCOPE)
  const buyerChange = enforcedSliceBytes(tx, opts.enforcedOutputCount ?? 4)
  return UnlockingScript.from(editionReplicateUnlockChunks({ buyerPubKey: opts.buyerPubKey, buyerChange, preimage: pre })).toBinary()
}

export function transferUnlock(tx, inputIndex, opts) {
  const introspection = covenantPreimage(tx, inputIndex, opts.lockBytes, opts.sourceSatoshis, EDITION_SCOPE)
  const ownerSig = opts.forSizing === true
    ? new Array(MAX_SIG_LEN).fill(0)
    : Array.from(opts.ownerKey.signInput(tx, inputIndex, Uint8Array.from(opts.lockBytes), opts.sourceSatoshis, SIGHASH.ALL_FORKID))
  const change = enforcedSliceBytes(tx, opts.enforcedOutputCount ?? 1)
  return UnlockingScript.from(editionTransferUnlockChunks({
    newOwnerPubKey: opts.newOwnerPubKey, ownerSig, change, preimage: introspection,
  })).toBinary()
}

export function burnUnlock(tx, inputIndex, opts) {
  const introspection = covenantPreimage(tx, inputIndex, opts.lockBytes, opts.sourceSatoshis, EDITION_SCOPE)
  const ownerSig = opts.forSizing === true
    ? new Array(MAX_SIG_LEN).fill(0)
    : Array.from(opts.ownerKey.signInput(tx, inputIndex, Uint8Array.from(opts.lockBytes), opts.sourceSatoshis, SIGHASH.ALL_FORKID))
  return UnlockingScript.from(editionBurnUnlockChunks({ ownerSig, preimage: introspection })).toBinary()
}

export async function buildReplicateTx(opts) {
  const bond = opts.edition.satoshis
  const lockBytes = opts.edition.lockBytes
  const holderPub = editionOwnerPubKey(lockBytes)
  const buyerPub = opts.ownerPubKey ?? pubKeyBytes(opts.buyerKey)
  const tx1RefHex = parseEditionScript(LockingScript.fromBinary(Uint8Array.from(lockBytes)))?.tx1RefHex
  const tx = new Tx(2, [], [], 0)

  tx.inputs.push({ txid: txidToWire(opts.edition.txId), vout: opts.edition.outputIndex, script: new Uint8Array(0), sequence: 0xffffffff })
  addFunding(tx, opts.funding)

  tx.outputs.push({ value: bond, script: Uint8Array.from(lockBytes) })
  tx.outputs.push({ value: bond, script: Uint8Array.from(swapEditionOwner(lockBytes, buyerPub)) })
  tx.outputs.push({ value: opts.terms.publisherFeeSats, script: Uint8Array.from(p2pkhScript(opts.terms.publisherPubKeyHash)) })
  tx.outputs.push({ value: opts.terms.holderFeeSats, script: Uint8Array.from(p2pkhScript(hash160Bytes(holderPub))) })
  if (opts.note && tx1RefHex != null && noteHasContent(opts.note)) {
    tx.outputs.push({
      value: PHARLAP_OUTPUT_SATS,
      script: Uint8Array.from(buildNoteScript(hexOf(buyerPub), { collectionRef: tx1RefHex, ...opts.note }).toBinary()),
    })
  }
  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: opts.changeAddress != null ? scriptForAddress(opts.changeAddress) : opts.buyerKey.lockingScript() })

  const unlockOpts = { buyerPubKey: buyerPub, lockBytes, sourceSatoshis: bond }
  const sizedUnlock = replicateUnlock(tx, 0, unlockOpts).length
  applyFee(tx, {
    inputValues: [bond, ...opts.funding.map(f => f.utxo.satoshis)],
    unlockingSizes: [sizedUnlock, ...opts.funding.map(() => UNLOCK_P2PKH)],
    changeVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  const finalUnlock = replicateUnlock(tx, 0, unlockOpts)
  assertExactLength(sizedUnlock, finalUnlock.length, 'replicate')
  tx.inputs[0].script = finalUnlock
  signFunding(tx, opts.buyerKey, opts.funding, 1)

  const changeSats = tx.outputs[changeVout]?.value ?? 0
  return { tx, txId: tx.txid(), holderTokenVout: 0, replicaVout: 1, changeVout: changeSats > 0 ? changeVout : null }
}

export async function buildEditionTransferTx(opts) {
  const bond = opts.edition.satoshis
  const lockBytes = opts.edition.lockBytes
  const tx1RefHex = parseEditionScript(LockingScript.fromBinary(Uint8Array.from(lockBytes)))?.tx1RefHex
  const tx = new Tx(2, [], [], 0)

  tx.inputs.push({ txid: txidToWire(opts.edition.txId), vout: opts.edition.outputIndex, script: new Uint8Array(0), sequence: 0xffffffff })
  addFunding(tx, opts.funding)

  tx.outputs.push({ value: bond, script: Uint8Array.from(swapEditionOwner(lockBytes, opts.newOwnerPubKey)) })
  tx.outputs.push({ value: 1, script: scriptForAddress(addressFromPubHex(hexOf(opts.newOwnerPubKey))) })
  if (opts.note && tx1RefHex != null && noteHasContent(opts.note)) {
    tx.outputs.push({
      value: PHARLAP_OUTPUT_SATS,
      script: Uint8Array.from(buildNoteScript(hexOf(opts.newOwnerPubKey), { collectionRef: tx1RefHex, ...opts.note }).toBinary()),
    })
  }
  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: opts.ownerKey.lockingScript() })

  const unlockOpts = { ownerKey: opts.ownerKey, newOwnerPubKey: opts.newOwnerPubKey, lockBytes, sourceSatoshis: bond }
  const sizedUnlock = transferUnlock(tx, 0, { ...unlockOpts, forSizing: true }).length
  applyFee(tx, {
    inputValues: [bond, ...opts.funding.map(f => f.utxo.satoshis)],
    unlockingSizes: [sizedUnlock, ...opts.funding.map(() => UNLOCK_P2PKH)],
    changeVout,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  const finalUnlock = transferUnlock(tx, 0, unlockOpts)
  assertNotLonger(sizedUnlock, finalUnlock.length, 'transfer')
  tx.inputs[0].script = finalUnlock
  signFunding(tx, opts.ownerKey, opts.funding, 1)

  const changeSats = tx.outputs[changeVout]?.value ?? 0
  return { tx, txId: tx.txid(), tokenVout: 0, changeVout: changeSats > 0 ? changeVout : null }
}

export async function toFundingInputs(_provider, utxos) {
  return utxos.map(u => ({ utxo: u }))
}

export async function createEdition(provider, key, params) {
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const mintCount = params.mintCount ?? 1
  const ownerPub = params.ownerPubKey ?? pubKeyBytes(key)
  const tokenSats = params.terms.tokenSats ?? PHARLAP_OUTPUT_SATS
  const stateData = params.stateData ?? []

  const templateLock = buildEditionLock({
    tx1Ref: new Array(32).fill(0), ownerPubKey: new Array(33).fill(0),
    publisherPubKeyHash: params.terms.publisherPubKeyHash, publisherFeeSats: params.terms.publisherFeeSats,
    holderFeeSats: params.terms.holderFeeSats, tokenSats,
  })

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
      storedBytes = await encryptContent(storedBytes, K)
      wrappedKey = await wrapContentKey(K, keySalt)
    }
  }
  const restrictions = RESTRICTION_REPLICABLE | (encrypt ? RESTRICTION_ENCRYPTED : 0) | (compressed ? RESTRICTION_COMPRESSED : 0)
  const template = {
    tokenName: params.tokenName,
    tokenRules: encodeTokenRules(0, 0, restrictions, 1),
    covenantScript: hexOf(templateLock.toBinary()),
    fileHash: params.file == null ? undefined : encrypt ? sha256Hex(storedBytes) : sha256Hex(params.file.bytes),
    wrappedKey,
    keySalt,
    license: params.license,
    licenseRef: params.licenseRef,
  }
  const file = params.file != null
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

  const editionBytes = 800
  const tx1Bytes = 500 + templateLock.toBinary().length
    + (file ? file.fileBytes.length : 0)
    + (params.cover ? params.cover.bytes.length : 0)
    + (params.cover != null && params.backCover ? params.backCover.bytes.length : 0)
    + (params.mockupManifest ? params.mockupManifest.length : 0)
  const tx2Bytes = 300 + mintCount * editionBytes
  const estFee = Math.ceil(((tx1Bytes + tx2Bytes) * feePerKb) / 1000)
  const target = (1 + mintCount) * tokenSats + estFee + Math.max(1000, Math.ceil(estFee * 0.2))
  const selected = selectFunding(await getSafeUtxos(provider), target)
  const funding = await toFundingInputs(provider, selected)

  const t1 = await buildTemplateTx({ key, funding, template, file, storefront, mockup: params.mockupManifest, outputSats: tokenSats, feePerKb })
  if (t1.changeVout == null) throw new Error('Insufficient funding: template tx left no change to fund the edition mint.')
  const t2Funding = [{
    utxo: { txId: t1.tx1Id, outputIndex: t1.changeVout, satoshis: t1.changeSats, script: '' },
  }]
  const t2 = await buildEditionGenesisTx({
    key, funding: t2Funding, tx1Ref: t1.tx1Id, terms: params.terms, ownerPubKey: ownerPub, mintCount, feePerKb,
  })

  if (params.confirmSpend != null && !(await params.confirmSpend(spentSats(selected, t2.changeSats)))) {
    throw new Error(SPEND_CANCELLED)
  }

  await provider.broadcast(t1.tx.hex(), { awaitSeen: true })
  provider.registerPendingTx(t1.tx1Id, selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    { outputIndex: t1.changeVout, satoshis: t1.changeSats })
  await provider.broadcast(t2.tx.hex())
  provider.registerPendingTx(t2.txId, [{ txId: t1.tx1Id, outputIndex: t1.changeVout }],
    t2.changeVout != null ? { outputIndex: t2.changeVout, satoshis: t2.changeSats } : undefined)

  const editions = t2.editionVouts.map(v => ({
    txId: t2.txId, outputIndex: v, lockHex: hexOf(Array.from(t2.tx.outputs[v].script)),
  }))
  return { collectionId: t1.tx1Id, tx1Id: t1.tx1Id, tx2Id: t2.txId, editions }
}

export async function replicateEdition(provider, buyerKey, params) {
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const lockBytes = hexBytes(params.editionLockHex)
  const sourceTx = await provider.getSourceTransaction(params.editionTxId)
  const bond = sourceTx.outputs[params.editionOutputIndex]?.value ?? PHARLAP_OUTPUT_SATS
  const edition = {
    txId: params.editionTxId, outputIndex: params.editionOutputIndex, satoshis: bond, lockBytes,
  }
  const noteSats = params.note ? PHARLAP_OUTPUT_SATS : 0
  const estFee = Math.ceil((1500 * feePerKb) / 1000)
  const target = bond + noteSats + params.terms.publisherFeeSats + params.terms.holderFeeSats + estFee + 1000
  const selected = selectFunding(await getSafeUtxos(provider), target)
  const funding = await toFundingInputs(provider, selected)

  const rep = await buildReplicateTx({ edition, terms: params.terms, buyerKey, funding, note: params.note, feePerKb })
  const repChange = rep.changeVout != null ? (rep.tx.outputs[rep.changeVout]?.value ?? 0) : 0
  if (params.confirmSpend != null && !(await params.confirmSpend(spentSats(selected, repChange)))) {
    throw new Error(SPEND_CANCELLED)
  }
  await provider.broadcast(rep.tx.hex())
  provider.registerPendingTx(rep.txId,
    [{ txId: params.editionTxId, outputIndex: params.editionOutputIndex },
      ...selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex }))],
    rep.changeVout != null ? { outputIndex: rep.changeVout, satoshis: rep.tx.outputs[rep.changeVout].value ?? 0 } : undefined)
  return {
    txId: rep.txId, replicaOutpoint: { txId: rep.txId, outputIndex: rep.replicaVout },
    lockHex: hexOf(Array.from(rep.tx.outputs[rep.replicaVout].script)),
  }
}

export function deriveVoucherKey(publisherKey, tx1RefHex, index) {
  const idx = [index & 0xff, (index >> 8) & 0xff, (index >> 16) & 0xff, (index >> 24) & 0xff]
  const seed = [...Array.from(beBytes(publisherKey.d, 32)), ...hexBytes(tx1RefHex), ...idx]
  return Signer.fromPrivateKey(Uint8Array.from(sha256Bytes(seed)))
}

export async function createGiftVouchers(provider, publisherKey, params) {
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const count = Math.max(1, Math.floor(params.count))
  const keys = Array.from({ length: count }, (_, i) => deriveVoucherKey(publisherKey, params.tx1RefHex, params.startIndex + i))
  const estFee = Math.ceil(((250 + count * 35) * feePerKb) / 1000)
  const target = count * params.fundEachSats + estFee + 500
  const selected = selectFunding(await getSafeUtxos(provider), target)
  if (selected.length === 0) throw new Error('Insufficient funds to create the gift vouchers.')
  const funding = await toFundingInputs(provider, selected)

  const tx = new Tx(1, [], [], 0)
  addFunding(tx, funding)
  for (const k of keys) {
    tx.outputs.push({ value: params.fundEachSats, script: scriptForAddress(k.address()) })
  }
  const changeVout = tx.outputs.length
  tx.outputs.push({ value: 0, script: publisherKey.lockingScript() })
  applyFee(tx, {
    inputValues: funding.map(f => f.utxo.satoshis),
    unlockingSizes: funding.map(() => UNLOCK_P2PKH),
    changeVout,
    satPerKb: feePerKb,
  })
  signFunding(tx, publisherKey, funding)
  await provider.broadcast(tx.hex())
  const txId = tx.txid()
  provider.registerPendingTx(txId, selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex })),
    (tx.outputs[changeVout]?.value ?? 0) > 0 ? { outputIndex: changeVout, satoshis: tx.outputs[changeVout].value ?? 0 } : undefined)
  return { fundingTxId: txId, voucherWifs: keys.map(k => k.toWif()) }
}

export async function scanGiftVouchers(
  provider, publisherKey, tx1RefHex, opts,
) {
  const gapLimit = opts?.gapLimit ?? 5
  const max = opts?.max ?? 1000
  const live = []
  let claimedCount = 0
  let nextIndex = 0
  let consecutiveEmpty = 0
  for (let i = 0; i < max && consecutiveEmpty < gapLimit; i++) {
    const k = deriveVoucherKey(publisherKey, tx1RefHex, i)
    const script = p2pkhScript(hash160Bytes(Array.from(k.publicKey())))
    let unspent = []
    try { unspent = await provider.getUnspentByScriptHash(wocScriptHash(script)) } catch { }
    let funded = unspent.length > 0
    if (!funded) {
      try { funded = (await provider.getAddressHistory(k.address())).length > 0 } catch { }
      if (!funded) { try { funded = (await provider.getRecentTxIdsForAddress(k.address())).length > 0 } catch { } }
    }
    if (!funded) { consecutiveEmpty++; continue }
    consecutiveEmpty = 0
    nextIndex = i + 1
    if (unspent.length > 0) live.push({ index: i, wif: k.toWif() })
    else claimedCount++
  }
  return { nextIndex, live, claimedCount }
}

export async function scanVoucherHashes(
  provider, publisherKey, tx1RefHex, opts,
) {
  const gapLimit = opts?.gapLimit ?? 5
  const max = opts?.max ?? 1000
  const hashes = new Set()
  let consecutiveEmpty = 0
  for (let i = 0; i < max && consecutiveEmpty < gapLimit; i++) {
    const k = deriveVoucherKey(publisherKey, tx1RefHex, i)
    const pkh = hash160Bytes(Array.from(k.publicKey()))
    let funded = false
    try { funded = (await provider.getUnspentByScriptHash(wocScriptHash(p2pkhScript(pkh)))).length > 0 } catch { }
    if (!funded) {
      try { funded = (await provider.getAddressHistory(k.address())).length > 0 } catch { }
      if (!funded) { try { funded = (await provider.getRecentTxIdsForAddress(k.address())).length > 0 } catch { } }
    }
    if (!funded) { consecutiveEmpty++; continue }
    consecutiveEmpty = 0
    hashes.add(hexOf(pkh).toLowerCase())
  }
  return hashes
}

export async function sweepGiftVouchers(
  provider, publisherKey, live, opts,
) {
  const tx = new Tx(1, [], [], 0)
  const spends = []
  let swept = 0
  for (const v of live) {
    const k = Signer.fromWif(v.wif)
    const script = p2pkhScript(hash160Bytes(Array.from(k.publicKey())))
    let utxos = []
    try { utxos = await provider.getUnspentByScriptHash(wocScriptHash(script)) } catch { continue }
    let any = false
    for (const u of utxos) {
      tx.inputs.push({ txid: txidToWire(u.txId), vout: u.outputIndex, script: new Uint8Array(0), sequence: 0xffffffff })
      spends.push({ key: k, satoshis: u.satoshis })
      any = true
    }
    if (any) swept++
  }
  if (spends.length === 0) return null
  tx.outputs.push({ value: 0, script: publisherKey.lockingScript() })
  applyFee(tx, {
    inputValues: spends.map(sp => sp.satoshis),
    unlockingSizes: spends.map(() => UNLOCK_P2PKH),
    changeVout: 0,
    satPerKb: opts?.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  spends.forEach((sp, i) => {
    tx.inputs[i].script = sp.key.unlockP2PKH(tx, i, sp.key.lockingScript(), sp.satoshis)
  })
  await provider.broadcast(tx.hex())
  const txId = tx.txid()
  const reclaimedSats = tx.outputs[0]?.value ?? 0
  provider.registerPendingTx(txId, [], reclaimedSats > 0 ? { outputIndex: 0, satoshis: reclaimedSats } : undefined)
  return { swept, reclaimedSats, txId }
}

export async function claimGiftEdition(provider, ownerKey, params) {
  const giftKey = Signer.fromWif(params.giftWif)
  const giftScript = p2pkhScript(hash160Bytes(Array.from(giftKey.publicKey())))
  const giftUtxos = await provider.getUnspentByScriptHash(wocScriptHash(giftScript))
  if (giftUtxos.length === 0) throw new Error('This free copy has already been claimed.')
  const funding = await toFundingInputs(provider, giftUtxos)

  const lockBytes = hexBytes(params.editionLockHex)
  const parsed = parseEditionScript(LockingScript.fromBinary(Uint8Array.from(lockBytes)))
  if (parsed == null) throw new Error('claimGiftEdition: not an edition covenant')
  const sourceTx = params.editionSourceTx ?? await provider.getSourceTransaction(params.editionTxId)
  const tokenSats = sourceTx.outputs[params.editionOutputIndex]?.value ?? PHARLAP_OUTPUT_SATS
  const edition = { txId: params.editionTxId, outputIndex: params.editionOutputIndex, satoshis: tokenSats, lockBytes }
  const ownerPub = Array.from(ownerKey.publicKey())
  const changeAddress = ownerKey.address()

  let rep
  {
    const terms = {
      publisherPubKeyHash: parsed.terms.publisherPubKeyHash, publisherFeeSats: parsed.terms.publisherFeeSats,
      holderFeeSats: parsed.terms.holderFeeSats, tokenSats,
    }
    rep = await buildReplicateTx({ edition, terms, buyerKey: giftKey, funding, ownerPubKey: ownerPub, changeAddress, note: params.note, feePerKb: params.feePerKb })
  }
  await provider.broadcast(rep.tx.hex())
  provider.registerPendingTx(rep.txId,
    [{ txId: params.editionTxId, outputIndex: params.editionOutputIndex }, ...giftUtxos.map(u => ({ txId: u.txId, outputIndex: u.outputIndex }))],
    rep.changeVout != null ? { outputIndex: rep.changeVout, satoshis: rep.tx.outputs[rep.changeVout].value ?? 0 } : undefined)
  return {
    txId: rep.txId, replicaOutpoint: { txId: rep.txId, outputIndex: rep.replicaVout },
    lockHex: hexOf(Array.from(rep.tx.outputs[rep.replicaVout].script)),
  }
}

export async function transferEdition(provider, ownerKey, params) {
  const feePerKb = params.feePerKb ?? DEFAULT_FEE_PER_KB
  const lockBytes = hexBytes(params.editionLockHex)
  const sourceTx = await provider.getSourceTransaction(params.editionTxId)
  const bond = sourceTx.outputs[params.editionOutputIndex]?.value ?? PHARLAP_OUTPUT_SATS
  const edition = {
    txId: params.editionTxId, outputIndex: params.editionOutputIndex, satoshis: bond, lockBytes,
  }
  const noteSats = params.note ? PHARLAP_OUTPUT_SATS : 0
  const estFee = Math.ceil((1500 * feePerKb) / 1000)
  const selected = selectFunding(await getSafeUtxos(provider), noteSats + estFee + 1000)
  const funding = await toFundingInputs(provider, selected)

  const xfer = await buildEditionTransferTx({
    edition, ownerKey, newOwnerPubKey: params.newOwnerPubKey, funding, note: params.note, feePerKb,
  })
  await provider.broadcast(xfer.tx.hex())
  provider.registerPendingTx(xfer.txId,
    [{ txId: params.editionTxId, outputIndex: params.editionOutputIndex },
      ...selected.map(u => ({ txId: u.txId, outputIndex: u.outputIndex }))],
    xfer.changeVout != null ? { outputIndex: xfer.changeVout, satoshis: xfer.tx.outputs[xfer.changeVout].value ?? 0 } : undefined)
  return {
    txId: xfer.txId, tokenOutpoint: { txId: xfer.txId, outputIndex: xfer.tokenVout },
    lockHex: hexOf(Array.from(xfer.tx.outputs[xfer.tokenVout].script)),
  }
}

export async function buildEditionBurnTx(opts) {
  const lockBytes = opts.edition.lockBytes
  const reclaimAddress = opts.reclaimAddress ?? opts.ownerKey.address()
  const tx = new Tx(2, [], [], 0)
  tx.inputs.push({ txid: txidToWire(opts.edition.txId), vout: opts.edition.outputIndex, script: new Uint8Array(0), sequence: 0xffffffff })
  tx.outputs.push({ value: 0, script: scriptForAddress(reclaimAddress) })

  const unlockOpts = { ownerKey: opts.ownerKey, lockBytes, sourceSatoshis: opts.edition.satoshis }
  const sizedUnlock = burnUnlock(tx, 0, { ...unlockOpts, forSizing: true }).length
  applyFee(tx, {
    inputValues: [opts.edition.satoshis],
    unlockingSizes: [sizedUnlock],
    changeVout: 0,
    satPerKb: opts.feePerKb ?? DEFAULT_FEE_PER_KB,
  })
  const finalUnlock = burnUnlock(tx, 0, unlockOpts)
  assertNotLonger(sizedUnlock, finalUnlock.length, 'burn')
  tx.inputs[0].script = finalUnlock

  return { tx, txId: tx.txid(), reclaimVout: 0, reclaimSats: tx.outputs[0]?.value ?? 0 }
}

export async function burnEdition(provider, ownerKey, params) {
  const lockBytes = hexBytes(params.editionLockHex)
  const sourceTx = await provider.getSourceTransaction(params.editionTxId)
  const satoshis = sourceTx.outputs[params.editionOutputIndex]?.value ?? 0
  const edition = { txId: params.editionTxId, outputIndex: params.editionOutputIndex, satoshis, lockBytes }
  const r = await buildEditionBurnTx({ edition, ownerKey, feePerKb: params.feePerKb })
  await provider.broadcast(r.tx.hex())
  provider.registerPendingTx(r.txId, [{ txId: params.editionTxId, outputIndex: params.editionOutputIndex }],
    r.reclaimSats > 0 ? { outputIndex: r.reclaimVout, satoshis: r.reclaimSats } : undefined)
  return { txId: r.txId, reclaimSats: r.reclaimSats }
}

export function wocScriptHash(scriptBytes) {
  return hexOf(sha256Bytes(scriptBytes).reverse())
}

export async function resolveHolderEdition(provider, params) {
  const tx1Ref = hexBytes(params.tx1RefHex)
  const ownerPub = hexBytes(params.holderPubKeyHex)
  const templateBytes = hexBytes(params.templateCovenantHex)
  const lockBytes = buildHolderEditionScript(templateBytes, tx1Ref, ownerPub)
  const lockScript = LockingScript.fromHex(hexOf(lockBytes))
  const ed = parseEditionScript(lockScript)
  if (ed == null) throw new Error('resolveHolderEdition: reconstructed script is not a valid edition')

  const unspent = await provider.getUnspentByScriptHash(wocScriptHash(lockBytes))
  if (unspent.length === 0) return null
  const pick = unspent.find(u => u.satoshis > 0) ?? unspent[0]
  return {
    txId: pick.txId, outputIndex: pick.outputIndex, lockHex: hexOf(lockBytes),
    terms: { publisherPubKeyHash: ed.terms.publisherPubKeyHash, publisherFeeSats: ed.terms.publisherFeeSats, holderFeeSats: ed.terms.holderFeeSats, tokenSats: pick.satoshis },
    tokenSats: pick.satoshis,
  }
}

export async function scanIncomingEditions(
  provider, pubKeyHex,
  cache,
  extraTxIds = [],
) {
  const mine = pubKeyHex.toLowerCase()

  const cand = new Map(extraTxIds.map(id => [id, 0]))
  try { for (const e of await provider.getFullAddressHistory()) cand.set(e.txId, e.blockHeight || 0) } catch { }
  try { for (const u of await provider.getUtxos()) if (!cand.has(u.txId)) cand.set(u.txId, u.height || 0) } catch { }
  const scripts = new Map(cache?.scripts ?? [])
  const since = cache?.sinceHeight ?? -1
  const alwaysRead = new Set(extraTxIds)
  const spentByRead = new Set()
  for (const [txId, h] of cand) {
    if (!alwaysRead.has(txId) && since >= 0 && h > 0 && h <= since) continue
    let tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    for (const i of tx.inputs) spentByRead.add(`${wireToTxid(i.txid)}:${i.vout}`)
    for (const o of tx.outputs) {
      const ed = parseEditionScript(LockingScript.fromBinary(o.script))
      if (ed == null || ed.ownerPubKeyHex.toLowerCase() !== mine) continue
      scripts.set(hexOf(Array.from(o.script)), ed.tx1RefHex)
    }
  }
  if (cache) for (const [k, v] of scripts) cache.scripts.set(k, v)

  const found = []
  const seen = new Set()
  const hashOf = new Map([...scripts.keys()].map(lockHex => [lockHex, wocScriptHash(hexBytes(lockHex))]))
  let bulk = null
  if (typeof provider.getUnspentByScriptHashes === 'function') {
    try { bulk = await provider.getUnspentByScriptHashes([...hashOf.values()]) } catch { bulk = null }
  }
  for (const [lockHex, tx1RefHex] of scripts) {
    const hash = hashOf.get(lockHex)
    let unspent
    if (bulk != null) { const u = bulk.get(hash); if (u == null) continue; unspent = u }
    else { try { unspent = await provider.getUnspentByScriptHash(hash) } catch { continue } }
    const ed = parseEditionScript(LockingScript.fromHex(lockHex))
    if (ed == null) continue
    for (const u of unspent) {
      const key = `${u.txId}:${u.outputIndex}`
      if (seen.has(key) || spentByRead.has(key)) continue
      seen.add(key)
      let note = null
      try { note = readNoteFromTx(await provider.getSourceTransaction(u.txId), tx1RefHex) } catch { }
      found.push({
        txId: u.txId, outputIndex: u.outputIndex, lockHex, tx1RefHex,
        terms: { publisherPubKeyHash: ed.terms.publisherPubKeyHash, publisherFeeSats: ed.terms.publisherFeeSats, holderFeeSats: ed.terms.holderFeeSats, tokenSats: u.satoshis ?? PHARLAP_OUTPUT_SATS },
        ...(note ? { sellerNote: note } : {}),
        ...(u.height ? { height: u.height } : {}),
      })
    }
  }
  return found
}

export async function scanCollectionBuyers(
  provider,
  params,
) {
  const want = params.publisherPubKeyHashHex.toLowerCase()
  const cap = params.maxTxs ?? 400
  const candidates = new Map()
  let capped = false
  try {
    let hist = await provider.getAddressHistory()
    if (hist.length > cap) { capped = true; hist = hist.slice(hist.length - cap) }
    for (const h of hist) candidates.set(h.txId, h.blockHeight || 0)
  } catch { }
  try {
    for (const u of await provider.getUtxos()) if (!candidates.has(u.txId)) candidates.set(u.txId, 0)
  } catch { }
  const entries = [...candidates.entries()]
  const byBuyer = new Map()
  let done = 0
  for (const [txId, blockHeight] of entries) {
    params.onProgress?.(done, entries.length); done++
    let tx
    try { tx = await provider.getSourceTransaction(txId) } catch { continue }
    const replica = tx.outputs[1]
    if (replica == null) continue
    const ed = parseEditionScript(LockingScript.fromBinary(replica.script))
    if (ed == null || ed.tx1RefHex !== params.collectionId) continue
    if (hexOf(ed.terms.publisherPubKeyHash).toLowerCase() !== want) continue
    const buyerBytes = hexBytes(ed.ownerPubKeyHex)
    if (hexOf(hash160Bytes(buyerBytes)).toLowerCase() === want) continue
    const k = ed.ownerPubKeyHex.toLowerCase()
    const h = blockHeight || 0
    const rec = byBuyer.get(k)
    if (rec != null) { rec.count++; if (h) { rec.lastHeight = Math.max(rec.lastHeight, h); rec.firstHeight = rec.firstHeight ? Math.min(rec.firstHeight, h) : h } }
    else byBuyer.set(k, { pubKeyHex: ed.ownerPubKeyHex, count: 1, firstHeight: h, lastHeight: h })
  }
  params.onProgress?.(entries.length, entries.length)
  const buyers = [...byBuyer.values()].sort((a, b) => (b.lastHeight || Infinity) - (a.lastHeight || Infinity))
  return { buyers, scanned: entries.length, capped }
}

export async function scanMySales(
  provider,
  params,
) {
  const me = params.myPubKeyHex.toLowerCase()
  const myHash = params.myHash.toLowerCase()
  const cap = params.maxTxs ?? 500
  const since = params.sinceHeight ?? -1
  const candidates = new Map()
  let capped = false
  try {
    let hist = await provider.getAddressHistory()
    if (hist.length > cap) { capped = true; hist = hist.slice(hist.length - cap) }
    for (const h of hist) candidates.set(h.txId, h.blockHeight || 0)
  } catch { }
  try { for (const u of await provider.getUtxos()) if (!candidates.has(u.txId)) candidates.set(u.txId, 0) } catch { }
  const entries = [...candidates.entries()].filter(([, h]) => !(since >= 0 && h > 0 && h <= since))

  const OUT_CAP = 256 * 1024
  const sales = []
  let done = 0
  for (const [txId, blockHeight] of entries) {
    params.onProgress?.(done, entries.length); done++
    let hex1
    try { hex1 = await provider.getOutputScriptHexCapped(txId, 1, OUT_CAP) } catch { continue }
    if (hex1 == null || hex1 === 'oversized') continue
    let ed
    try { ed = parseEditionScript(LockingScript.fromHex(hex1)) } catch { continue }
    if (ed == null) continue
    const buyerHex = ed.ownerPubKeyHex
    const cid = ed.tx1RefHex
    const publisherHash = hexOf(ed.terms.publisherPubKeyHash).toLowerCase()
    if (hexOf(hash160Bytes(hexBytes(buyerHex))).toLowerCase() === publisherHash) continue
    const iPublish = publisherHash === myHash
    let iSourced = false
    try {
      const hex0 = await provider.getOutputScriptHexCapped(txId, 0, OUT_CAP)
      if (hex0 != null && hex0 !== 'oversized') { const src = parseEditionScript(LockingScript.fromHex(hex0)); if (src != null && src.ownerPubKeyHex.toLowerCase() === me) iSourced = true }
    } catch { }
    if (!iPublish && !iSourced) continue
    const pubCut = ed.terms.publisherFeeSats
    const holdCut = ed.terms.holderFeeSats
    sales.push({ txId, collectionId: cid, buyerPubKeyHex: buyerHex, height: blockHeight || 0, time: 0,
      publisherFeeSats: iPublish ? pubCut : 0, holderFeeSats: iSourced ? holdCut : 0 })
  }
  params.onProgress?.(entries.length, entries.length)

  await Promise.all(sales.map(async s => { try { const c = await provider.getTxConfirmation(s.txId); if (c?.time) s.time = c.time } catch { } }))

  const creator = new Map()
  const reseller = new Map()
  const creatorEarn = new Map()
  const resellerEarn = new Map()
  const events = []
  const bump = (g, cid, buyerHex, h) => {
    let m = g.get(cid); if (m == null) { m = new Map(); g.set(cid, m) }
    const k = buyerHex.toLowerCase(); const rec = m.get(k)
    if (rec != null) { rec.count++; if (h) { rec.lastHeight = Math.max(rec.lastHeight, h); rec.firstHeight = rec.firstHeight ? Math.min(rec.firstHeight, h) : h } }
    else m.set(k, { pubKeyHex: buyerHex, count: 1, firstHeight: h, lastHeight: h })
  }
  const addEarn = (m, cid, v) => { m.set(cid, (m.get(cid) ?? 0) + v) }
  for (const s of sales) {
    if (s.publisherFeeSats > 0) { bump(creator, s.collectionId, s.buyerPubKeyHex, s.height); addEarn(creatorEarn, s.collectionId, s.publisherFeeSats); events.push({ collectionId: s.collectionId, role: 'creator', feeSats: s.publisherFeeSats, height: s.height, buyerPubKeyHex: s.buyerPubKeyHex }) }
    if (s.holderFeeSats > 0) { bump(reseller, s.collectionId, s.buyerPubKeyHex, s.height); addEarn(resellerEarn, s.collectionId, s.holderFeeSats); events.push({ collectionId: s.collectionId, role: 'reseller', feeSats: s.holderFeeSats, height: s.height, buyerPubKeyHex: s.buyerPubKeyHex }) }
  }
  const toGroups = (g, earn) =>
    [...g.entries()].map(([collectionId, m]) => {
      const buyers = [...m.values()].sort((a, b) => (b.lastHeight || Infinity) - (a.lastHeight || Infinity))
      return { collectionId, sales: buyers.reduce((s, b) => s + b.count, 0), earnings: earn.get(collectionId) ?? 0, buyers }
    }).sort((a, b) => b.sales - a.sales)
  return { sales, asCreator: toGroups(creator, creatorEarn), asReseller: toGroups(reseller, resellerEarn), events, scanned: entries.length, capped }
}
