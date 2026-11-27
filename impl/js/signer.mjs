// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { sighash, SIGHASH } from './transaction.mjs'
import { sign, verifyDigest, publicKey as pubFromScalar } from './ecdsa.mjs'
import { minimalPush } from './script.mjs'
import { p2pkhAddress, p2pkhScript, wifEncode, wifDecode } from './address.mjs'
import { hash160, fromSeed as seedToNode } from './bip32.mjs'
import { concat, equals, toHex, reversed, fromHex, beBytes } from './bytes.mjs'
import { N } from './secp256k1.mjs'

export const DEFAULT_PATH = "m/44'/236'/0'/0/0"

export class SignerError extends Error {}

export class Signer {
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

  static fromWif(wif) {
    const d = wifDecode(wif)
    if (d === null) throw new SignerError('not a valid WIF - the checksum or the length is wrong')
    return Signer.fromPrivateKey(d.key, d.compressed)
  }

  static fromSeed(seed, path = DEFAULT_PATH) {
    const node = seedToNode(seed).derive(path)
    if (node.k === null) throw new SignerError('that node is watch-only and cannot sign')
    return new Signer(node.k, true)
  }

  toWif() { return wifEncode(beBytes(this.d, 32), this.compressed) }

  publicKey(compressed = this.compressed) { return pubFromScalar(this.d, compressed) }
  hash160() { return hash160(this.publicKey()) }
  address() { return p2pkhAddress(this.publicKey()) }
  lockingScript() { return p2pkhScript(this.hash160()) }

  signInput(tx, inputIndex, scriptCode, amount, sighashType = SIGHASH.ALL_FORKID, { lowS = true } = {}) {
    assertAmount(amount)
    const digest = sighash(tx, inputIndex, scriptCode, amount, sighashType)
    return concat(sign(this.d, digest, { lowS }), Uint8Array.of(sighashType))
  }

  unlockP2PKH(tx, inputIndex, scriptCode, amount, sighashType = SIGHASH.ALL_FORKID, opts = {}) {
    return concat(
      minimalPush(this.signInput(tx, inputIndex, scriptCode, amount, sighashType, opts)),
      minimalPush(this.publicKey()),
    )
  }

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

  static verifyInput(tx, inputIndex, scriptCode, amount, pub, sigWithType) {
    if (!(sigWithType instanceof Uint8Array) || sigWithType.length < 2) return false
    const type = sigWithType[sigWithType.length - 1]
    return verifyDigest(sigWithType, pub, sighash(tx, inputIndex, scriptCode, amount, type), true)
  }
}

function wireTxid(t, what) {
  if (t instanceof Uint8Array && t.length === 32) return t
  if (typeof t === 'string')
    throw new SignerError(
      `${what} is a string. A txid must be 32 bytes in WIRE order here, not display hex. ⇒ If it came `
    + `from an API or an explorer, convert it with reversed(fromHex(txid)).`)
  throw new SignerError(`${what} must be a 32-byte Uint8Array, got ${t?.length ?? typeof t}`)
}

function assertAmount(a) {
  if (!Number.isInteger(a) || a < 0) throw new SignerError(`amount must be a whole number of satoshis, got ${a}`)
  if (!Number.isSafeInteger(a)) throw new SignerError('amount exceeds the safe integer range')
}

export const txidToWire = hex => reversed(fromHex(hex))
export const wireToTxid = b => toHex(reversed(b))
