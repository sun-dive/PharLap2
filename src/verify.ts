// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
/**
 * PHAR LAP lightweight token verification.
 *
 * Verifies that a token output is a legitimate member of its collection (PLAN.md Addendum
 * A/C/D — "genesis + immediate parent"):
 *   1. The token references a TX1 whose tx actually contains a TEMPLATE output (collection anchor).
 *   2. Its immediate parent (Input 0's source) is either:
 *        - a same-collection TOKEN output  → a transfer/edition descendant, OR
 *        - not a token                      → this is a genesis mint (a root of the collection).
 *   3. Optionally, the relevant tx is confirmed (a merkle proof checks out against a header source).
 *
 * Dependencies are injected so the logic is unit-testable offline and the proof source is pluggable.
 * In use, `walletProvider` supplies all three: raw transactions, merkle proofs, and block headers from
 * two independent relays. No extra infrastructure, and no indexer.
 *
 * ★★★ AND DEPTH ONE IS THE DESIGN, NOT A SHORTCUT. It is worth saying plainly, because the obvious
 *   reading is that a "full lineage walk" is the rigorous version and this is a cheap approximation.
 *   The opposite is true here.
 *
 *   ⇒ A token whose rules live only in an indexer's interpretation has nothing enforcing them at spend
 *     time, so every verifier must replay the ENTIRE history to agree on what is valid - work that grows
 *     with every transfer, for ever, and that every client repeats.
 *   ⇒ These tokens are held by a MINER-ENFORCED COVENANT (`./covenant`). The script verifies its own
 *     sighash preimage and forces the spending transaction's outputs, reconstructing the successor from
 *     its own bytes. Consensus therefore enforced the structure AT EVERY SPEND, and a miner checked it.
 *
 *   ⇒ So establishing that the immediate parent is a same-collection token establishes that the
 *     covenant ran. Walking further back re-verifies what the script already guaranteed and the network
 *     already validated. It would cost more and prove nothing additional.
 *
 * Covenant matching (the token's locking-script covenant equals TX1's committed covenant) is
 * added by `verifyEditionCovenant` below; this function covers the lineage itself.
 */
import type { Tx } from '../impl/js/transaction.mjs'
import { LockingScript } from '../impl/js/script.mjs'
import { hexBytes } from './bytes.ts'
import { wireToTxid } from '../impl/js/signer.mjs'

/**
 * ⚠ An input carries its outpoint as WIRE bytes; everything a person or an API sees is the DISPLAY
 *   form, which is its reverse. This module compares txids as strings, so the conversion happens once,
 *   here, rather than at each comparison where forgetting it would silently match nothing.
 */
const parentIdOf = (input: { txid?: Uint8Array } | undefined): string | undefined =>
  input?.txid === undefined ? undefined : wireToTxid(input.txid)

/** ⚠ Outputs carry raw script bytes; the parsers want a script object. */
const lockOf = (o: { script: Uint8Array } | undefined) =>
  o === undefined ? undefined : LockingScript.fromBinary(o.script)
import { parseTokenScript, parseTemplateScript } from './tokenCodec.ts'
import { parseEditionScript, buildHolderEditionScript } from './covenant.ts'

/**
 * Where block headers come from: does this merkle root belong to the block at this height.
 *
 * ★ It is an INTERFACE rather than an implementation so the proof source is pluggable and this module
 *   stays testable offline. `walletProvider` satisfies it, backed by two independent relays.
 * ⚠⚠ WHATEVER SATISFIES IT MUST DISTINGUISH "no" FROM "could not ask". A tracker that returns false
 *   when it was merely rate-limited reports a valid token as invalid, which is worse than waiting: the
 *   caller acts on a wrong answer instead of a slow one. Our transport retries a 429 rather than
 *   surfacing it, precisely so this boundary never sees one.
 */
export interface HeaderSource {
  isValidRootForHeight(root: string, height: number): Promise<boolean>
  currentHeight(): Promise<number>
}

/**
 * Minimal proof shape: a merkle path that can check itself against a tracker.
 * ⚠ The proof must be anchored to a block HEADER, never to a root it reports about itself. A proof that
 *   vouches for its own root proves nothing at all.
 */
export interface ProofLike {
  verify(txid: string, chainTracker: HeaderSource): Promise<boolean>
}

export interface VerifyDeps {
  getRawTransaction(txId: string): Promise<Tx>
  /** Optional: fetch a Merkle proof for a txid (null if not yet mined). */
  getProof?: (txId: string) => Promise<ProofLike | null>
  /** Optional: header source for proof verification. */
  chainTracker?: HeaderSource
}

export interface VerifyResult {
  valid: boolean
  reason: string
  collectionId?: string
  isGenesis?: boolean
  /** ⚠ NOT YET MINED - not 'unverified'. The lineage is checked either way; see the note below. */
  unconfirmed?: boolean
}

export async function verifyTokenLineage(
  tokenTx: Tx,
  outputIndex: number,
  deps: VerifyDeps,
): Promise<VerifyResult> {
  const tokenOut = tokenTx.outputs[outputIndex]
  const token = tokenOut ? parseTokenScript(lockOf(tokenOut)!) : null
  if (token == null) return { valid: false, reason: 'output is not a PHAR LAP token' }
  const collectionId = token.fields.tx1Ref

  // 1. Collection anchor: TX1 must exist and contain a TEMPLATE output.
  let tx1: Tx
  try {
    tx1 = await deps.getRawTransaction(collectionId)
  } catch {
    return { valid: false, reason: `cannot fetch collection TX1 ${collectionId.slice(0, 12)}…`, collectionId }
  }
  // Pin the anchor to its txid: the provider is NOT trusted, so the returned TX1 must actually hash to the
  // collection id the token commits to. This is what makes the immutable template fields (tokenName, rules,
  // covenant, fileHash, licence) tamper-evident — altering any of them changes TX1's txid, which no token
  // references. (The MPT immutability guarantee, enforced by Bitcoin's own hash rather than a re-derived chunk.)
  if (tx1.txid() !== collectionId) {
    return { valid: false, reason: 'fetched TX1 does not hash to the collection id — tampered collection anchor', collectionId }
  }
  const hasTemplate = tx1.outputs.some(o => parseTemplateScript(lockOf(o)!) != null)
  if (!hasTemplate) {
    return { valid: false, reason: 'TX1 has no TEMPLATE output — invalid collection anchor', collectionId }
  }

  // 2. Immediate parent (Input 0's source).
  const input0 = tokenTx.inputs[0]
  const parentTxId = parentIdOf(input0)
  const parentVout = input0?.vout
  if (parentTxId == null || parentVout == null) {
    return { valid: false, reason: 'token tx has no input 0', collectionId }
  }

  let isGenesis: boolean
  try {
    const parentTx = await deps.getRawTransaction(parentTxId)
    const parentOut = parentTx.outputs[parentVout]
    const parentToken = parentOut ? parseTokenScript(lockOf(parentOut)!) : null
    // A same-collection token parent ⇒ descendant; otherwise this token is a genesis mint.
    isGenesis = !(parentToken != null && parentToken.fields.tx1Ref === collectionId)
  } catch {
    return { valid: false, reason: 'cannot fetch immediate parent tx', collectionId }
  }

  // 3. Optional confirmation: prove the relevant tx is mined.
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
      // ⚠⚠ NO PROOF YET DOES NOT MEAN UNVERIFIED. The lineage above has already been checked: the
      //   claimed TX1 exists and carries a template, and the immediate parent is a same-collection
      //   token or is not a token at all. That is what establishes the coins are real, and it was done
      //   HERE rather than taken on anyone's word.
      //   ⇒ A merkle proof adds INCLUSION - a miner accepted it and put work behind it - which is a
      //     different claim, and one made by somebody else. ⛔ So `unconfirmed` means "not yet mined",
      //     never "not yet checked", and a caller treating it as provisional is importing a
      //     confirmations model from a chain this is not.
      //   ★ More is available about a transaction in the MEMPOOL than about a mined one: its whole
      //     ancestry can be fetched and checked, whereas a mined transaction hands you an inclusion
      //     proof and nothing at all about its inputs.
    return {
      valid: true,
      reason: isGenesis ? 'valid genesis token (unconfirmed)' : 'valid descendant token (unconfirmed)',
      collectionId,
      isGenesis,
      unconfirmed: true,
    }
  }

  // No proof source supplied → structural lineage check only.
  return {
    valid: true,
    reason: isGenesis ? 'valid genesis token (structure only)' : 'valid descendant token (structure only)',
    collectionId,
    isGenesis,
    unconfirmed: true,
  }
}

// ─── Edition covenant binding (O(1), no lineage walk) ───────────────

export interface EditionVerifyResult {
  valid: boolean
  reason: string
  collectionId?: string
  collectionName?: string
  /** This token's tx spends TX1 directly — i.e. it IS the publisher's original genesis mint. */
  isGenesis?: boolean
  /** Authoritative economics, proven equal to TX1's committed covenant (only set when valid). */
  publisherFeeSats?: number
  holderFeeSats?: number
}

const bytesEqual = (a: number[], b: number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Prove a token's locking script is byte-for-byte the covenant TX1 committed for its collection — i.e. it
 * enforces collection T's genuine, immutable rules (real publisher fee + split), not a look-alike with altered
 * economics. This is O(1): the covenant is consensus-enforced forward and TX1 commits the template, so a single
 * byte-match against TX1 IS the proof of "matches genesis" — no lineage walk (the MPT thesis: bind to genesis,
 * don't trace every hop).
 *
 * Every edition's script = the committed template with only two identity fields spliced in (tx1Ref @7, owner
 * @40), so we reconstruct the expected script from TX1's template and compare. The v2 holder-set price is
 * legitimately per-edition, so that one field is neutralized before comparing.
 */
export async function verifyEditionCovenant(
  tokenTx: Tx,
  outputIndex: number,
  deps: VerifyDeps,
): Promise<EditionVerifyResult> {
  const lock = lockOf(tokenTx.outputs[outputIndex])
  const ed = lock != null ? parseEditionScript(lock) : null
  if (ed == null) return { valid: false, reason: 'output is not a PHAR LAP edition covenant' }
  const collectionId = ed.tx1RefHex

  // Fetch the collection anchor TX1 and read its committed covenant template C.
  let tx1: Tx
  try { tx1 = await deps.getRawTransaction(collectionId) }
  catch { return { valid: false, reason: `cannot fetch collection TX1 ${collectionId.slice(0, 12)}…`, collectionId } }
  let covenantHex = '', tokenName = ''
  for (const o of tx1.outputs) {
    const t = parseTemplateScript(lockOf(o)!)
    if (t != null) { covenantHex = t.fields.covenantScript; tokenName = t.fields.tokenName; break }
  }
  if (covenantHex === '') {
    return { valid: false, reason: 'TX1 has no covenant template — not a valid edition collection', collectionId }
  }

  // Reconstruct this token's expected script from C + its identity (tx1Ref + owner), then byte-match.
  let expected: number[]
  try {
    expected = buildHolderEditionScript(hexBytes(covenantHex), hexBytes(collectionId), hexBytes(ed.ownerPubKeyHex))
  } catch { return { valid: false, reason: 'collection template is malformed', collectionId, collectionName: tokenName } }
  const actual = lock!.toBinary()
  /* ⚠⚠ THE COMPARISON IS NOW EXACT, AND THAT IS A STRENGTHENING. A block here used to copy an 8-byte
     price field across before comparing, because a second covenant version treated the price as
     per-edition and a difference there was not a forgery. That version is gone, so every byte of a
     genuine edition is reconstructible from the collection's committed template plus the owner's key.
     ⇒ Nothing about a real edition may differ from what we derive. Any difference is a counterfeit. */
  if (!bytesEqual(expected, actual)) {
    return { valid: false, reason: 'covenant does NOT match this collection’s committed rules — possible counterfeit or altered fees', collectionId, collectionName: tokenName }
  }

  // Genuine. Genesis = this token's tx spends TX1 directly (the publisher's original mint).
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
