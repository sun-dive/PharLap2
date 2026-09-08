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
import { sha256 } from '@noble/hashes/sha2.js'
import { concat, fromHex, toHex, reversed, readU16LE, readU32LE, readU64LE, u16LE, u32LE, u64LE } from './bytes.mjs'

const dsha256 = b => sha256(sha256(b))
export { dsha256 }

export function varint(n) {
  if (n < 0) throw new Error('a length cannot be negative')
  if (n < 0xfd) return Uint8Array.of(n)
  if (n <= 0xffff) return concat(Uint8Array.of(0xfd), u16LE(n))
  if (n <= 0xffffffff) return concat(Uint8Array.of(0xfe), u32LE(n))
  return concat(Uint8Array.of(0xff), u64LE(BigInt(n)))
}
export function readVarint(b, o) {
  if (o >= b.length) throw new Error(`varint runs past the end at offset ${o}`)
  const f = b[o]
  if (f < 0xfd) return [f, o + 1]
  if (f === 0xfd) return [readU16LE(b, o + 1), o + 3]
  if (f === 0xfe) return [readU32LE(b, o + 1), o + 5]
  return [Number(readU64LE(b, o + 1)), o + 9]
}
const need = (b, o, n) => { if (o + n > b.length) throw new Error(`need ${n} bytes at offset ${o}; the data ends first`) }

export class Tx {
  constructor(version = 1, inputs = [], outputs = [], locktime = 0) {
    Object.assign(this, { version, inputs, outputs, locktime })
  }

  static parse(raw) {
    const b = typeof raw === 'string' ? fromHex(raw) : raw
    need(b, 0, 4)
    const tx = new Tx(readU32LE(b, 0)); let o = 4, n
    ;[n, o] = readVarint(b, o)
    for (let i = 0; i < n; i++) {
      need(b, o, 36); const txid = b.subarray(o, o + 32); const vout = readU32LE(b, o + 32); o += 36
      let len; [len, o] = readVarint(b, o)
      need(b, o, len + 4)
      tx.inputs.push({ txid, vout, script: b.subarray(o, o + len), sequence: readU32LE(b, o + len) })
      o += len + 4
    }
    ;[n, o] = readVarint(b, o)
    for (let i = 0; i < n; i++) {
      need(b, o, 8)
      // ⚠ 8 BYTES, not 4. A 4-byte read is identical below 42.9 BTC and silently wrong above it.
      const value = Number(readU64LE(b, o)); o += 8
      let len; [len, o] = readVarint(b, o)
      need(b, o, len)
      tx.outputs.push({ value, script: b.subarray(o, o + len) }); o += len
    }
    need(b, o, 4); tx.locktime = readU32LE(b, o); o += 4
    // ⛔ TRAILING BYTES ARE AN ERROR. A parser that ignores them accepts two different transactions as
    //   the same one, and the txid it reports belongs to neither.
    if (o !== b.length) throw new Error(`${b.length - o} trailing byte(s) after the transaction`)
    return tx
  }

  serialize() {
    const parts = [u32LE(this.version), varint(this.inputs.length)]
    for (const i of this.inputs) {
      parts.push(i.txid, u32LE(i.vout), varint(i.script.length), i.script, u32LE(i.sequence))
    }
    parts.push(varint(this.outputs.length))
    for (const ou of this.outputs) {
      parts.push(u64LE(ou.value), varint(ou.script.length), ou.script)
    }
    parts.push(u32LE(this.locktime))
    return concat(...parts)
  }

  hex() { return toHex(this.serialize()) }
  /** ⚠ The txid a person reads is the hash REVERSED. */
  /** ⚠ The txid a person reads is the hash REVERSED — and `reversed` copies, never mutates. */
  txid() { return toHex(reversed(dsha256(this.serialize()))) }
  /** ★ 100 sat/KB, never ARC's suggestion. ⚠ Rounded UP: a fee below the floor is a stuck tx. */
  fee(satPerKb = 100) { return Math.ceil(this.serialize().length * satPerKb / 1000) }
}

export const SIGHASH = { ALL: 0x01, NONE: 0x02, SINGLE: 0x03, FORKID: 0x40, ANYONECANPAY: 0x80, ALL_FORKID: 0x41 }
const ZERO32 = new Uint8Array(32)

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

  if (!acp) {
    hashPrevouts = dsha256(concat(...tx.inputs.flatMap(i => [i.txid, u32LE(i.vout)])))
    // ⚠ sequences are committed ONLY for ALL — NONE and SINGLE leave them free to change
    if (base !== SIGHASH.SINGLE && base !== SIGHASH.NONE)
      hashSequence = dsha256(concat(...tx.inputs.map(i => u32LE(i.sequence))))
  }
  const outBytes = o => concat(u64LE(o.value), varint(o.script.length), o.script)
  if (base !== SIGHASH.SINGLE && base !== SIGHASH.NONE)
    hashOutputs = dsha256(concat(...tx.outputs.map(outBytes)))
  else if (base === SIGHASH.SINGLE && tx.outputs[inputIndex])
    // ⛔ past the last output this stays ZEROS, not Bitcoin's legacy uint256(1) bug — BIP-143 fixed it
    hashOutputs = dsha256(outBytes(tx.outputs[inputIndex]))

  return concat(u32LE(tx.version), hashPrevouts, hashSequence, inp.txid, u32LE(inp.vout),
    varint(scriptCode.length), scriptCode, u64LE(amount), u32LE(inp.sequence), hashOutputs,
    u32LE(tx.locktime), u32LE(sighashType))
}

export const sighash = (...a) => dsha256(preimage(...a))
