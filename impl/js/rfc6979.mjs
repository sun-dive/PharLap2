/**
 * RFC 6979 — deterministic `k`, in JavaScript.
 *
 * ★ CURVE-AGNOSTIC ON PURPOSE, and that is what makes it gradeable. `k` depends only on the group
 * order, the private key and the digest — **never on the curve's points** — so RFC 6979 §A.2.5's
 * published **P-256** vectors grade this algorithm exactly, and secp256k1 then uses the same function.
 * ⇒ An external oracle exists for the hard part. → `wallet-secp256k1-decision.md`
 *
 * ⚠⚠ TWO SILENT-FAILURE TRAPS, both of which verify fine while disagreeing with everyone else:
 *   1. **`bits2int` must SHIFT RIGHT** when the input is longer than the order, not truncate bytes.
 *      Identical when both are 32 bytes; wrong the moment a digest is wider than the curve.
 *   2. **`int2octets` is fixed width**, and `bits2octets` reduces **mod q FIRST**.
 *
 * ⚠⚠⚠ HMAC IS INJECTED, and that is not decoration. RFC 6979 needs **synchronous** HMAC-SHA256.
 *   Node has one; **the browser's WebCrypto is ASYNC and cannot be used here.** ⇒ Rather than pick a
 *   browser SHA-256 silently, the caller supplies it and the choice stays visible. → the bundling step.
 */

/** @param {(key: Uint8Array, msg: Uint8Array) => Uint8Array} hmacSha256 */
export function makeRfc6979(hmacSha256) {
  const cat = (...a) => Buffer.concat(a.map(x => Buffer.from(x)))

  /** big-endian bytes → BigInt, SHIFTED RIGHT if wider than the order. ⚠ Not truncated. */
  const bits2int = (b, qlen) => {
    let v = BigInt('0x' + Buffer.from(b).toString('hex') || '0x0')
    const blen = b.length * 8
    return blen > qlen ? v >> BigInt(blen - qlen) : v
  }

  const int2octets = (x, rlen) => {
    const out = Buffer.alloc(rlen)
    for (let i = rlen - 1; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n }
    if (x !== 0n) throw new RangeError('int2octets: value wider than the order')
    return out
  }

  const bitlen = n => (n === 0n ? 0 : n.toString(2).length)

  /**
   * @param {bigint} q  the group order
   * @param {bigint} x  the private key
   * @param {Uint8Array} h1  the message digest
   * @param {number} attempt  ★ retry steps the generator FORWARD — never a fresh random k, which
   *   would reintroduce the RNG this whole file exists to remove.
   */
  return function k(q, x, h1, attempt = 0) {
    const qlen = bitlen(q)
    const rlen = Math.ceil(qlen / 8)
    // ⚠ bits2octets: reduce mod q FIRST, then fix the width.
    const h1int = bits2int(h1, qlen)
    const z2 = int2octets(h1int >= q ? h1int - q : h1int, rlen)
    const x2 = int2octets(x, rlen)

    let V = Buffer.alloc(32, 0x01)
    let K = Buffer.alloc(32, 0x00)
    K = hmacSha256(K, cat(V, [0x00], x2, z2)); V = hmacSha256(K, V)
    K = hmacSha256(K, cat(V, [0x01], x2, z2)); V = hmacSha256(K, V)

    for (let skipped = 0; ; ) {
      let T = Buffer.alloc(0)
      while (T.length * 8 < qlen) { V = hmacSha256(K, V); T = cat(T, V) }
      const cand = bits2int(T, qlen)
      if (cand >= 1n && cand < q) {
        if (skipped === attempt) return cand
        skipped++
      }
      K = hmacSha256(K, cat(V, [0x00])); V = hmacSha256(K, V)
    }
  }
}

/** Node's HMAC. ⚠ A browser build supplies its own — see the module note. */
export async function nodeHmac() {
  const { createHmac } = await import('node:crypto')
  return (key, msg) => createHmac('sha256', Buffer.from(key)).update(Buffer.from(msg)).digest()
}
