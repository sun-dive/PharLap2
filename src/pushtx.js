// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { OP as OPCODES } from '../impl/js/script.mjs'
import { N, mul, serP, invN, mod } from '../impl/js/secp256k1.mjs'
import { preimage as corePreimage } from '../impl/js/transaction.mjs'
import { Tx } from '../impl/js/transaction.mjs'
import { fromHex, reversed } from '../impl/js/bytes.mjs'

const bytesBE = (v) => {
  if (v === 0n) return []
  let h = v.toString(16)
  if (h.length & 1) h = '0' + h
  return Array.from(fromHex(h))
}

const SIGHASH_ALL_FORKID = 0x41

const A_HEX = '11'.repeat(32)
const K_HEX = '22'.repeat(32)

function toScriptNumLE(bn) {
  if (bn === 0n) return []
  const le = bytesBE(bn).reverse()
  if ((le[le.length - 1] & 0x80) !== 0) le.push(0x00)
  return le
}

function minimalBE(bn) {
  const be = bytesBE(bn)
  if ((be[0] & 0x80) !== 0) be.unshift(0x00)
  return be
}

export function pushTxConstants(scope = SIGHASH_ALL_FORKID) {
  const n = N
  const a = BigInt('0x' + A_HEX)
  const k = BigInt('0x' + K_HEX)
  const r = mod(mul(k).x, n)
  const rBE = minimalBE(r)
  return {
    Qbytes: Array.from(serP(mul(a))),
    rDerInt: [0x02, rBE.length, ...rBE],
    raLE: toScriptNumLE(mod(r * a, n)),
    nLE: toScriptNumLE(n),
    kInvLE: toScriptNumLE(invN(k)),
    scope,
  }
}

const op = (code) => ({ op: code })
function push(data) {
  if (data.length < 76) return { op: data.length, data }
  if (data.length < 256) return { op: OPCODES.OP_PUSHDATA1, data }
  if (data.length < 65536) return { op: OPCODES.OP_PUSHDATA2, data }
  return { op: OPCODES.OP_PUSHDATA4, data }
}

export function reverseBytesOps(len) {
  const ops = []
  for (let i = 0; i < len - 1; i++) ops.push(op(OPCODES.OP_1), op(OPCODES.OP_SPLIT))
  for (let i = 0; i < len - 1; i++) ops.push(op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT))
  return ops
}

export function deriveSigOps(c) {
  return [
    op(OPCODES.OP_HASH256), ...reverseBytesOps(32), push([0x00]), op(OPCODES.OP_CAT), op(OPCODES.OP_BIN2NUM),
    push(c.raLE), op(OPCODES.OP_ADD), push(c.nLE), op(OPCODES.OP_MOD),
    push(c.kInvLE), op(OPCODES.OP_MUL), push(c.nLE), op(OPCODES.OP_MOD),
    op(OPCODES.OP_SIZE), push([33]), op(OPCODES.OP_SWAP), op(OPCODES.OP_SUB), op(OPCODES.OP_TOALTSTACK),
    push([33]), op(OPCODES.OP_NUM2BIN), ...reverseBytesOps(33),
    op(OPCODES.OP_FROMALTSTACK), op(OPCODES.OP_SPLIT), op(OPCODES.OP_NIP),
    op(OPCODES.OP_SIZE), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),
    push([0x02]), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),
    push(c.rDerInt), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),
    op(OPCODES.OP_SIZE), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),
    push([0x30]), op(OPCODES.OP_SWAP), op(OPCODES.OP_CAT),
    push([c.scope]), op(OPCODES.OP_CAT),
  ]
}

export function pushTxCheckOps(c = pushTxConstants()) {
  return [...deriveSigOps(c), push(c.Qbytes), op(OPCODES.OP_CHECKSIG)]
}

export function pushTxVerifyOps(c = pushTxConstants()) {
  return [
    op(OPCODES.OP_DUP),
    ...deriveSigOps(c),
    push(c.Qbytes), op(OPCODES.OP_CHECKSIG), op(OPCODES.OP_VERIFY),
  ]
}

export function pushTxPreimage(p) {
  const others = (p.otherInputs ?? [])
  const asInput = (o) => ({
    txid: reversed(fromHex(String(o.sourceTXID ?? o.sourceTxid ?? '00'.repeat(32)))),
    vout: o.sourceOutputIndex ?? 0,
    script: new Uint8Array(0),
    sequence: o.sequence ?? 0xffffffff,
  })
  const signed = {
    txid: reversed(fromHex(p.sourceTXID)),
    vout: p.sourceOutputIndex,
    script: new Uint8Array(0),
    sequence: p.inputSequence,
  }
  const inputs = others.map(asInput)
  inputs.splice(p.inputIndex, 0, signed)

  const outs = (p.outputs)
    .map(o => ({
      value: o.satoshis ?? o.value ?? 0,
      script: o.script instanceof Uint8Array
        ? o.script
        : Uint8Array.from((o.lockingScript).toBinary()),
    }))

  const sub = p.subscript
  const subBytes = sub.toBinary()
  const scriptCode = subBytes instanceof Uint8Array ? subBytes : Uint8Array.from(subBytes)

  const tx = new Tx(p.transactionVersion, inputs, outs, p.lockTime)
  return Array.from(corePreimage(tx, p.inputIndex, scriptCode, p.sourceSatoshis, p.scope ?? SIGHASH_ALL_FORKID))
}

export const pushData = push
export { SIGHASH_ALL_FORKID }
