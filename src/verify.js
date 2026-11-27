// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { LockingScript } from '../impl/js/script.mjs'
import { hexBytes } from './bytes.js'
import { wireToTxid } from '../impl/js/signer.mjs'

const parentIdOf = (input) =>
  input?.txid === undefined ? undefined : wireToTxid(input.txid)

const lockOf = (o) =>
  o === undefined ? undefined : LockingScript.fromBinary(o.script)
import { parseTokenScript, parseTemplateScript } from './tokenCodec.js'
import { parseEditionScript, buildHolderEditionScript } from './covenant.js'

export async function verifyTokenLineage(
  tokenTx,
  outputIndex,
  deps,
) {
  const tokenOut = tokenTx.outputs[outputIndex]
  const token = tokenOut ? parseTokenScript(lockOf(tokenOut)) : null
  if (token == null) return { valid: false, reason: 'output is not a PHAR LAP token' }
  const collectionId = token.fields.tx1Ref

  let tx1
  try {
    tx1 = await deps.getRawTransaction(collectionId)
  } catch {
    return { valid: false, reason: `cannot fetch collection TX1 ${collectionId.slice(0, 12)}…`, collectionId }
  }
  if (tx1.txid() !== collectionId) {
    return { valid: false, reason: 'fetched TX1 does not hash to the collection id — tampered collection anchor', collectionId }
  }
  const hasTemplate = tx1.outputs.some(o => parseTemplateScript(lockOf(o)) != null)
  if (!hasTemplate) {
    return { valid: false, reason: 'TX1 has no TEMPLATE output — invalid collection anchor', collectionId }
  }

  const input0 = tokenTx.inputs[0]
  const parentTxId = parentIdOf(input0)
  const parentVout = input0?.vout
  if (parentTxId == null || parentVout == null) {
    return { valid: false, reason: 'token tx has no input 0', collectionId }
  }

  let isGenesis
  try {
    const parentTx = await deps.getRawTransaction(parentTxId)
    const parentOut = parentTx.outputs[parentVout]
    const parentToken = parentOut ? parseTokenScript(lockOf(parentOut)) : null
    isGenesis = !(parentToken != null && parentToken.fields.tx1Ref === collectionId)
  } catch {
    return { valid: false, reason: 'cannot fetch immediate parent tx', collectionId }
  }

  if (deps.getProof != null && deps.chainTracker != null) {
    const proofTxId = isGenesis ? tokenTx.txid() : parentTxId
    const proof = await deps.getProof(proofTxId)
    if (proof != null) {
      const ok = await proof.verify(proofTxId, deps.chainTracker)
      if (!ok) {
        return { valid: false, reason: 'Merkle proof did not verify against the chain', collectionId, isGenesis }
      }
      return {
        valid: true,
        reason: isGenesis ? 'valid genesis token (confirmed)' : 'valid descendant token (parent confirmed)',
        collectionId,
        isGenesis,
      }
    }
    return {
      valid: true,
      reason: isGenesis ? 'valid genesis token (unconfirmed)' : 'valid descendant token (unconfirmed)',
      collectionId,
      isGenesis,
      unconfirmed: true,
    }
  }

  return {
    valid: true,
    reason: isGenesis ? 'valid genesis token (structure only)' : 'valid descendant token (structure only)',
    collectionId,
    isGenesis,
    unconfirmed: true,
  }
}

const bytesEqual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

export async function verifyEditionCovenant(
  tokenTx,
  outputIndex,
  deps,
) {
  const lock = lockOf(tokenTx.outputs[outputIndex])
  const ed = lock != null ? parseEditionScript(lock) : null
  if (ed == null) return { valid: false, reason: 'output is not a PHAR LAP edition covenant' }
  const collectionId = ed.tx1RefHex

  let tx1
  try { tx1 = await deps.getRawTransaction(collectionId) }
  catch { return { valid: false, reason: `cannot fetch collection TX1 ${collectionId.slice(0, 12)}…`, collectionId } }
  let covenantHex = '', tokenName = ''
  for (const o of tx1.outputs) {
    const t = parseTemplateScript(lockOf(o))
    if (t != null) { covenantHex = t.fields.covenantScript; tokenName = t.fields.tokenName; break }
  }
  if (covenantHex === '') {
    return { valid: false, reason: 'TX1 has no covenant template — not a valid edition collection', collectionId }
  }

  let expected
  try {
    expected = buildHolderEditionScript(hexBytes(covenantHex), hexBytes(collectionId), hexBytes(ed.ownerPubKeyHex))
  } catch { return { valid: false, reason: 'collection template is malformed', collectionId, collectionName: tokenName } }
  const actual = lock.toBinary()
  if (!bytesEqual(expected, actual)) {
    return { valid: false, reason: 'covenant does NOT match this collection’s committed rules — possible counterfeit or altered fees', collectionId, collectionName: tokenName }
  }

  const in0 = tokenTx.inputs[0]
  const parentTxId = parentIdOf(in0)
  const isGenesis = parentTxId === collectionId
  return {
    valid: true,
    reason: isGenesis ? 'genuine genesis edition (covenant matches the collection’s committed rules)'
      : 'genuine edition (covenant matches the collection’s committed rules)',
    collectionId, collectionName: tokenName, isGenesis,
    publisherFeeSats: ed.terms.publisherFeeSats,
    holderFeeSats: ed.terms.holderFeeSats,
  }
}
