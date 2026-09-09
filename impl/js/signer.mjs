// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * ══ THE SIGNER — turning a key and a transaction into an unlocking script ═══════════════════════════
 *
 * ★ Everything under this was already built and graded. This module only ASSEMBLES it:
 *
 *     sighash (BIP-143)  →  sign (RFC 6979)  →  DER + type byte  →  `<sig> <pubkey>`
 *
 * ⚠⚠⚠ THE SCRIPT CODE AND THE AMOUNT COME FROM THE UTXO, NEVER FROM THE TRANSACTION. A transaction does
 *   not contain the outputs it spends, which is precisely why BIP-143 has to be told. ⇒ Get either one
 *   wrong and the signature is well formed, the transaction serializes, the txid looks fine, and it is
 *   rejected by every node that sees it.
 *
 * ⚠⚠ `lowS` DEFAULTS ON HERE BECAUSE THIS SIDE BROADCASTS. It is not a protocol rule - Chronicle removed
 *   it, and a transaction opting in with version > 1 is valid without it - but a BROADCASTER may still
 *   refuse a high-s signature, and this project has had a conformant spend refused for exactly that
 *   (ARC error 461). Normalising costs nothing on a key signature.
 *   ⛔ A COVENANT IS THE OPPOSITE CASE and must not inherit this default: there the signature is
 *     recomputed inside the script, so grinding it changes what the covenant checks against itself.
 */
import { sighash, SIGHASH } from './transaction.mjs'
import { sign, verifyDigest, publicKey as pubFromScalar } from './ecdsa.mjs'
import { minimalPush } from './script.mjs'
import { p2pkhAddress, p2pkhScript, wifEncode, wifDecode } from './address.mjs'
import { hash160, fromSeed as seedToNode } from './bip32.mjs'
import { concat, equals, toHex, reversed, fromHex, beBytes } from './bytes.mjs'
import { N } from './secp256k1.mjs'

/** ★ The same path the sibling wallet uses, so one phrase restores the same keys in both. 236 is BSV. */
export const DEFAULT_PATH = "m/44'/236'/0'/0/0"

export class SignerError extends Error {}

export class Signer {
  /**
   * ⚠⚠ `compressed` TRAVELS WITH THE KEY, and that is not a detail: the same private key spends a
   *   DIFFERENT address compressed and uncompressed. ⇒ Importing a WIF and then defaulting to
   *   compressed hands back an address holding nothing, for a key that is provably yours.
   */
  constructor(d, compressed = true) {
    if (typeof d !== 'bigint') throw new SignerError('a private key is a BigInt scalar')
    if (d < 1n || d >= N) throw new SignerError('private key out of range')
    this.d = d
    this.compressed = compressed
  }

  static fromPrivateKey(raw32, compressed = true) {
    if (!(raw32 instanceof Uint8Array) || raw32.length !== 32)
      throw new SignerError('a private key is 32 bytes')
    return new Signer(BigInt('0x' + toHex(raw32)), compressed)
  }

  /**
   * ⛔ NEVER ASK ANYONE FOR A WIF. This exists so a user can import a key THEY produced, on their own
   *   machine. The standing rule is that a key is never solicited.
   */
  static fromWif(wif) {
    const d = wifDecode(wif)
    if (d === null) throw new SignerError('not a valid WIF - the checksum or the length is wrong')
    return Signer.fromPrivateKey(d.key, d.compressed)
  }

  /** ★ From a written-down phrase. ⚠ BIP-32, not SLIP-0010 - see bip32.mjs for why they differ. */
  static fromSeed(seed, path = DEFAULT_PATH) {
    const node = seedToNode(seed).derive(path)
    if (node.k === null) throw new SignerError('that node is watch-only and cannot sign')
    return new Signer(node.k, true)
  }

  /** ⚠ EXPORTS THE PRIVATE KEY. The caller is showing this to its owner and to nobody else. */
  toWif() { return wifEncode(beBytes(this.d, 32), this.compressed) }

  publicKey(compressed = this.compressed) { return pubFromScalar(this.d, compressed) }
  hash160() { return hash160(this.publicKey()) }
  address() { return p2pkhAddress(this.publicKey()) }
  /** The locking script that pays THIS key. ★ What a change output wants. */
  lockingScript() { return p2pkhScript(this.hash160()) }

  /**
   * Sign one input. Returns the DER signature **with the sighash-type byte appended**, which is what an
   * unlocking script actually carries.
   *
   * @param scriptCode the LOCKING script of the output being spent, raw and unprefixed
   * @param amount     that output's satoshis
   */
  signInput(tx, inputIndex, scriptCode, amount, sighashType = SIGHASH.ALL_FORKID, { lowS = true } = {}) {
    assertAmount(amount)
    const digest = sighash(tx, inputIndex, scriptCode, amount, sighashType)
    // ★ The trailing byte is part of the signature as scripts see it, which is why `decodeDer` stayed
    //   STRICT by default and takes `allowTrailing` explicitly.
    return concat(sign(this.d, digest, { lowS }), Uint8Array.of(sighashType))
  }

  /**
   * The P2PKH unlocking script: `<signature+type> <pubkey>`.
   *
   * ★ Both pushes go through `minimalPush`, so the encoding is the shortest legal one and matches what
   *   the rest of the wallet produces. ⚠ A signature is ~71-72 bytes and a public key 33 or 65, so both
   *   land in the direct-push range - but stating that as an assumption rather than relying on it is
   *   how the wrong push form gets emitted the day one of them changes.
   */
  unlockP2PKH(tx, inputIndex, scriptCode, amount, sighashType = SIGHASH.ALL_FORKID, opts = {}) {
    return concat(
      minimalPush(this.signInput(tx, inputIndex, scriptCode, amount, sighashType, opts)),
      minimalPush(this.publicKey()),
    )
  }

  /**
   * Sign every input of a P2PKH transaction, IN PLACE.
   *
   * @param utxos aligned with `tx.inputs`, each `{ txid, vout, value, script }`
   *
   * ⚠⚠⚠ THE ALIGNMENT IS CHECKED, NOT ASSUMED. Handing these in the wrong ORDER signs each input against
   *   another output's script and amount ⇒ **every signature is well formed and every one is invalid**,
   *   with nothing in the transaction to say so. ⇒ The outpoints are compared and a mismatch is refused.
   *
   * ★ Signing order does not matter. A BIP-143 preimage commits to the other inputs only through
   *   `hashPrevouts` and `hashSequence`, never through their unlocking scripts, so a script written into
   *   input 0 cannot change the digest for input 1. (Under the legacy algorithm it could, which is one
   *   of the things BIP-143 fixed. The suite proves it here rather than trusting the reasoning.)
   */
  signP2PKH(tx, utxos, sighashType = SIGHASH.ALL_FORKID, opts = {}) {
    if (utxos.length !== tx.inputs.length)
      throw new SignerError(`${utxos.length} UTXOs for ${tx.inputs.length} inputs`)
    tx.inputs.forEach((inp, i) => {
      const u = utxos[i]
      const want = wireTxid(u.txid, `utxos[${i}].txid`)
      const got = wireTxid(inp.txid, `tx.inputs[${i}].txid`)
      if (!equals(want, got) || Number(u.vout) !== Number(inp.vout))
        throw new SignerError(
          `UTXO ${i} does not match input ${i}: the outpoints differ. ⇒ The list is out of order, and `
        + `signing it would produce valid-looking signatures that verify nowhere.`)
      inp.script = this.unlockP2PKH(tx, i, u.script, Number(u.value), sighashType, opts)
    })
    return tx
  }

  /** Verify one input's signature the way a script would. */
  static verifyInput(tx, inputIndex, scriptCode, amount, pub, sigWithType) {
    if (!(sigWithType instanceof Uint8Array) || sigWithType.length < 2) return false
    const type = sigWithType[sigWithType.length - 1]
    // ⚠ allowTrailing: the sighash byte follows the DER, so strict parsing would reject a valid one.
    return verifyDigest(sigWithType, pub, sighash(tx, inputIndex, scriptCode, amount, type), true)
  }
}

/**
 * ⚠⚠⚠ A txid IS 32 BYTES IN WIRE ORDER HERE, NOT THE HEX A BLOCK EXPLORER SHOWS. The two are reverses of
 *   each other, and a reversed txid is still a perfectly valid-looking 32-byte txid, so nothing
 *   downstream can tell them apart.
 *   ⇒ MEASURED, not argued: passing a UTXO whose `txid` is a display hex STRING through `coins.build()`
 *     produces a transaction with a **ZEROED** txid that serializes without error and reports a
 *     confident, wrong txid. ⇒ So a string is refused here rather than coerced, and the message says
 *     which direction to convert. This is the last place the mistake is still cheap.
 */
function wireTxid(t, what) {
  if (t instanceof Uint8Array && t.length === 32) return t
  if (typeof t === 'string')
    throw new SignerError(
      `${what} is a string. A txid must be 32 bytes in WIRE order here, not display hex. ⇒ If it came `
    + `from an API or an explorer, convert it with reversed(fromHex(txid)).`)
  throw new SignerError(`${what} must be a 32-byte Uint8Array, got ${t?.length ?? typeof t}`)
}

/** ⚠ A wrong amount is the other silent failure: the signature commits to it, nothing else does. */
function assertAmount(a) {
  if (!Number.isInteger(a) || a < 0) throw new SignerError(`amount must be a whole number of satoshis, got ${a}`)
  if (!Number.isSafeInteger(a)) throw new SignerError('amount exceeds the safe integer range')
}

/** ★ Convenience for the common direction: an explorer's txid into the bytes this module wants. */
export const txidToWire = hex => reversed(fromHex(hex))
/** ★ And back, for display. */
export const wireToTxid = b => toHex(reversed(b))
