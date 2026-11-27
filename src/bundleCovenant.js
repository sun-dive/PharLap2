// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { OP, LockingScript as CoreLockingScript } from '../impl/js/script.mjs'
import { pushData, pushTxConstants } from './pushtx.js'
import { covenantPrefixOps, serializeOutput, p2pkhScript, u64le, EDITION_SCOPE } from './covenant.js'

const LockingScript = {
  from: (chunks) =>
    new CoreLockingScript(chunks.map(c => ({ op: c.op, data: c.data === undefined ? undefined : Uint8Array.from(c.data) }))),
}

const op = (code) => ({ op: code })

export const RECORD_BUNDLE = 0x0b
export const BUNDLE_OWNER_OFFSET = 40

export function bundleTailOps(payees, tokenSats = 1) {
  const VALUE1 = u64le(tokenSats)
  const feeCats = []
  for (const pe of payees) feeCats.push(pushData(serializeOutput(pe.feeSats, p2pkhScript(pe.pubKeyHash))), op(OP.OP_CAT))
  return [
    pushData([1]), op(OP.OP_PICK),
    pushData([4]), op(OP.OP_PICK),
    op(OP.OP_SWAP), op(OP.OP_CHECKSIGVERIFY),
    pushData(VALUE1),
    pushData([3]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([5]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([1]), op(OP.OP_PICK), op(OP.OP_CAT),
    ...feeCats,
    pushData([6]), op(OP.OP_ROLL), op(OP.OP_CAT),
    op(OP.OP_TOALTSTACK), op(OP.OP_2DROP), op(OP.OP_2DROP), op(OP.OP_DROP),
    op(OP.OP_FROMALTSTACK), op(OP.OP_HASH256),
    op(OP.OP_FROMALTSTACK), op(OP.OP_EQUAL),
  ]
}

export function bundleLockOps(p) {
  const c = p.c ?? pushTxConstants(EDITION_SCOPE)
  return [
    pushData([0x50]), pushData([0x03]), pushData([RECORD_BUNDLE]), pushData(p.manifestRef), pushData(p.ownerPubKey),
    op(OP.OP_2DROP), op(OP.OP_2DROP), op(OP.OP_DROP),
    ...covenantPrefixOps(p.fieldPubkeyOffset, c),
    ...bundleTailOps(p.payees, p.tokenSats),
  ]
}

export function buildBundleLock(p) {
  const probeLen = LockingScript.from(bundleLockOps({ ...p, fieldPubkeyOffset: 1 })).toBinary().length
  const varIntSize = probeLen < 253 ? 1 : probeLen < 65536 ? 3 : 5
  return LockingScript.from(bundleLockOps({ ...p, fieldPubkeyOffset: varIntSize + BUNDLE_OWNER_OFFSET }))
}

export function bundleTransferUnlockChunks(p) {
  return [pushData(p.change), pushData(p.newOwnerPubKey), pushData(p.ownerSig), pushData(p.preimage)]
}

export function swapBundleOwner(lockBytes, newOwnerPub) {
  const out = [...lockBytes]
  for (let i = 0; i < 33; i++) out[BUNDLE_OWNER_OFFSET + i] = newOwnerPub[i]
  return out
}
