// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { scriptForAddress } from '../impl/js/address.mjs'
import { b58check } from '../impl/js/bip32.mjs'
import { wireToTxid } from '../impl/js/signer.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import { hexBytes, utf8Of, sha256Bytes, hexOf } from './bytes.js'

const SIGNED_P2PKH_INPUT_BYTES = 107
const FEE_PER_KB_POLICY = 100
const FEE_PER_KB_NOTABLE = FEE_PER_KB_POLICY * 2
const FEE_PER_KB_ALARMING = FEE_PER_KB_POLICY * 10

const scriptHashOf = (script) => hexOf(sha256Bytes(Array.from(script)).reverse())

function dataPayload(scriptHex) {
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

export function analyseCosign(
  rawTx, sources, address, expect,
) {
  const tx = Tx.parse(rawTx)
  const mineLock = toHex(scriptForAddress(address))

  const byId = new Map()
  const blockers = []
  const warnings = []
  for (const s of sources) {
    let parsed
    try { parsed = Tx.parse(s.sourceTxHex) }
    catch { blockers.push(`a supplied source transaction for ${s.txId.slice(0, 12)}… is not valid hex`); continue }
    if (parsed.txid() !== s.txId) {
      blockers.push(`a source transaction does not hash to the txid it claims (${s.txId.slice(0, 12)}…) — refusing`)
      continue
    }
    byId.set(s.txId, parsed)
  }

  const inputs = tx.inputs.map((inp, index) => {
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

  const spentBy = new Map()
  inputs.forEach(i => { if (i.scriptHash != null && !spentBy.has(i.scriptHash)) spentBy.set(i.scriptHash, i.index) })

  const outputs = tx.outputs.map((o, index) => {
    const hex = toHex(o.script)
    const text = dataPayload(hex)
    let kind = 'script'
    let addr
    if (text != null) kind = 'data'
    else if (hex === mineLock) { kind = 'yours'; addr = address }
    else {
      const m = /^76a914([0-9a-f]{40})88ac$/.exec(hex.toLowerCase())
      if (m != null) {
        kind = 'address'
        try { addr = b58check(Uint8Array.from([0x00, ...hexBytes(m[1])])) } catch { addr = undefined }
      }
    }
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

  const funding = outputs
    .filter(o => o.continuesInput !== undefined)
    .map(o => ({
      outputIndex: o.index, inputIndex: o.continuesInput, scriptHash: o.scriptHash,
      from: inputs[o.continuesInput].satoshis ?? 0, to: o.satoshis, added: o.addedSats ?? 0,
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

export async function cosignTransaction(
  rawTx, sources, key, expect,
) {
  const address = key.address()
  const analysis = analyseCosign(rawTx, sources, address, expect)
  if (analysis.blockers.length > 0) throw new Error(analysis.blockers[0])

  const tx = Tx.parse(rawTx)

  const script = key.lockingScript()
  for (const i of analysis.toSign) {
    const value = analysis.inputs[i].satoshis
    if (value == null) throw new Error(`cosign: input #${i + 1} has no known value — refusing to sign`)
    tx.inputs[i].script = key.unlockP2PKH(tx, i, script, value)
  }

  return { txId: tx.txid(), rawTx: tx.hex(), analysis }
}
