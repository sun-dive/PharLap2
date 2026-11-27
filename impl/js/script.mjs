// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { concat, fromHex, toHex, u16LE, u32LE, readU16LE, readU32LE } from './bytes.mjs'

export const OP = {
  OP_0: 0x00, OP_FALSE: 0x00,
  OP_PUSHDATA1: 0x4c, OP_PUSHDATA2: 0x4d, OP_PUSHDATA4: 0x4e,
  OP_1NEGATE: 0x4f, OP_RESERVED: 0x50,
  OP_1: 0x51, OP_TRUE: 0x51, OP_2: 0x52, OP_3: 0x53, OP_4: 0x54, OP_5: 0x55, OP_6: 0x56,
  OP_7: 0x57, OP_8: 0x58, OP_9: 0x59, OP_10: 0x5a, OP_11: 0x5b, OP_12: 0x5c, OP_13: 0x5d,
  OP_14: 0x5e, OP_15: 0x5f, OP_16: 0x60,
  OP_NOP: 0x61, OP_VER: 0x62, OP_IF: 0x63, OP_NOTIF: 0x64, OP_VERIF: 0x65, OP_VERNOTIF: 0x66,
  OP_ELSE: 0x67, OP_ENDIF: 0x68, OP_VERIFY: 0x69, OP_RETURN: 0x6a,
  OP_TOALTSTACK: 0x6b, OP_FROMALTSTACK: 0x6c, OP_2DROP: 0x6d, OP_2DUP: 0x6e, OP_3DUP: 0x6f,
  OP_2OVER: 0x70, OP_2ROT: 0x71, OP_2SWAP: 0x72, OP_IFDUP: 0x73, OP_DEPTH: 0x74, OP_DROP: 0x75,
  OP_DUP: 0x76, OP_NIP: 0x77, OP_OVER: 0x78, OP_PICK: 0x79, OP_ROLL: 0x7a, OP_ROT: 0x7b,
  OP_SWAP: 0x7c, OP_TUCK: 0x7d,
  OP_CAT: 0x7e, OP_SPLIT: 0x7f, OP_NUM2BIN: 0x80, OP_BIN2NUM: 0x81, OP_SIZE: 0x82,
  OP_INVERT: 0x83, OP_AND: 0x84, OP_OR: 0x85, OP_XOR: 0x86, OP_EQUAL: 0x87, OP_EQUALVERIFY: 0x88,
  OP_RESERVED1: 0x89, OP_RESERVED2: 0x8a,
  OP_1ADD: 0x8b, OP_1SUB: 0x8c, OP_2MUL: 0x8d, OP_2DIV: 0x8e, OP_NEGATE: 0x8f, OP_ABS: 0x90,
  OP_NOT: 0x91, OP_0NOTEQUAL: 0x92, OP_ADD: 0x93, OP_SUB: 0x94, OP_MUL: 0x95, OP_DIV: 0x96,
  OP_MOD: 0x97, OP_LSHIFT: 0x98, OP_RSHIFT: 0x99, OP_BOOLAND: 0x9a, OP_BOOLOR: 0x9b,
  OP_NUMEQUAL: 0x9c, OP_NUMEQUALVERIFY: 0x9d, OP_NUMNOTEQUAL: 0x9e, OP_LESSTHAN: 0x9f,
  OP_GREATERTHAN: 0xa0, OP_LESSTHANOREQUAL: 0xa1, OP_GREATERTHANOREQUAL: 0xa2, OP_MIN: 0xa3,
  OP_MAX: 0xa4, OP_WITHIN: 0xa5,
  OP_RIPEMD160: 0xa6, OP_SHA1: 0xa7, OP_SHA256: 0xa8, OP_HASH160: 0xa9, OP_HASH256: 0xaa,
  OP_CODESEPARATOR: 0xab, OP_CHECKSIG: 0xac, OP_CHECKSIGVERIFY: 0xad, OP_CHECKMULTISIG: 0xae,
  OP_CHECKMULTISIGVERIFY: 0xaf,
  OP_NOP1: 0xb0, OP_NOP2: 0xb1, OP_NOP3: 0xb2, OP_NOP4: 0xb3, OP_NOP5: 0xb4, OP_NOP6: 0xb5,
  OP_NOP7: 0xb6, OP_NOP8: 0xb7, OP_NOP9: 0xb8, OP_NOP10: 0xb9,
  OP_INVALIDOPCODE: 0xff,
}

export const OP_NAME = (() => {
  const m = {}
  for (const [k, v] of Object.entries(OP)) if (!(v in m)) m[v] = k
  return m
})()

export function minimalPush(data) {
  const d = data
  if (d.length === 0) return Uint8Array.of(OP.OP_0)
  if (d.length === 1 && d[0] >= 1 && d[0] <= 16) return Uint8Array.of(OP.OP_1 + d[0] - 1)
  if (d.length === 1 && d[0] === 0x81) return Uint8Array.of(OP.OP_1NEGATE)
  if (d.length <= 0x4b) return concat(Uint8Array.of(d.length), d)
  if (d.length <= 0xff) return concat(Uint8Array.of(OP.OP_PUSHDATA1, d.length), d)
  if (d.length <= 0xffff) return concat(Uint8Array.of(OP.OP_PUSHDATA2), u16LE(d.length), d)
  return concat(Uint8Array.of(OP.OP_PUSHDATA4), u32LE(d.length), d)
}

export class Script {
  constructor(chunks = []) { this.chunks = chunks }

  static fromBinary(bytes) {
    const b = bytes
    const chunks = []
    let i = 0
    while (i < b.length) {
      const op = b[i++]
      if (op > 0 && op <= 0x4b) {
        chunks.push({ op, data: b.subarray(i, Math.min(i + op, b.length)) }); i += op
      } else if (op === OP.OP_PUSHDATA1 || op === OP.OP_PUSHDATA2 || op === OP.OP_PUSHDATA4) {
        const w = op === OP.OP_PUSHDATA1 ? 1 : op === OP.OP_PUSHDATA2 ? 2 : 4
        if (i + w > b.length) { chunks.push({ op }); break }
        const n = w === 1 ? b[i] : w === 2 ? readU16LE(b, i) : readU32LE(b, i)
        i += w
        chunks.push({ op, data: b.subarray(i, Math.min(i + n, b.length)) }); i += n
      } else {
        chunks.push({ op })
      }
    }
    return new Script(chunks)
  }

  static fromHex(hex) { return Script.fromBinary(fromHex(hex)) }

  static toBinary(chunks) {
    const parts = []
    for (const c of chunks) {
      if (c.data === undefined || c.data === null) { parts.push(Uint8Array.of(c.op)); continue }
      const d = c.data
      if (c.op === undefined) { parts.push(minimalPush(d)); continue }
      if (c.op > 0 && c.op <= 0x4b) { parts.push(Uint8Array.of(c.op), d); continue }
      if (c.op === OP.OP_PUSHDATA1) { parts.push(Uint8Array.of(c.op, d.length), d); continue }
      if (c.op === OP.OP_PUSHDATA2) { parts.push(Uint8Array.of(c.op), u16LE(d.length), d); continue }
      if (c.op === OP.OP_PUSHDATA4) { parts.push(Uint8Array.of(c.op), u32LE(d.length), d); continue }
      parts.push(Uint8Array.of(c.op), d)
    }
    return concat(...parts)
  }

  static toHex(chunks) { return toHex(Script.toBinary(chunks)) }

  toBinary() { return Script.toBinary(this.chunks) }
  toHex() { return toHex(this.toBinary()) }

  toASM() {
    return this.chunks.map(c =>
      c.data !== undefined && c.data !== null && c.data.length
        ? toHex(c.data)
        : (OP_NAME[c.op] ?? `OP_UNKNOWN_${c.op}`)).join(' ')
  }
}

export class LockingScript extends Script {
  static fromBinary(b) { return new LockingScript(Script.fromBinary(b).chunks) }
  static fromHex(h) { return LockingScript.fromBinary(fromHex(h)) }
}
export class UnlockingScript extends Script {
  static fromBinary(b) { return new UnlockingScript(Script.fromBinary(b).chunks) }
  static fromHex(h) { return UnlockingScript.fromBinary(fromHex(h)) }
}
