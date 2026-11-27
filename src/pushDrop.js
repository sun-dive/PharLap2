// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { OP, LockingScript, UnlockingScript } from '../impl/js/script.mjs'
import { SIGHASH, preimage, dsha256 } from '../impl/js/transaction.mjs'
import { sign as ecdsaSign, decodePoint } from '../impl/js/ecdsa.mjs'
import { serP } from '../impl/js/secp256k1.mjs'
import { fromHex, toHex, concat } from '../impl/js/bytes.mjs'

const u8 = (d) => Uint8Array.from(d)
const arr = (b) => Array.from(b)

export function minimalPushChunk(data) {
  if (data.length === 0) return { op: OP.OP_0 }
  if (data.length === 1 && data[0] === 0) return { op: OP.OP_0 }
  if (data.length === 1 && data[0] >= 1 && data[0] <= 16) return { op: 0x50 + data[0] }
  if (data.length === 1 && data[0] === 0x81) return { op: OP.OP_1NEGATE }
  if (data.length <= 75) return { op: data.length, data }
  if (data.length <= 255) return { op: OP.OP_PUSHDATA1, data }
  if (data.length <= 65535) return { op: OP.OP_PUSHDATA2, data }
  return { op: OP.OP_PUSHDATA4, data }
}

function appendDrops(chunks, count) {
  let notYetDropped = count
  while (notYetDropped > 1) {
    chunks.push({ op: OP.OP_2DROP })
    notYetDropped -= 2
  }
  if (notYetDropped === 1) chunks.push({ op: OP.OP_DROP })
}

export function lock(pubKeyHex, fields) {
  const pub = arr(fromHex(pubKeyHex))
  if (pub.length !== 33 && pub.length !== 65) {
    throw new Error(`pushDrop.lock: public key must be 33 or 65 bytes, got ${pub.length}`)
  }
  const chunks = [
    { op: pub.length, data: pub },
    { op: OP.OP_CHECKSIG },
    ...fields.map(minimalPushChunk),
  ]
  appendDrops(chunks, fields.length)
  return new LockingScript(chunks.map(c => ({ op: c.op, data: c.data === undefined ? undefined : u8(c.data) })))
}

export function unlockScript(
  privKey,
  tx,
  inputIndex,
  lockingScript,
  sourceSatoshis,
  options = {},
) {
  const { signOutputs = 'all', anyoneCanPay = false } = options
  let scope = SIGHASH.FORKID
  if (signOutputs === 'all') scope |= SIGHASH.ALL
  else if (signOutputs === 'none') scope |= SIGHASH.NONE
  else if (signOutputs === 'single') scope |= SIGHASH.SINGLE
  if (anyoneCanPay) scope |= SIGHASH.ANYONECANPAY

  if (tx.inputs[inputIndex] === undefined) throw new Error(`pushDrop.unlockScript: no input at ${inputIndex}`)
  if (!Number.isInteger(sourceSatoshis) || sourceSatoshis < 0) {
    throw new Error('pushDrop.unlockScript: sourceSatoshis must be a whole number of satoshis')
  }

  const digest = dsha256(preimage(tx, inputIndex, lockingScript, sourceSatoshis, scope))
  const der = ecdsaSign(privKey, digest, { lowS: true })
  const sig = concat(der, Uint8Array.of(scope))
  return new UnlockingScript([{ op: sig.length, data: sig }])
}

export const UNLOCK_SIZE = 73

export function decode(script) {
  const chunks = script.chunks
  if (chunks == null || chunks.length < 2) return null

  const pubData = chunks[0].data
  if (pubData == null || (pubData.length !== 33 && pubData.length !== 65)) return null
  if (chunks[1].op !== OP.OP_CHECKSIG) return null
  let pubKeyHex
  try {
    pubKeyHex = toHex(serP(decodePoint(pubData)))
  } catch {
    return null
  }

  const fields = []
  for (let i = 2; i < chunks.length; i++) {
    const op = chunks[i].op
    if (op === OP.OP_DROP || op === OP.OP_2DROP) break
    let data = chunks[i].data === undefined ? [] : arr(chunks[i].data)
    if (data.length === 0) {
      if (op >= 0x51 && op <= 0x60) data = [op - 0x50]
      else if (op === OP.OP_0) data = [0]
      else if (op === OP.OP_1NEGATE) data = [0x81]
      else return null
    }
    fields.push(data)
  }
  return { fields, pubKeyHex }
}
