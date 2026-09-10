// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * CO-SIGNING — completing a transaction somebody else assembled.
 *
 * Phar Lap's air-gap signer refuses to sign anything it cannot re-derive: it takes a semantic request
 * ("transfer this edition to that pubkey") and REBUILDS the transaction with its own validated builder,
 * so an attacker who tampers with the request cannot make it sign something other than what it read.
 * That rule is right, and this module does not weaken it.
 *
 * But it only works while Phar Lap knows how to build the thing. A covenant it has never heard of —
 * the Bitcoin Battery, and every covenant after it — cannot be rebuilt here, because rebuilding would
 * mean carrying that covenant's script generator. There are two honest responses to that: refuse
 * forever, or find a different way to know what is being signed.
 *
 * ★ THE OBSERVATION THAT MAKES THIS SAFE: a transaction is not an opaque blob.
 *
 * Every satoshi it moves is derivable from its own bytes plus the source transaction of each input.
 * Given those, the fee, the amount leaving this wallet, the amount returning to it, and every output's
 * destination are FACTS to be computed — not claims to be believed. So the summary the signer confirms
 * is one this module derived, and a tampered transaction simply derives a different summary and shows
 * it. Nothing in the request is trusted, which was always the actual requirement; "rebuild it" was one
 * way of meeting it, not the only one.
 *
 * What this still refuses:
 *   - to sign an input that does not pay this wallet's address
 *   - to sign at all when any input's source transaction is missing (without it the fee is unknowable,
 *     and an unknowable fee is precisely how a co-signer gets robbed — see FEE WARNING below)
 *   - to sign when a source transaction does not hash to the txid the input names
 *
 * ⚠ THE FEE WARNING IS THE POINT OF THIS MODULE, not a nicety. A transaction's outputs are fixed by
 * whoever assembled it; the fee is simply whatever the inputs exceed them by. So an assembler who names
 * a large coin of yours and a small change output is not "asking for a fee" anywhere in the document —
 * the surplus is silently donated to the miner. Measured on a real battery top-up: the same transaction
 * with a coin twice the size turned a 347 sat fee into 100,347 sat, with nothing on its face to say so.
 * Deriving the fee and putting it in front of the signer is the only defence.
 */
import { Tx } from '../impl/js/transaction.mjs'
import { p2pkhScript, scriptForAddress } from '../impl/js/address.mjs'
import { b58check } from '../impl/js/bip32.mjs'
import { wireToTxid } from '../impl/js/signer.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { hexBytes, utf8Of, sha256Bytes, hexOf } from './bytes.ts'
import type { Signer } from '../impl/js/signer.mjs'

/** A source transaction for one of the inputs — needed for its value and its locking script. */
export interface CosignSource { txId: string; sourceTxHex: string }

export interface CosignInputView {
  index: number
  txId: string
  outputIndex: number
  /** Null when the source transaction was not supplied — which is a blocker, not a display detail. */
  satoshis: number | null
  /** Pays this wallet's address, so this is one we can and will sign. */
  mine: boolean
  /** Already carries an unlocking script — the covenant's input, or a co-signer who went before us. */
  complete: boolean
  /** The script being spent, hashed the way this wallet names a script. Null with no source. */
  scriptHash: string | null
}

export interface CosignOutputView {
  index: number
  satoshis: number
  /** `continues` = the same locked script one of the inputs is spending. See FUNDING below. */
  kind: 'yours' | 'address' | 'data' | 'script' | 'continues'
  address?: string
  /** OP_RETURN payload decoded as UTF-8. DISPLAY AS TEXT — never linkify; these are stranger's bytes. */
  text?: string
  scriptSize: number
  /** ★ The output's identity — so a signer can compare it against the thing they MEANT to pay, without
   *  this module knowing what that thing is. */
  scriptHash: string
  /** Index of the input this output re-creates, when it re-creates one. */
  continuesInput?: number
  /** Satoshis this output adds to (or, if negative, takes from) the input it continues. */
  addedSats?: number
}

/**
 * ★★★ WHAT IS BEING TOPPED UP, DERIVED WITHOUT KNOWING WHAT IT IS.
 *
 * A transaction that adds value to something already locked has to SPEND that output and RE-CREATE the
 * same script carrying more. There is no other way: an output cannot be edited in place.
 *
 * ⇒ So the same locked script appears twice: as the script of an input's source, and as an output.
 *   Matching those says "this adds N satoshis to THAT", whatever THAT is — a script this module has
 *   never seen and will never need to understand.
 *
 * ⚠⚠ WITHOUT IT THE SIGNER SEES "12,345 sat · script · 201 bytes" AND CANNOT TELL WHAT IT IS. The fee
 *   warning stops a surplus going to a miner; this is the other half — that the money leaving the
 *   wallet arrives where it was meant to, and how much of it does.
 */
export interface CosignFunding {
  outputIndex: number
  inputIndex: number
  /** The shared identity of the input being spent and the output re-creating it. */
  scriptHash: string
  from: number
  to: number
  /** Negative means value is being TAKEN OUT, not put in. */
  added: number
}

export interface CosignAnalysis {
  /** Bytes as handed over, with this wallet's inputs still blank. */
  size: number
  /** Bytes once the blanks are filled — what the fee is actually paying for. */
  signedSize: number
  inputs: CosignInputView[]
  outputs: CosignOutputView[]
  totalIn: number
  totalOut: number
  fee: number
  /** sat/KB — the number to judge the fee by. Policy is 100; anything far above it wants explaining. */
  feePerKb: number
  /** What leaves this wallet across all inputs it owns. */
  youSpend: number
  /** What comes back to this wallet across all outputs paying it. */
  youReceive: number
  /** The real cost of signing: spend − receive. Includes the fee if this wallet is funding it. */
  youPay: number
  /** Input indices this wallet will sign. */
  toSign: number[]
  /** Sign-able, but the signer should read these first. */
  warnings: string[]
  /** Refusals. Non-empty means `cosignTransaction` will throw. */
  blockers: string[]
  /** Every locked script this transaction re-creates, and what it adds to each. */
  funding: CosignFunding[]
}

/**
 * What the caller believes it is signing. ⚠ Optional, and every field is a REFUSAL when it does not
 * hold — not a warning. A caller that knows what it is paying should say so, because the derivation
 * below can only report what a transaction does, never whether that was the intention.
 */
export interface CosignExpectation {
  /** The script hash the funding must arrive at. */
  scriptHash?: string
  /** The most this transaction may add to it. */
  maxFunding?: number
}

/** What filling in one blank costs in bytes: push(72-byte signature) + push(33-byte public key). */
const SIGNED_P2PKH_INPUT_BYTES = 107
/** Fee policy: 100 sat/KB is the official rate. Twice that is worth a word; ten times is alarming. */
const FEE_PER_KB_POLICY = 100
const FEE_PER_KB_NOTABLE = FEE_PER_KB_POLICY * 2
const FEE_PER_KB_ALARMING = FEE_PER_KB_POLICY * 10

/** ⚠ The convention this wallet uses everywhere to name a script: SHA-256, byte-reversed. */
const scriptHashOf = (script: Uint8Array): string => hexOf(sha256Bytes(Array.from(script)).reverse())

/** Decode an OP_FALSE OP_RETURN <data> payload as text, or null if this is not a data output. */
function dataPayload(scriptHex: string): string | null {
  // OP_FALSE OP_RETURN is `006a`; a bare OP_RETURN output is `6a`. Accept both, then take the first push.
  const s = scriptHex.toLowerCase()
  const body = s.startsWith('006a') ? s.slice(4) : s.startsWith('6a') ? s.slice(2) : null
  if (body == null) return null
  try {
    const bytes = hexBytes(body)
    let i = 0, len = 0
    const op = bytes[i++]
    if (op == null) return ''
    if (op <= 75) len = op
    else if (op === 0x4c) len = bytes[i++] ?? 0
    else if (op === 0x4d) { len = (bytes[i++] ?? 0) | ((bytes[i++] ?? 0) << 8) }
    else if (op === 0x4e) { len = (bytes[i++] ?? 0) | ((bytes[i++] ?? 0) << 8) | ((bytes[i++] ?? 0) << 16) | ((bytes[i++] ?? 0) << 24) }
    else return ''
    return utf8Of(bytes.slice(i, i + len))
  } catch { return '' }
}

/**
 * Work out what signing this transaction would actually do to this wallet. Pure — no network, no key,
 * so it runs on the offline box and is safe to call before the signer has committed to anything.
 */
export function analyseCosign(
  rawTx: string, sources: CosignSource[], address: string, expect?: CosignExpectation,
): CosignAnalysis {
  const tx = Tx.parse(rawTx)
  const mineLock = toHex(scriptForAddress(address))

  // Index the sources by txid, and VERIFY each one hashes to the id it is filed under. A source
  // transaction is how we learn an input's value; a forged one would let an assembler understate what
  // it is spending, and the fee we derive from it would be a lie we told ourselves.
  const byId = new Map<string, Tx>()
  const blockers: string[] = []
  const warnings: string[] = []
  for (const s of sources) {
    let parsed: Tx
    try { parsed = Tx.parse(s.sourceTxHex) }
    catch { blockers.push(`a supplied source transaction for ${s.txId.slice(0, 12)}… is not valid hex`); continue }
    if (parsed.txid() !== s.txId) {
      blockers.push(`a source transaction does not hash to the txid it claims (${s.txId.slice(0, 12)}…) — refusing`)
      continue
    }
    byId.set(s.txId, parsed)
  }

  const inputs: CosignInputView[] = tx.inputs.map((inp, index) => {
    const txId = wireToTxid(inp.txid)
    const outputIndex = inp.vout
    const src = byId.get(txId) ?? null
    const out = src?.outputs[outputIndex] ?? null
    const complete = inp.script.length > 0
    return {
      index, txId, outputIndex,
      satoshis: out?.value ?? null,
      mine: out != null && toHex(out.script) === mineLock,
      complete,
      scriptHash: out == null ? null : scriptHashOf(out.script),
    }
  })

  /* ⚠ Index the inputs by the script they SPEND, so an output re-creating one can be recognised. Built
     from the verified sources only — an input whose source was missing or forged is already a blocker. */
  const spentBy = new Map<string, number>()
  inputs.forEach(i => { if (i.scriptHash != null && !spentBy.has(i.scriptHash)) spentBy.set(i.scriptHash, i.index) })

  const outputs: CosignOutputView[] = tx.outputs.map((o, index) => {
    const hex = toHex(o.script)
    const text = dataPayload(hex)
    let kind: CosignOutputView['kind'] = 'script'
    let addr: string | undefined
    if (text != null) kind = 'data'
    else if (hex === mineLock) { kind = 'yours'; addr = address }
    else {
      // A standard P2PKH we can name: OP_DUP OP_HASH160 <20> … OP_EQUALVERIFY OP_CHECKSIG
      const m = /^76a914([0-9a-f]{40})88ac$/.exec(hex.toLowerCase())
      if (m != null) {
        kind = 'address'
        /* ⚠ THE VERSION BYTE IS PART OF THE ADDRESS, and it is not carried in the script — the script
           holds only the 20-byte hash. Prefixing 0x00 is what makes this a mainnet P2PKH address rather
           than some other network's. Omit it and the string still base58-checks, and pays elsewhere. */
        try { addr = b58check(Uint8Array.from([0x00, ...hexBytes(m[1])])) } catch { addr = undefined }
      }
    }
    /* ★★★ DOES THIS OUTPUT RE-CREATE SOMETHING THIS TRANSACTION IS SPENDING? If so, this is a top-up
       (or a withdrawal) of that thing, and the difference in value is the amount at stake. ⚠ The kind is
       only overridden where it would otherwise be an opaque `script`: an output paying this wallet stays
       `yours`, because that is the more useful thing to tell a signer. */
    /* ⚠ ONLY AN OTHERWISE-OPAQUE SCRIPT COUNTS. Change pays the same address as the funding input it
       came from, so matching scripts blindly reports ordinary change as a top-up. Anything already
       recognisable — ours, an address, a data push — is not what this is looking for. */
    const scriptHash = scriptHashOf(o.script)
    const continuesInput = kind === 'script' ? spentBy.get(scriptHash) : undefined
    const from = continuesInput === undefined ? null : inputs[continuesInput].satoshis
    if (continuesInput !== undefined) kind = 'continues'
    return {
      index, satoshis: o.value, kind, address: addr, text: text ?? undefined, scriptSize: o.script.length,
      scriptHash,
      ...(continuesInput === undefined ? {} : { continuesInput, addedSats: o.value - (from ?? 0) }),
    }
  })

  const funding: CosignFunding[] = outputs
    .filter(o => o.continuesInput !== undefined)
    .map(o => ({
      outputIndex: o.index, inputIndex: o.continuesInput!, scriptHash: o.scriptHash,
      from: inputs[o.continuesInput!].satoshis ?? 0, to: o.satoshis, added: o.addedSats ?? 0,
    }))

  const missing = inputs.filter(i => i.satoshis == null)
  if (missing.length > 0) {
    blockers.push(
      `${missing.length} input${missing.length === 1 ? '' : 's'} ha${missing.length === 1 ? 's' : 've'} no source ` +
      'transaction, so the fee cannot be worked out. Refusing to sign a transaction whose cost is unknown.')
  }

  const totalIn = inputs.reduce((a, i) => a + (i.satoshis ?? 0), 0)
  const totalOut = outputs.reduce((a, o) => a + o.satoshis, 0)
  const fee = totalIn - totalOut
  const size = rawTx.length / 2
  const toSign = inputs.filter(i => i.mine && !i.complete).map(i => i.index)

  /* Judge the fee against the size this transaction will BE, not the size it is now. Every blank we
     fill in grows it by about 107 bytes (a 72-byte signature and a 33-byte public key, each pushed).
     Rating the fee against the unsigned bytes overstates it — a perfectly ordinary 20 sat fee on a
     small transaction reads as 235 sat/KB before signing and 100 after — and a warning that cries wolf
     on every co-sign is worse than no warning, because it trains the signer to click through it. */
  const signedSize = size + SIGNED_P2PKH_INPUT_BYTES * toSign.length
  const feePerKb = signedSize > 0 ? Math.round((fee * 1000) / signedSize) : 0
  const youSpend = inputs.filter(i => i.mine).reduce((a, i) => a + (i.satoshis ?? 0), 0)
  const youReceive = outputs.filter(o => o.kind === 'yours').reduce((a, o) => a + o.satoshis, 0)

  if (toSign.length === 0) {
    blockers.push(missing.length > 0
      ? 'no input could be matched to this wallet (some sources are missing, so this may be why)'
      : 'no input in this transaction pays this wallet — there is nothing here for it to sign')
  }
  for (const i of inputs) {
    if (i.mine && i.complete) warnings.push(`input #${i.index + 1} already carries a signature and will be left alone`)
    if (!i.mine && !i.complete) {
      warnings.push(`input #${i.index + 1} is neither yours nor already signed — somebody else must sign it before this can be broadcast`)
    }
  }
  if (blockers.length === 0) {
    if (fee < 0) blockers.push('the outputs are worth more than the inputs — this transaction can never be valid')
    else if (feePerKb >= FEE_PER_KB_ALARMING) {
      warnings.push(`⚠ THE FEE IS ${fee.toLocaleString()} SAT — ${feePerKb.toLocaleString()} sat/KB, over ${Math.round(feePerKb / FEE_PER_KB_POLICY)}× the standard rate. ` +
        'Outputs are fixed by whoever built this, so any surplus goes to the miner, not back to you. Check the change amount before signing.')
    } else if (feePerKb >= FEE_PER_KB_NOTABLE) {
      warnings.push(`the fee is ${fee.toLocaleString()} sat (${feePerKb.toLocaleString()} sat/KB) against a standard rate of ${FEE_PER_KB_POLICY}`)
    }
  }

  /* ★★★ THE SECOND HALF OF THE DEFENCE. The fee warning stops a surplus going to a miner; this says
     where the rest of the money went. Neither is visible on the face of the document. */
  /* ⚠⚠ A FALLING VALUE IS NOT BY ITSELF WRONG — a locked output may pay its own costs out of what it
     carries, so warning on every decrease fires on the normal case.
     ★ THE LINE IS THE FEE. Value that went to the MINER is accounted for; value that left BEYOND the fee
       went to another output. Arithmetic on this transaction alone: what the script it came from allows
       is that script's business, not the signer's. */
  for (const f of funding) {
    const leaked = -f.added - Math.max(fee, 0)
    if (leaked > 0) {
      warnings.push(`⚠ output #${f.outputIndex + 1} carries ${leaked.toLocaleString()} sat LESS than input #${f.inputIndex + 1} even after the fee — that value went to another output, not to the miner`)
    }
  }
  for (const o of outputs) {
    if (o.kind === 'script' && o.satoshis > 0) {
      warnings.push(`output #${o.index + 1} pays ${o.satoshis.toLocaleString()} sat to a script this transaction does not otherwise touch (${o.scriptHash.slice(0, 12)}…) — nothing here says what it is`)
    }
  }

  /* ⚠⚠ AN EXPECTATION IS A REFUSAL, NOT A WARNING. Everything above DERIVES what a transaction does; it
     cannot know what the caller MEANT. A caller that knows what it is paying says so, and a mismatch
     stops the signing rather than decorating it. */
  if (expect?.scriptHash != null) {
    const want = expect.scriptHash.toLowerCase()
    const hit = funding.find(f => f.scriptHash.toLowerCase() === want)
    if (hit === undefined) {
      blockers.push(`this transaction does not add anything to ${want.slice(0, 12)}… — it funds ${funding.length === 0 ? 'nothing it also spends' : funding.map(f => f.scriptHash.slice(0, 12) + '…').join(', ')}`)
    } else if (expect.maxFunding != null && hit.added > expect.maxFunding) {
      blockers.push(`this transaction adds ${hit.added.toLocaleString()} sat, more than the ${expect.maxFunding.toLocaleString()} sat expected`)
    }
  }

  return {
    size, signedSize, inputs, outputs, totalIn, totalOut, fee, feePerKb,
    youSpend, youReceive, youPay: youSpend - youReceive,
    toSign, warnings, blockers, funding,
  }
}

/**
 * Sign this wallet's inputs and leave every other byte of the transaction alone.
 *
 * ★ Why signing one input cannot disturb another: a sighash preimage commits to the outpoints, the
 * values, the outputs and the scriptCode of the input BEING signed — never to another input's
 * unlocking script. So a covenant input authorised by OP_PUSH_TX, or a partner's signature added
 * yesterday, both stay valid while this one is filled in. That fact is what makes co-signing possible
 * at all; without it the only way to complete a transaction would be to rebuild it.
 */
export async function cosignTransaction(
  rawTx: string, sources: CosignSource[], key: Signer, expect?: CosignExpectation,
): Promise<{ txId: string; rawTx: string; analysis: CosignAnalysis }> {
  const address = key.address()
  const analysis = analyseCosign(rawTx, sources, address, expect)
  if (analysis.blockers.length > 0) throw new Error(analysis.blockers[0])

  const tx = Tx.parse(rawTx)

  /* ⚠ THE DEPLOYED VERSION ATTACHED EVERY SOURCE TRANSACTION TO ITS INPUT before signing, including the
     inputs it was not signing, because the old signer read each value out of the parent it was handed.
     A BIP-143 preimage commits to the value of the input BEING SIGNED and to the outpoints and outputs
     of the rest — it never needs another input's parent. ⇒ The values come from the analysis above,
     which already verified each source hashes to the txid its input names. */
  const script = key.lockingScript()
  for (const i of analysis.toSign) {
    const value = analysis.inputs[i].satoshis
    if (value == null) throw new Error(`cosign: input #${i + 1} has no known value — refusing to sign`)
    // Signed one at a time, deliberately: this transaction is part ours and part somebody else's.
    tx.inputs[i].script = key.unlockP2PKH(tx, i, script, value)
  }

  /* ⛔ NO SERIALIZATION CACHE, DELIBERATELY. The removed library kept the bytes it parsed and served
     them back, so assigning an unlocking script could return a txid while handing on the UNSIGNED
     transaction. This one serializes from its fields every time. Do not add a cache. */
  return { txId: tx.txid(), rawTx: tx.hex(), analysis }
}
