/**
 * The JavaScript side's canonical form and operations. ⚠ NO SIDE EFFECTS ON IMPORT — the runner and
 * the proposer both load this, and a module that runs when you import it can only be used once.
 *
 * ⚠⚠ WRITTEN FROM `vectors/SCHEMA.md`, NOT PORTED FROM THE PYTHON ONE. Two implementations that share
 * no code, asked the same question. A port would agree with its source about the things its source got
 * wrong — which is exactly the failure the vectors exist to find.
 * */
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const IMPL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'impl', 'js')
const bip32 = await import(join(IMPL, 'bip32.mjs'))

/* ── ⚠⚠ THE CANONICAL FORM ───────────────────────────────────────────────────────────────────────
   Bytes, never JSON text. JSON has key order, whitespace and number formatting, and all three differ
   between languages — hashing the text would make the harness agree with itself and nothing else. */

/** unsigned LEB128 */
function uvarint(n) {
  if (n < 0n) throw new Error('uvarint is unsigned')
  const out = []
  for (;;) {
    const b = Number(n & 0x7fn)
    n >>= 7n
    out.push(b | (n ? 0x80 : 0))
    if (!n) return Uint8Array.from(out)
  }
}
const zigzag = n => (n << 1n) ^ (n >> 63n)
const cat = parts => Buffer.concat(parts.map(p => Buffer.from(p)))

/** Serialize a value to its canonical bytes. ⚠ Refuses floats, deliberately. */
export function canon(v) {
  if (v === null || v === undefined) return Buffer.from([0x00])
  if (v === true) return Buffer.from([0x02])
  if (v === false) return Buffer.from([0x01])
  if (typeof v === 'number') {
    /* ⚠⚠ IEEE round-tripping between languages is the exact silent divergence this is for. A
       non-integer is refused outright rather than rounded into agreement. */
    if (!Number.isSafeInteger(v)) throw new TypeError('canon: only safe integers — no floats')
    return cat([[0x03], uvarint(zigzag(BigInt(v)))])
  }
  if (typeof v === 'bigint') return cat([[0x03], uvarint(zigzag(v))])
  if (typeof v === 'string') {
    const b = Buffer.from(v, 'utf8')
    return cat([[0x04], uvarint(BigInt(b.length)), b])
  }
  if (v instanceof Uint8Array) return cat([[0x05], uvarint(BigInt(v.length)), v])
  if (Array.isArray(v)) return cat([[0x06], uvarint(BigInt(v.length)), ...v.map(canon)])
  if (typeof v === 'object') {
    const keys = Object.keys(v)
    /* ★ {"hex": "…"} is the wire spelling of a byte string — one key, and the only one. */
    if (keys.length === 1 && keys[0] === 'hex') return canon(Buffer.from(v.hex, 'hex'))
    /* ⚠ sorted by UTF-8 BYTES. JavaScript's default sort compares UTF-16 code units, which orders
       characters above the BMP differently from Python's code-point order — so neither language's
       default is safe and both must be told explicitly. */
    keys.sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
    return cat([[0x07], uvarint(BigInt(keys.length)),
                ...keys.flatMap(k => [canon(k), canon(v[k])])])
  }
  throw new TypeError(`canon: no rule for ${typeof v}`)
}
export const canonHash = v => createHash('sha256').update(canon(v)).digest('hex')

/* ── the operations under test ─────────────────────────────────────────────────────────────────────
   ⚠ Anything not listed is SKIPPED, and a skip is never a pass. */
export class NotImplementedOp extends Error {}

export const OPS = {
  /* ★ aimed at vectors sealed from the BIP before either implementation existed */
  'bip32.derive': i => {
    const n = bip32.fromSeed(Buffer.from(i.seed.hex, 'hex')).derive(i.path)
    return { xprv: n.xprv(), xpub: n.xpub() }
  },
  'base58.check': i => ({ b58: bip32.b58check(Buffer.from(i.hex, 'hex')) }),
  /* the harness pinning its own foundation — if the two languages disagree here, nothing built on
     top of it means anything */
  'canon.hash': i => ({ hex: canonHash(i.value) }),
  'hash.sha256': i => ({ hex: createHash('sha256').update(Buffer.from(i.hex, 'hex')).digest('hex') }),
  'hash.hash160': i => ({
    hex: createHash('ripemd160')
      .update(createHash('sha256').update(Buffer.from(i.hex, 'hex')).digest())
      .digest('hex'),
  }),
}

export const dispatch = (op, i) => {
  const fn = OPS[op]
  if (!fn) throw new NotImplementedOp(op)
  return fn(i)
}

