# impl/js/script.mjs

Bitcoin script — the opcode table, and chunks in and out.

★ A script is a sequence of CHUNKS, each `{ op, data? }`: an opcode, and for the push opcodes the
  bytes they push. Building and parsing are the same structure read in two directions, which is why
  one shape serves both.

⚠⚠ THE PUSH ENCODING IS WHERE THIS GOES WRONG SILENTLY. `0x01`–`0x4b` push that many bytes DIRECTLY —
  the opcode IS the length. Above that you need an explicit `PUSHDATA1/2/4`. ⇒ Emitting
  `PUSHDATA1 0x05` for five bytes is **valid script, a different serialization, and therefore a
  different txid** — and on a covenant that hashes its own output, a different script entirely.
  ★ So `minimalPush` picks the shortest form, and `toBinary` HONOURS an explicit `op` when one is
    given, so a script parsed off the chain round-trips byte for byte even if it was not minimal.

⚠ Opcode numbers are protocol constants — published, and the same in every implementation. Nothing
  here is derived from any particular library, and the suite grades it against **real mainnet
  scripts** rather than against another implementation's agreement.

## OP

At `OP_NOP: 0x61, OP_VER: 0x62, OP_IF: 0x63, OP_NOTIF: 0x64, OP_VERIF: 0x65, OP_VERNOTIF: 0x66,`:

control

At `OP_TOALTSTACK: 0x6b, OP_FROMALTSTACK: 0x6c, OP_2DROP: 0x6d, OP_2DUP: 0x6e, OP_3DUP: 0x6f,`:

stack

At `OP_CAT: 0x7e, OP_SPLIT: 0x7f, OP_NUM2BIN: 0x80, OP_BIN2NUM: 0x81, OP_SIZE: 0x82,`:

strings ★ re-enabled on this chain; disabled in legacy Bitcoin

At `OP_INVERT: 0x83, OP_AND: 0x84, OP_OR: 0x85, OP_XOR: 0x86, OP_EQUAL: 0x87, OP_EQUALVERIFY: 0x88,`:

bitwise

At `OP_1ADD: 0x8b, OP_1SUB: 0x8c, OP_2MUL: 0x8d, OP_2DIV: 0x8e, OP_NEGATE: 0x8f, OP_ABS: 0x90,`:

arithmetic

At `OP_RIPEMD160: 0xa6, OP_SHA1: 0xa7, OP_SHA256: 0xa8, OP_HASH160: 0xa9, OP_HASH256: 0xaa,`:

crypto

At `OP_NOP1: 0xb0, OP_NOP2: 0xb1, OP_NOP3: 0xb2, OP_NOP4: 0xb3, OP_NOP5: 0xb4, OP_NOP6: 0xb5,`:

reserved

## OP_NAME

number → name. ⚠ First name wins, so aliases (`OP_FALSE`, `OP_TRUE`) resolve to the canonical one.

## minimalPush

★ The shortest legal encoding of a data push. Anything longer is valid and a DIFFERENT script.

At `if (d.length === 0) return Uint8Array.of(OP.OP_0)`:

⚪ Belt and braces: `concat(of(0), empty)` would give the same 0x00 anyway, so no test can tell
  this line from its absence. It stays because it says WHY the byte is 0x00 — an empty push is
  OP_0, not a zero-length direct push. (Confirmed equivalent by mutation testing, 9 Sept 2026.)

### Script.constructor

@param {{op:number,data?:Uint8Array}[]} chunks

### Script.fromBinary

At `chunks.push({ op, data: b.subarray(i, Math.min(i + op, b.length)) }); i += op`:

⚠ A truncated push is not a parse error to Bitcoin — it is simply where the script ends.
  Recording what is there keeps a partial script inspectable rather than discarding it.
⚪ `subarray` already clamps, so `Math.min` changes no output and no test can catch its
  removal. It stays because it makes the clamp VISIBLE — on a Buffer this line would read
  the same and behave differently. (Confirmed equivalent by mutation testing, 9 Sept 2026.)

### Script.toBinary

★ Honours an explicit `op`, so a script parsed off the chain round-trips EXACTLY — minimal or not.

### Script.toASM

Readable form. ⚠ For humans and diffs, never for consensus.

## class LockingScript

★ Two names, one behaviour — a locking and an unlocking script read differently to a person even
 though the bytes obey identical rules.
