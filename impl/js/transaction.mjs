/**
 * BSV transactions — serialize · parse · txid · BIP-143 sighash.
 *
 * ⚠⚠ THE SILENT FAILURES THIS EXISTS TO AVOID, every one of which produces a well-formed result:
 *   · an **8-byte amount packed as 4** — identical below 42.9 BTC, wrong above it
 *   · a **varint written as one byte** past 0xfc — shifts every following field
 *   · **scriptCode double-prefixed** — BIP-143 PRINTS it with its length already attached
 *   · **SIGHASH_SINGLE past the last output** — zeros here, NOT Bitcoin's legacy `uint256(1)` bug
 *   · a **txid not reversed** — the wire order and the display order are opposites, always
 *
 * ★ FORKID changes nothing about the arithmetic: with BSV's fork id of 0, `0x41` serializes as
 *   `41000000` like any other type. ⇒ Which is why BIP-143's own vectors, with FORKID clear, grade
 *   this layout end to end.
 */
import { createHash } from 'node:crypto'

const dsha256 = b => createHash('sha256').update(createHash('sha256').update(b).digest()).digest()
export { dsha256 }

export function varint(n) {
  if (n < 0) throw new Error('a length cannot be negative')
  if (n < 0xfd) return Buffer.from([n])
  if (n <= 0xffff) { const b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b }
  if (n <= 0xffffffff) { const b = Buffer.alloc(5); b[0] = 0xfe; b.writeUInt32LE(n, 1); return b }
  const b = Buffer.alloc(9); b[0] = 0xff; b.writeBigUInt64LE(BigInt(n), 1); return b
}
export function readVarint(b, o) {
  if (o >= b.length) throw new Error(`varint runs past the end at offset ${o}`)
  const f = b[o]
  if (f < 0xfd) return [f, o + 1]
  if (f === 0xfd) return [b.readUInt16LE(o + 1), o + 3]
  if (f === 0xfe) return [b.readUInt32LE(o + 1), o + 5]
  return [Number(b.readBigUInt64LE(o + 1)), o + 9]
}
const need = (b, o, n) => { if (o + n > b.length) throw new Error(`need ${n} bytes at offset ${o}; the data ends first`) }

export class Tx {
  constructor(version = 1, inputs = [], outputs = [], locktime = 0) {
    Object.assign(this, { version, inputs, outputs, locktime })
  }

  static parse(raw) {
    const b = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'hex')
    need(b, 0, 4)
    const tx = new Tx(b.readUInt32LE(0)); let o = 4, n
    ;[n, o] = readVarint(b, o)
    for (let i = 0; i < n; i++) {
      need(b, o, 36); const txid = b.subarray(o, o + 32); const vout = b.readUInt32LE(o + 32); o += 36
      let len; [len, o] = readVarint(b, o)
      need(b, o, len + 4)
      tx.inputs.push({ txid, vout, script: b.subarray(o, o + len), sequence: b.readUInt32LE(o + len) })
      o += len + 4
    }
    ;[n, o] = readVarint(b, o)
    for (let i = 0; i < n; i++) {
      need(b, o, 8)
      // ⚠ 8 BYTES, not 4. A 4-byte read is identical below 42.9 BTC and silently wrong above it.
      const value = Number(b.readBigUInt64LE(o)); o += 8
      let len; [len, o] = readVarint(b, o)
      need(b, o, len)
      tx.outputs.push({ value, script: b.subarray(o, o + len) }); o += len
    }
    need(b, o, 4); tx.locktime = b.readUInt32LE(o); o += 4
    // ⛔ TRAILING BYTES ARE AN ERROR. A parser that ignores them accepts two different transactions as
    //   the same one, and the txid it reports belongs to neither.
    if (o !== b.length) throw new Error(`${b.length - o} trailing byte(s) after the transaction`)
    return tx
  }

  serialize() {
    const v = Buffer.alloc(4); v.writeUInt32LE(this.version)
    const parts = [v, varint(this.inputs.length)]
    for (const i of this.inputs) {
      const vo = Buffer.alloc(4); vo.writeUInt32LE(i.vout)
      const sq = Buffer.alloc(4); sq.writeUInt32LE(i.sequence)
      parts.push(i.txid, vo, varint(i.script.length), i.script, sq)
    }
    parts.push(varint(this.outputs.length))
    for (const ou of this.outputs) {
      const val = Buffer.alloc(8); val.writeBigUInt64LE(BigInt(ou.value))
      parts.push(val, varint(ou.script.length), ou.script)
    }
    const lt = Buffer.alloc(4); lt.writeUInt32LE(this.locktime)
    parts.push(lt)
    return Buffer.concat(parts)
  }

  hex() { return this.serialize().toString('hex') }
  /** ⚠ The txid a person reads is the hash REVERSED. */
  txid() { return Buffer.from(dsha256(this.serialize())).reverse().toString('hex') }
  /** ★ 100 sat/KB, never ARC's suggestion. ⚠ Rounded UP: a fee below the floor is a stuck tx. */
  fee(satPerKb = 100) { return Math.ceil(this.serialize().length * satPerKb / 1000) }
}

export const SIGHASH = { ALL: 0x01, NONE: 0x02, SINGLE: 0x03, FORKID: 0x40, ANYONECANPAY: 0x80, ALL_FORKID: 0x41 }
const ZERO32 = Buffer.alloc(32)

/**
 * @param scriptCode the locking script being spent, RAW — its varint length is added here.
 *   ⚠⚠ BIP-143's published examples print it WITH the prefix; passing one in unchanged double-prefixes
 *   it and yields a preimage that is wrong and looks entirely plausible.
 */
export function preimage(tx, inputIndex, scriptCode, amount, sighashType = SIGHASH.ALL_FORKID) {
  const inp = tx.inputs[inputIndex]
  if (!inp) throw new Error(`no input at index ${inputIndex}`)
  if (amount < 0) throw new Error('an amount cannot be negative')
  const base = sighashType & 0x1f              // ⚠ masks off FORKID (0x40) AND ANYONECANPAY (0x80)
  const acp = (sighashType & SIGHASH.ANYONECANPAY) !== 0

  let hashPrevouts = ZERO32, hashSequence = ZERO32, hashOutputs = ZERO32
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
  const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }

  if (!acp) {
    hashPrevouts = dsha256(Buffer.concat(tx.inputs.flatMap(i => [i.txid, u32(i.vout)])))
    // ⚠ sequences are committed ONLY for ALL — NONE and SINGLE leave them free to change
    if (base !== SIGHASH.SINGLE && base !== SIGHASH.NONE)
      hashSequence = dsha256(Buffer.concat(tx.inputs.map(i => u32(i.sequence))))
  }
  const outBytes = o => Buffer.concat([u64(o.value), varint(o.script.length), o.script])
  if (base !== SIGHASH.SINGLE && base !== SIGHASH.NONE)
    hashOutputs = dsha256(Buffer.concat(tx.outputs.map(outBytes)))
  else if (base === SIGHASH.SINGLE && tx.outputs[inputIndex])
    // ⛔ past the last output this stays ZEROS, not Bitcoin's legacy uint256(1) bug — BIP-143 fixed it
    hashOutputs = dsha256(outBytes(tx.outputs[inputIndex]))

  return Buffer.concat([u32(tx.version), hashPrevouts, hashSequence, inp.txid, u32(inp.vout),
    varint(scriptCode.length), scriptCode, u64(amount), u32(inp.sequence), hashOutputs,
    u32(tx.locktime), u32(sighashType)])
}

export const sighash = (...a) => dsha256(preimage(...a))
