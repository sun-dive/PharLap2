// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * Bitcoin script — the opcode table, and chunks in and out.
 *
 * ★ A script is a sequence of CHUNKS, each `{ op, data? }`: an opcode, and for the push opcodes the
 *   bytes they push. Building and parsing are the same structure read in two directions, which is why
 *   one shape serves both.
 *
 * ⚠⚠ THE PUSH ENCODING IS WHERE THIS GOES WRONG SILENTLY. `0x01`–`0x4b` push that many bytes DIRECTLY —
 *   the opcode IS the length. Above that you need an explicit `PUSHDATA1/2/4`. ⇒ Emitting
 *   `PUSHDATA1 0x05` for five bytes is **valid script, a different serialization, and therefore a
 *   different txid** — and on a covenant that hashes its own output, a different script entirely.
 *   ★ So `minimalPush` picks the shortest form, and `toBinary` HONOURS an explicit `op` when one is
 *     given, so a script parsed off the chain round-trips byte for byte even if it was not minimal.
 *
 * ⚠ Opcode numbers are protocol constants — published, and the same in every implementation. Nothing
 *   here is derived from any particular library, and the suite grades it against **real mainnet
 *   scripts** rather than against another implementation's agreement.
 */
import { concat, fromHex, toHex, u16LE, u32LE, readU16LE, readU32LE } from './bytes.mjs'

export const OP = {
  OP_0: 0x00, OP_FALSE: 0x00,
  OP_PUSHDATA1: 0x4c, OP_PUSHDATA2: 0x4d, OP_PUSHDATA4: 0x4e,
  OP_1NEGATE: 0x4f, OP_RESERVED: 0x50,
  OP_1: 0x51, OP_TRUE: 0x51, OP_2: 0x52, OP_3: 0x53, OP_4: 0x54, OP_5: 0x55, OP_6: 0x56,
  OP_7: 0x57, OP_8: 0x58, OP_9: 0x59, OP_10: 0x5a, OP_11: 0x5b, OP_12: 0x5c, OP_13: 0x5d,
  OP_14: 0x5e, OP_15: 0x5f, OP_16: 0x60,
  // control
  OP_NOP: 0x61, OP_VER: 0x62, OP_IF: 0x63, OP_NOTIF: 0x64, OP_VERIF: 0x65, OP_VERNOTIF: 0x66,
  OP_ELSE: 0x67, OP_ENDIF: 0x68, OP_VERIFY: 0x69, OP_RETURN: 0x6a,
  // stack
  OP_TOALTSTACK: 0x6b, OP_FROMALTSTACK: 0x6c, OP_2DROP: 0x6d, OP_2DUP: 0x6e, OP_3DUP: 0x6f,
  OP_2OVER: 0x70, OP_2ROT: 0x71, OP_2SWAP: 0x72, OP_IFDUP: 0x73, OP_DEPTH: 0x74, OP_DROP: 0x75,
  OP_DUP: 0x76, OP_NIP: 0x77, OP_OVER: 0x78, OP_PICK: 0x79, OP_ROLL: 0x7a, OP_ROT: 0x7b,
  OP_SWAP: 0x7c, OP_TUCK: 0x7d,
  // strings ★ re-enabled on this chain; disabled in legacy Bitcoin
  OP_CAT: 0x7e, OP_SPLIT: 0x7f, OP_NUM2BIN: 0x80, OP_BIN2NUM: 0x81, OP_SIZE: 0x82,
  // bitwise
  OP_INVERT: 0x83, OP_AND: 0x84, OP_OR: 0x85, OP_XOR: 0x86, OP_EQUAL: 0x87, OP_EQUALVERIFY: 0x88,
  OP_RESERVED1: 0x89, OP_RESERVED2: 0x8a,
  // arithmetic
  OP_1ADD: 0x8b, OP_1SUB: 0x8c, OP_2MUL: 0x8d, OP_2DIV: 0x8e, OP_NEGATE: 0x8f, OP_ABS: 0x90,
  OP_NOT: 0x91, OP_0NOTEQUAL: 0x92, OP_ADD: 0x93, OP_SUB: 0x94, OP_MUL: 0x95, OP_DIV: 0x96,
  OP_MOD: 0x97, OP_LSHIFT: 0x98, OP_RSHIFT: 0x99, OP_BOOLAND: 0x9a, OP_BOOLOR: 0x9b,
  OP_NUMEQUAL: 0x9c, OP_NUMEQUALVERIFY: 0x9d, OP_NUMNOTEQUAL: 0x9e, OP_LESSTHAN: 0x9f,
  OP_GREATERTHAN: 0xa0, OP_LESSTHANOREQUAL: 0xa1, OP_GREATERTHANOREQUAL: 0xa2, OP_MIN: 0xa3,
  OP_MAX: 0xa4, OP_WITHIN: 0xa5,
  // crypto
  OP_RIPEMD160: 0xa6, OP_SHA1: 0xa7, OP_SHA256: 0xa8, OP_HASH160: 0xa9, OP_HASH256: 0xaa,
  OP_CODESEPARATOR: 0xab, OP_CHECKSIG: 0xac, OP_CHECKSIGVERIFY: 0xad, OP_CHECKMULTISIG: 0xae,
  OP_CHECKMULTISIGVERIFY: 0xaf,
  // reserved
  OP_NOP1: 0xb0, OP_NOP2: 0xb1, OP_NOP3: 0xb2, OP_NOP4: 0xb3, OP_NOP5: 0xb4, OP_NOP6: 0xb5,
  OP_NOP7: 0xb6, OP_NOP8: 0xb7, OP_NOP9: 0xb8, OP_NOP10: 0xb9,
  OP_INVALIDOPCODE: 0xff,
}

/** number → name. ⚠ First name wins, so aliases (`OP_FALSE`, `OP_TRUE`) resolve to the canonical one. */
export const OP_NAME = (() => {
  const m = {}
  for (const [k, v] of Object.entries(OP)) if (!(v in m)) m[v] = k
  return m
})()

/** ★ The shortest legal encoding of a data push. Anything longer is valid and a DIFFERENT script. */
export function minimalPush(data) {
  const d = data
  // ⚪ Belt and braces: `concat(of(0), empty)` would give the same 0x00 anyway, so no test can tell
  //   this line from its absence. It stays because it says WHY the byte is 0x00 — an empty push is
  //   OP_0, not a zero-length direct push. (Confirmed equivalent by mutation testing, 9 Sept 2026.)
  if (d.length === 0) return Uint8Array.of(OP.OP_0)
  if (d.length === 1 && d[0] >= 1 && d[0] <= 16) return Uint8Array.of(OP.OP_1 + d[0] - 1)
  if (d.length === 1 && d[0] === 0x81) return Uint8Array.of(OP.OP_1NEGATE)
  if (d.length <= 0x4b) return concat(Uint8Array.of(d.length), d)
  if (d.length <= 0xff) return concat(Uint8Array.of(OP.OP_PUSHDATA1, d.length), d)
  if (d.length <= 0xffff) return concat(Uint8Array.of(OP.OP_PUSHDATA2), u16LE(d.length), d)
  return concat(Uint8Array.of(OP.OP_PUSHDATA4), u32LE(d.length), d)
}

export class Script {
  /** @param {{op:number,data?:Uint8Array}[]} chunks */
  constructor(chunks = []) { this.chunks = chunks }

  static fromBinary(bytes) {
    const b = bytes
    const chunks = []
    let i = 0
    while (i < b.length) {
      const op = b[i++]
      if (op > 0 && op <= 0x4b) {
        // ⚠ A truncated push is not a parse error to Bitcoin — it is simply where the script ends.
        //   Recording what is there keeps a partial script inspectable rather than discarding it.
        // ⚪ `subarray` already clamps, so `Math.min` changes no output and no test can catch its
        //   removal. It stays because it makes the clamp VISIBLE — on a Buffer this line would read
        //   the same and behave differently. (Confirmed equivalent by mutation testing, 9 Sept 2026.)
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

  /** ★ Honours an explicit `op`, so a script parsed off the chain round-trips EXACTLY — minimal or not. */
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

  /** Readable form. ⚠ For humans and diffs, never for consensus. */
  toASM() {
    return this.chunks.map(c =>
      c.data !== undefined && c.data !== null && c.data.length
        ? toHex(c.data)
        : (OP_NAME[c.op] ?? `OP_UNKNOWN_${c.op}`)).join(' ')
  }
}

/** ★ Two names, one behaviour — a locking and an unlocking script read differently to a person even
 *  though the bytes obey identical rules. */
export class LockingScript extends Script {
  static fromBinary(b) { return new LockingScript(Script.fromBinary(b).chunks) }
  static fromHex(h) { return LockingScript.fromBinary(fromHex(h)) }
}
export class UnlockingScript extends Script {
  static fromBinary(b) { return new UnlockingScript(Script.fromBinary(b).chunks) }
  static fromHex(h) { return UnlockingScript.fromBinary(fromHex(h)) }
}
