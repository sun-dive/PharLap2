# src/messageCodec.js

PHAR LAP message envelope codec (Messaging v1).

A message is a RECORD_MESSAGE PushDrop output locked to the recipient's pubkey (see tokenCodec),
carrying an `envelope` field that this module builds and opens. The envelope is the typed payload:

  header:  version(1) ‖ flags(1) ‖ senderPubKey(33)
  body:    flags.encrypted ? ECIES(TLV, recipientPub, senderPriv) : TLV

The body is a TLV list of parts, so one message can carry several things at once (a key + a note +
a bonus file). Encryption is authenticated real-key ECIES (electrum): only the holder of the
sender's private key could have produced ciphertext that the recipient decrypts under
(recipientPriv, senderPub) — so the recipient learns *and verifies* who sent it.

Permanence caveat: on-chain payloads are forever. A leaked content key means the ciphertext is
permanently decryptable — an inconvenience, not DRM.

## hexBytesU8

```ts
const hexBytesU8 = (hex: string): Uint8Array =>
```

⚠ hex → the Uint8Array the wallet core speaks, for the two crypto calls below.

## PART_TEXT

```ts
export const PART_TEXT = 0x01
```

Part type bytes.

## PART_ALIAS

```ts
export const PART_ALIAS = 0x05
```

Sender's self-asserted display alias (metadata, not content) — bound to senderPub by the envelope auth.

## PART_TIME

```ts
export const PART_TIME = 0x06
```

Sender's self-asserted send time, UTC epoch milliseconds (metadata). Absolute instant — each reader
 renders it in their own local timezone, so there's no timezone ambiguity in the stored value.

## Part

```ts
export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'key'; key: number[] }
  | { kind: 'file'; mimeType: string; fileName: string; bytes: number[] }
  | { kind: 'fileRef'; sha256: number[]; uri: string }
  | { kind: 'alias'; alias: string }
  | { kind: 'time'; ms: number }
```

## encodeTimeMs

```ts
function encodeTimeMs(ms: number): number[]
```

Encode an epoch-ms timestamp as 6 little-endian bytes (good past the year 10000).

## decodeTimeMs

```ts
function decodeTimeMs(b: number[]): number
```

## writeVarInt

```ts
function writeVarInt(n: number): number[]
```

─── CompactSize varint ─────────────────────────────────────────────

## readVarInt

```ts
function readVarInt(b: number[], off: number): [number, number]
```

## lenPrefixed

```ts
function lenPrefixed(bytes: number[]): number[]
```

## encodePartValue

```ts
function encodePartValue(p: Part): { type: number; value: number[] }
```

─── TLV body (one or more parts) ───────────────────────────────────

## encodeParts

```ts
export function encodeParts(parts: Part[]): number[]
```

## decodeParts

```ts
export function decodeParts(bytes: number[]): Part[] | null
```

At `default: return null`:

unknown part type

## buildEnvelope

```ts
export async function buildEnvelope(opts: {
  senderPriv: Signer
  recipientPubKeyHex: string
  parts: Part[]
  /** Default true (authenticated ECIES to the recipient). */
  encrypt?: boolean
  /** Sender's self-asserted display alias; carried as a PART_ALIAS so recipients can show @name. */
  senderAlias?: string
  /** Sender's send time (UTC epoch ms); carried as a PART_TIME so recipients can show + order by it. */
  sentAt?: number
}): Promise<number[]>
```

─── Envelope (header + body) ───────────────────────────────────────

At `const sentAt = opts.sentAt != null && opts.sentAt > 0 ? opts.sentAt : Date.now()`:

══ ⚠⚠⚠ THE ORDER AND THE PRESENCE OF THESE TWO PARTS ARE A SECURITY MEASURE ═════════════════════

The encryption this envelope uses derives its IV from the shared secret, so it is DETERMINISTIC:
the same plaintext to the same recipient gives the same ciphertext, and because CBC chains block
into block, two messages sharing a leading 16-byte block share a leading CIPHER block, and onward
until they diverge. ⇒ An observer learns how much of two messages is identical, without any key.

⇒ MEASURED on this encoder, two messages from one sender with a 400-byte shared body:
    a constant alias, no timestamp      → 7 of 11 leading blocks identical
    a constant alias, timestamps differ → 1 of 11
    no alias, timestamps differ         → 0 of 11

⇒ SO: the timestamp is REQUIRED, not optional, and it goes FIRST. A millisecond clock differs
  between any two messages, so putting it at the front means the very first block differs and the
  chain diverges immediately. An alias is constant per sender, so leading with one wastes the
  first block on a value an observer already knows.

★ Neither change touches the wire format. Both are inside the plaintext, so every message already
  sent still opens, and a reader needs no new code - `splitMeta` finds parts BY KIND, never by
  position, so old envelopes with the alias first decode exactly as before.
⛔ The real fix would be a random IV, and that WOULD break every existing message. This is what can
  be done without that.

At `let payload = encodeParts(allParts)`:

Smart-compress the TLV (keep only if smaller), BEFORE encrypting — ciphertext is incompressible.

At `const body = encrypt`:

⚠ The sender's public key is NOT put inside the ciphertext: the header already carries it, and
  duplicating it would change the format.

## OpenedMessage

```ts
export interface OpenedMessage {
  senderPubKeyHex: string
  encrypted: boolean
  parts: Part[]
  /** Sender's self-asserted alias (from PART_ALIAS), if they attached one. */
  senderAlias?: string
  /** Sender's self-asserted send time, UTC epoch ms (from PART_TIME), if attached. */
  sentAt?: number
}
```

## splitMeta

```ts
function splitMeta(parts: Part[]): { senderAlias?: string; sentAt?: number; parts: Part[] }
```

Split sender metadata (alias, send time) out of the content parts.

## openEnvelope

```ts
export async function openEnvelope(envelope: number[], recipientPriv: Signer): Promise<OpenedMessage | null>
```

Open (and, if encrypted, decrypt + authenticate) an envelope with the recipient's private key.

At `} catch { return null }`:

wrong key, tampered, or not for us

At `if (compressed) { try { tlv = await decompress(tlv) } catch { return null } }`:

decompress AFTER decrypt

## openPublicEnvelope

```ts
export async function openPublicEnvelope(envelope: number[]): Promise<OpenedMessage | null>
```

Open a PUBLIC (unencrypted) envelope with no key — for broadcasts/announcements anyone can read.
 Returns null for encrypted envelopes (those need `openEnvelope` with the recipient's key).
