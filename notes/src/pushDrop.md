# src/pushDrop.js

PHAR LAP — lightweight raw-key PushDrop script template.

A PushDrop output is a *spendable* P2PK output that also carries arbitrary data
fields, which are pushed and then dropped:

    <pubkey> OP_CHECKSIG <field0> <field1> ... <fieldN-1> [OP_2DROP ...] [OP_DROP]

Because the data lives in the locking script of a spendable output, it stays in
the UTXO set and is NOT prunable (unlike OP_RETURN). This is the core reason
PHAR LAP moves token metadata here. See PLAN.md / BRC-48.

A *raw-key* implementation of the push-and-drop pattern: a public key and a checksig, followed by
data fields that the script then drops. PHAR LAP signs with a raw private scalar, matching the rest
of the wallet, rather than routing keys through a wallet-permission interface.

⚠ Layout note: the key and OP_CHECKSIG come FIRST, then the dropped fields. That ordering is not a
preference - it is what the tokens already on chain use, so it is fixed. The minimal-push encoding and OP_DROP/OP_2DROP
bundling below are ported from that template.

The fields themselves are opaque here — the token field layout (prefix, version,
name, rules, ...) is defined in `tokenCodec.ts` (Phase 2).

## u8

```ts
const u8 = (d: number[]): Uint8Array =>
```

⚠⚠ THE `number[]` SEAM LIVES HERE AND ONLY HERE. This module speaks `number[]`, as the application
  does; the script and transaction modules speak `Uint8Array`, as a browser does. Converting at this
  one boundary keeps 794 lines of `tokenCodec.ts` untouched, and leaves exactly one place to change
  the day the application moves over.

## arr

```ts
const arr = (b: Uint8Array): number[] =>
```

## ScriptChunk

```ts
interface ScriptChunk {
  op: number
  data?: number[]
}
```

## minimalPushChunk

```ts
export function minimalPushChunk(data: number[]): ScriptChunk
```

Minimally-encoded push for a data field — required because consensus enforces MINIMALPUSH: a 1-byte
value 1..16 must use OP_1..OP_16, an empty push must use OP_0, and so on.

⚠⚠⚠ THIS ENCODING IS FIXED BY WHAT IS ON CHAIN, and it is NOT the same rule as the wallet core's
  `minimalPush`. Here a single ZERO byte encodes to OP_0; there it encodes to a one-byte push. Both
  are defensible; only one matches the tokens that already exist. ⇒ Do not "unify" these. Substituting
  the other rule changes the script, therefore the txid, therefore the identity of every token.

Caveat (round-trip): an empty field `[]` and a single zero byte `[0]` both encode to
OP_0 and both decode back to `[0]`. The token codec (Phase 2) must account for this
rather than relying on truly-empty fields.

At `if (data.length === 0) return { op: OP.OP_0 }`:

⚪ Belt and braces: falling through would give `{ op: 0, data: [] }`, which serialises to the same
  0x00, so no test can tell this line from its absence. It stays because it says WHY the byte is
  0x00 - an empty field is OP_0, not a zero-length push. (Confirmed equivalent by mutation testing.)

At `if (data.length === 1 && data[0] >= 1 && data[0] <= 16) return { op: 0x50 + data[0] }`:

OP_1..OP_16

## appendDrops

```ts
function appendDrops(chunks: ScriptChunk[], count: number): void
```

Append the correct run of OP_2DROP / OP_DROP to drop exactly `count` stack items.

## lock

```ts
export function lock(pubKeyHex: string, fields: number[][]): LockingScript
```

Build a PushDrop locking script: `<pubkey> OP_CHECKSIG <fields...> [drops]`.

@param pubKeyHex Compressed (33-byte) or uncompressed (65-byte) public key, hex.
@param fields    The data fields to embed (opaque bytes; token layout lives in tokenCodec).

At `return new LockingScript(chunks.map(c => ({ op: c.op, data: c.data === undefined ? undefined : u8...`:

⚠ the seam: our chunks carry Uint8Array, this module carries number[]

## PushDropUnlockOptions

```ts
export interface PushDropUnlockOptions {
  /** Output-signing scope. Default 'all'. */
  signOutputs?: 'all' | 'none' | 'single'
  /** Set the ANYONECANPAY flag so other inputs may be added after signing. Default false. */
  anyoneCanPay?: boolean
  // ⚠ `sourceSatoshis` and `lockingScript` USED TO LIVE HERE, as optional overrides that fell back to
  //   reading the parent transaction. They are now required ARGUMENTS, because a BIP-143 signature
  //   commits to both and there is nothing sensible to fall back to. ⇒ Left as optional fields nothing
  //   reads, they would be silently ignored by any caller that still passed them.
}
```

## unlockScript

```ts
export function unlockScript(
  privKey: bigint,
  tx: Tx,
  inputIndex: number,
  lockingScript: Uint8Array,
  sourceSatoshis: number,
  options: PushDropUnlockOptions = {},
): UnlockingScript
```

⚠⚠⚠ THIS REPLACES A TEMPLATE WITH A CALL, AND THAT IS THE SHAPE CHANGE.
  The version this adapts returned a signing callback and a size estimate, for the transaction to invoke
  during its own `sign()` pass, reading the script and amount back out of a parent transaction it
  had been handed. ⇒ Here nothing signs itself: the caller states what is being spent, because a
  BIP-143 signature commits to a script and an amount that the spending transaction does not contain.
  ★ The gain is that a wrong script or a wrong amount is a visible argument rather than a silent
    lookup, and the caller no longer has to carry whole parent transactions around to sign one input.

⚠ SYNCHRONOUS. Signing needs no I/O; it was only ever async because a template had to be awaited.

@param privKey        the owner's scalar
@param lockingScript  the script of the output being SPENT, raw
@param sourceSatoshis that output's value

At `let scope = SIGHASH.FORKID`:

⚠ FORKID is REQUIRED on this chain, never optional - it is what separates this signature scheme
  from the pre-fork one, and omitting it produces a signature no node will accept.

At `const digest = dsha256(preimage(tx, inputIndex, lockingScript, sourceSatoshis, scope))`:

★ The digest is the DOUBLE sha256 of the preimage. The version this adapts reached it by hashing
  once here and relying on the signing call to hash again; stating it once is the same bytes and
  one fewer thing to get wrong.

At `const der = ecdsaSign(privKey, digest, { lowS: true })`:

⚠ lowS: a KEY signature, so normalising is free and a broadcaster may refuse a high-s one.
  ⛔ A covenant-derived signature is the opposite case and must not borrow this.

At `return new UnlockingScript([{ op: sig.length, data: sig }])`:

★ P2PK-style: the unlocking script is just the signature; the public key is already in the lock.

## UNLOCK_SIZE

```ts
export const UNLOCK_SIZE = 73
```

★ For fee estimation before a signature exists: ~72-byte DER + sighash byte + the push opcode.

## DecodedPushDrop

```ts
export interface DecodedPushDrop {
  /** The data fields, in order. */
  fields: number[][]
  /** The locking public key, hex (compressed or uncompressed). */
  pubKeyHex: string
}
```

## decode

```ts
export function decode(script: LockingScript): DecodedPushDrop | null
```

Decode a PushDrop locking script back into `{ fields, pubKeyHex }`, or `null` if the
script is not a well-formed PushDrop output. The field normalization (OP_0 → [0], OP_1..16 → [n],
OP_1NEGATE → [0x81]) is what the chain already holds, and it is robust to malformed input.

Expected layout: `<pubkey> OP_CHECKSIG <field...> [OP_2DROP ...] [OP_DROP]`.

At `const pubData = chunks[0].data`:

chunks[0] = pubkey push, chunks[1] = OP_CHECKSIG

At `pubKeyHex = toHex(serP(decodePoint(pubData)))`:

⚠⚠ NORMALISED TO COMPRESSED, DELIBERATELY. Measured against the deployed behaviour: a script
  locked with an UNCOMPRESSED 65-byte key decodes to the 33-byte compressed form, so
  `decode(lock(uncompressedHex, …)).pubKeyHex` does not return what was passed in. Downstream
  matching relies on that. ⇒ Returning the key verbatim would look like a fix and would change
  which outputs the application believes are its own.

At `if (op === OP.OP_DROP || op === OP.OP_2DROP) break`:

A drop opcode marks the end of the fields section.

At `if (op >= 0x51 && op <= 0x60) data = [op - 0x50]`:

OP_1..OP_16

At `else return null`:

unexpected non-data opcode inside the fields section
