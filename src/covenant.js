// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { OP, LockingScript as CoreLockingScript } from '../impl/js/script.mjs'
import { hexOf } from './bytes.js'

const LockingScript = class {
  static from(chunks) {
    return new CoreLockingScript(chunks.map(c => ({ op: c.op, data: c.data === undefined ? undefined : Uint8Array.from(c.data) })))
  }
}
import { pushTxVerifyOps, pushData, pushTxConstants } from './pushtx.js'

const op = (code) => ({ op: code })

export function u64le(n) {
  const out = []
  let v = n
  for (let i = 0; i < 8; i++) { out.push(v & 0xff); v = Math.floor(v / 256) }
  return out
}

export function numLE(n) {
  if (n === 0) return []
  const out = []
  let v = n
  while (v > 0) { out.push(v & 0xff); v = Math.floor(v / 256) }
  if ((out[out.length - 1] & 0x80) !== 0) out.push(0x00)
  return out
}

export function varInt(n) {
  if (n < 0xfd) return [n]
  if (n <= 0xffff) return [0xfd, n & 0xff, (n >> 8) & 0xff]
  if (n <= 0xffffffff) return [0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
  throw new Error('varInt: value too large')
}

export function serializeOutput(satoshis, scriptBytes) {
  return [...u64le(satoshis), ...varInt(scriptBytes.length), ...scriptBytes]
}

export function p2pkhScript(hash20) {
  return [0x76, 0xa9, 0x14, ...hash20, 0x88, 0xac]
}

export function extractHashOutputsOps() {
  return [
    op(OP.OP_SIZE), pushData([40]), op(OP.OP_SUB), op(OP.OP_SPLIT), op(OP.OP_NIP),
    pushData([32]), op(OP.OP_SPLIT), op(OP.OP_DROP),
  ]
}

export function extractScriptCodeFieldOps() {
  return [
    pushData([104]), op(OP.OP_SPLIT), op(OP.OP_NIP),
    op(OP.OP_SIZE), pushData([52]), op(OP.OP_SUB), op(OP.OP_SPLIT), op(OP.OP_DROP),
  ]
}

export function selfReplicateCovenantOps(tokenSats = 1, c = pushTxConstants()) {
  return [
    ...pushTxVerifyOps(c),
    op(OP.OP_DUP),
    ...extractHashOutputsOps(),
    op(OP.OP_SWAP),
    ...extractScriptCodeFieldOps(),
    pushData(u64le(tokenSats)), op(OP.OP_SWAP), op(OP.OP_CAT),
    op(OP.OP_ROT), op(OP.OP_CAT),
    op(OP.OP_HASH256), op(OP.OP_EQUAL),
  ]
}

export function swapPubkeyOut0CovenantOps(fieldPubkeyOffset, tokenSats = 1, c = pushTxConstants()) {
  return [
    ...pushTxVerifyOps(c),
    op(OP.OP_DUP),
    ...extractHashOutputsOps(),
    op(OP.OP_SWAP),
    ...extractScriptCodeFieldOps(),
    pushData(numLE(fieldPubkeyOffset)), op(OP.OP_SPLIT),
    pushData([33]), op(OP.OP_SPLIT), op(OP.OP_NIP),
    op(OP.OP_TOALTSTACK),
    op(OP.OP_2), op(OP.OP_ROLL),
    op(OP.OP_CAT),
    op(OP.OP_FROMALTSTACK), op(OP.OP_CAT),
    pushData(u64le(tokenSats)), op(OP.OP_SWAP), op(OP.OP_CAT),
    op(OP.OP_ROT), op(OP.OP_CAT),
    op(OP.OP_HASH256), op(OP.OP_EQUAL),
  ]
}

export function covenantPrefixOps(fieldPubkeyOffset, c = pushTxConstants()) {
  return [
    ...pushTxVerifyOps(c),
    op(OP.OP_DUP),
    ...extractHashOutputsOps(), op(OP.OP_TOALTSTACK),
    ...extractScriptCodeFieldOps(),
    pushData(numLE(fieldPubkeyOffset)), op(OP.OP_SPLIT),
    pushData([33]), op(OP.OP_SPLIT),
  ]
}

export function replicateTailOps(p) {
  const VALUE1 = u64le(p.tokenSats ?? 1)
  const OUT2 = serializeOutput(p.publisherFeeSats, p2pkhScript(p.publisherPubKeyHash))
  const C3pre = [...u64le(p.holderFeeSats), 0x19, 0x76, 0xa9, 0x14]
  const C3suf = [0x88, 0xac]
  return [
    pushData(VALUE1),
    pushData([3]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([2]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([1]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData(VALUE1),
    pushData([4]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([5]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([2]), op(OP.OP_PICK), op(OP.OP_CAT),
    op(OP.OP_CAT),
    pushData(OUT2), op(OP.OP_CAT),
    pushData(C3pre), op(OP.OP_CAT),
    pushData([2]), op(OP.OP_PICK), op(OP.OP_HASH160), op(OP.OP_CAT),
    pushData(C3suf), op(OP.OP_CAT),
    pushData([5]), op(OP.OP_ROLL), op(OP.OP_CAT),
    op(OP.OP_TOALTSTACK), op(OP.OP_2DROP), op(OP.OP_2DROP),
    op(OP.OP_FROMALTSTACK), op(OP.OP_HASH256),
    op(OP.OP_FROMALTSTACK), op(OP.OP_EQUAL),
  ]
}

export function transferTailOps(p) {
  const VALUE1 = u64le(p.tokenSats ?? 1)
  return [
    pushData([1]), op(OP.OP_PICK),
    pushData([4]), op(OP.OP_PICK),
    op(OP.OP_SWAP), op(OP.OP_CHECKSIGVERIFY),
    pushData(VALUE1),
    pushData([3]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([5]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([1]), op(OP.OP_PICK), op(OP.OP_CAT),
    pushData([6]), op(OP.OP_ROLL), op(OP.OP_CAT),
    op(OP.OP_TOALTSTACK), op(OP.OP_2DROP), op(OP.OP_2DROP), op(OP.OP_DROP),
    op(OP.OP_FROMALTSTACK), op(OP.OP_HASH256),
    op(OP.OP_FROMALTSTACK), op(OP.OP_EQUAL),
  ]
}

export function burnTailOps() {
  return [
    pushData([1]), op(OP.OP_PICK),
    pushData([4]), op(OP.OP_PICK),
    op(OP.OP_SWAP), op(OP.OP_CHECKSIGVERIFY),
    op(OP.OP_2DROP), op(OP.OP_2DROP),
    op(OP.OP_FROMALTSTACK), op(OP.OP_DROP),
    op(OP.OP_1),
  ]
}

export function replicateBranchOps(p) {
  return [...covenantPrefixOps(p.fieldPubkeyOffset, p.c ?? pushTxConstants()), ...replicateTailOps(p)]
}

export const EDITION_SCOPE = 0xc1
export const RECORD_EDITION = 0x05

function serializedPushLen(data) {
  if (data.length < 76) return 1 + data.length
  if (data.length < 256) return 2 + data.length
  if (data.length < 65536) return 3 + data.length
  return 5 + data.length
}

function editionFieldChunks(f) {
  return [
    pushData(f.prefix ?? [0x50]),
    pushData(f.version ?? [0x03]),
    pushData([RECORD_EDITION]),
    pushData(f.tx1Ref),
    pushData(f.ownerPubKey),
  ]
}

export function editionLockOps(p) {
  const c = p.c ?? pushTxConstants(EDITION_SCOPE)
  return [
    ...editionFieldChunks(p),
    op(OP.OP_2DROP), op(OP.OP_2DROP), op(OP.OP_DROP),
    ...covenantPrefixOps(p.fieldPubkeyOffset, c),
    pushData([3]), op(OP.OP_ROLL),
    op(OP.OP_DUP), op(OP.OP_2), op(OP.OP_NUMEQUAL), op(OP.OP_IF),
    op(OP.OP_DROP),
    ...burnTailOps(),
    op(OP.OP_ELSE),
    op(OP.OP_IF),
    ...transferTailOps({ tokenSats: p.tokenSats }),
    op(OP.OP_ELSE),
    ...replicateTailOps(p),
    op(OP.OP_ENDIF),
    op(OP.OP_ENDIF),
  ]
}

export function buildEditionLock(p) {
  const before = [p.prefix ?? [0x50], p.version ?? [0x03], [RECORD_EDITION], p.tx1Ref]
  const O = before.reduce((s, f) => s + serializedPushLen(f), 0) + 1
  const probeLen = LockingScript.from(editionLockOps({ ...p, fieldPubkeyOffset: 1 })).toBinary().length
  const varIntSize = probeLen < 253 ? 1 : probeLen < 65536 ? 3 : 5
  return LockingScript.from(editionLockOps({ ...p, fieldPubkeyOffset: varIntSize + O }))
}

export function editionSupportsBurn(lockBytes) {
  const chunks = CoreLockingScript.fromBinary(Uint8Array.from(lockBytes)).chunks
  return chunks != null && chunks.some((c) => c.op === OP.OP_NUMEQUAL)
}

export const EDITION_OWNER_SCRIPT_OFFSET = 40

export function swapEditionOwner(lockBytes, newOwnerPub) {
  if (newOwnerPub.length !== 33) throw new Error('swapEditionOwner: owner pubkey must be 33 bytes')
  const out = [...lockBytes]
  for (let i = 0; i < 33; i++) out[EDITION_OWNER_SCRIPT_OFFSET + i] = newOwnerPub[i]
  return out
}

export const EDITION_TX1REF_SCRIPT_OFFSET = 7

export function buildHolderEditionScript(templateCovenantBytes, tx1Ref, ownerPub) {
  if (tx1Ref.length !== 32) throw new Error('buildHolderEditionScript: tx1Ref must be 32 bytes')
  if (ownerPub.length !== 33) throw new Error('buildHolderEditionScript: owner pubkey must be 33 bytes')
  const out = [...templateCovenantBytes]
  for (let i = 0; i < 32; i++) out[EDITION_TX1REF_SCRIPT_OFFSET + i] = tx1Ref[i]
  for (let i = 0; i < 33; i++) out[EDITION_OWNER_SCRIPT_OFFSET + i] = ownerPub[i]
  return out
}

export function editionOwnerPubKey(lockBytes) {
  return lockBytes.slice(EDITION_OWNER_SCRIPT_OFFSET, EDITION_OWNER_SCRIPT_OFFSET + 33)
}

function chunkBytes(c) {
  if (c.data != null && c.data.length > 0) return c.data
  if (c.op === OP.OP_0) return []
  if (c.op >= 0x51 && c.op <= 0x60) return [c.op - 0x50]
  if (c.op === OP.OP_1NEGATE) return [0x81]
  return null
}
function leToNum(b) {
  let n = 0
  for (let i = b.length - 1; i >= 0; i--) n = n * 256 + b[i]
  return n
}

export function parseEditionScript(script) {
  const ch = script.chunks
  if (ch == null || ch.length < 8) return null
  const P = chunkBytes(ch[0]); const ver = chunkBytes(ch[1]); const rec = chunkBytes(ch[2])
  const tx1Ref = chunkBytes(ch[3]); const ownerPub = chunkBytes(ch[4])
  if (P == null || P.length !== 1 || P[0] !== 0x50) return null
  if (ver == null || ver[0] !== 0x03) return null
  if (rec == null || rec[0] !== RECORD_EDITION) return null
  if (tx1Ref == null || tx1Ref.length !== 32) return null
  if (ownerPub == null || ownerPub.length !== 33) return null
  if (ch[5].op !== OP.OP_2DROP || ch[6].op !== OP.OP_2DROP || ch[7].op !== OP.OP_DROP) return null
  let publisherFeeSats = 0, holderFeeSats = 0
  let publisherPubKeyHash = null
  const isP2pkhValue = (d) => d[8] === 0x19 && d[9] === 0x76 && d[10] === 0xa9 && d[11] === 0x14
  for (const c of ch) {
    const d = chunkBytes(c)
    if (d == null) continue
    if (d.length === 34 && isP2pkhValue(d)) { publisherFeeSats = leToNum(d.slice(0, 8)); publisherPubKeyHash = d.slice(12, 32) }
    else if (d.length === 12 && isP2pkhValue(d)) { holderFeeSats = leToNum(d.slice(0, 8)) }
  }
  if (publisherPubKeyHash == null) return null
  return {
    tx1RefHex: hexOf(tx1Ref), ownerPubKeyHex: hexOf(ownerPub),
    stateDataHex: '', terms: { publisherPubKeyHash, publisherFeeSats, holderFeeSats },
  }
}

export function editionReplicateUnlockChunks(p) {
  return [pushData(p.buyerChange), pushData(p.buyerPubKey), op(OP.OP_0), pushData(p.preimage)]
}

export function editionTransferUnlockChunks(p) {
  return [pushData(p.change), pushData(p.newOwnerPubKey), pushData(p.ownerSig), op(OP.OP_1), pushData(p.preimage)]
}

export function editionBurnUnlockChunks(p) {
  return [pushData(p.ownerSig), op(OP.OP_2), pushData(p.preimage)]
}

export function outputPrefixCovenantOps(enforcedPrefixBytes, c = pushTxConstants()) {
  return [
    ...pushTxVerifyOps(c),
    ...extractHashOutputsOps(),
    op(OP.OP_SWAP),
    pushData(enforcedPrefixBytes),
    op(OP.OP_SWAP), op(OP.OP_CAT),
    op(OP.OP_HASH256),
    op(OP.OP_EQUAL),
  ]
}
