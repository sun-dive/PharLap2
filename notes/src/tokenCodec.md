# src/tokenCodec.js

PHAR LAP token field codec.

Defines what goes inside the PushDrop data fields for each PHAR LAP record type, and
ties the field layouts to the raw-key PushDrop template in `pushDrop.ts`.

Three record types, distinguished by `recordType` (data field [2]):

  TOKEN    (lock = owner)   [ P, version, 0x02, TX1-ref(32B), stateData ]
  TEMPLATE (lock = publisher) [ P, version, 0x01, tokenName, tokenRules(8B), covenantScript, fileHash?(32B) ]
  FILE     (lock = publisher) [ P, version, 0x03, mimeType, fileName, fileBytes ]

Identity = Collection ID = the txid of TX1 (the template transaction), carried by every
token as `TX1-ref`. There is no per-token Token ID and no on-chain proof chain — see
PLAN.md (Addendum C) and docs/DEVIATIONS_FROM_MPT.md.

The PushDrop lock key carries ownership/authorship: the token's lock key is the current
owner; the template/file outputs' lock key is the publisher. So the publisher pubkey is
recovered from the template output via `pushDrop.decode`, not stored as a field.

## P_PREFIX

```ts
export const P_PREFIX: number[] = [0x50] // "P"
```

─── Constants ──────────────────────────────────────────────────────

## P_VERSION

```ts
export const P_VERSION = 0x03
```

"P"

## RECORD_MESSAGE

```ts
export const RECORD_MESSAGE = 0x04
```

Reserved for publisher↔holder messages / announcements (encrypted or public). See PLAN.md Addendum E.

## RECORD_STOREFRONT

```ts
export const RECORD_STOREFRONT = 0x06
```

0x05 = RECORD_EDITION (covenant edition token; defined in covenant.ts).

Immutable storefront metadata (description + optional public cover image) — a TX1 output, locked to
 the publisher. The "what you're buying" face of a collection, public even when the content is encrypted.
 See PLAN.md Step 2 (D3): immutable data lives in an immutable record, never in the mutable stateData.

## RECORD_NOTE

```ts
export const RECORD_NOTE = 0x07
```

A seller's MUTABLE promo note for a collection (review, bonuses, redemption instructions). Public,
 locked to the author's pubkey, keyed to a collection. Lives OUTSIDE the frozen edition covenant so a
 reseller can overwrite it freely (latest published wins); rides onto a buyer's purchase tx at sale
 time so it reaches their wallet. See PLAN.md Step 2 (D3).

## RECORD_PROFILE

```ts
export const RECORD_PROFILE = 0x08
```

A key's self-published PROFILE (display alias + small avatar image), locked to its own pubkey and posted
 on its own address. Resolved by pubkey (latest-by-height wins) so any reader sees a key's @name + face
 without a prior message. Self-gated: only that key funds txs on its address. See profile.ts.

## RECORD_CONFIG

```ts
export const RECORD_CONFIG = 0x09
```

A key's ENCRYPTED self-backup of its local config (alias + address book + prefs), posted on its own
 address and ECIES-encrypted to itself — only that key can read it. Resolved by scanning your own address
 (latest-by-height wins) on WIF restore. See configBackup.ts.

## RECORD_PREVIEW

```ts
export const RECORD_PREVIEW = 0x0A
```

A publisher's PUBLIC audio preview clip for a collection — a "listen before you buy" sample. Locked to the
 publisher's pubkey, keyed to a collection, posted on the publisher's own address and resolved by scan
 (latest-by-publisher wins), exactly like a NOTE — but it carries a binary audio payload (mp3), not text, so
 it lives in its own record instead of bloating the 3 KB note. Plaintext/public: any prospective buyer (and
 the nft.sale curator, which holds no key) plays it with no decryption. See preview.ts.

## RECORD_MOCKUP

```ts
export const RECORD_MOCKUP = 0x0B
```

TX1 output carrying a packed mockup-cover manifest ({prop-txid, place, warp}; see mockup.ts). Optional, tiny
 (~34 B). Tells a renderer to composite this collection's own storefront cover onto the referenced prop.

## RESTRICTION_FUNGIBLE

```ts
export const RESTRICTION_FUNGIBLE = 0x0001 // interchangeable amounts (satoshis = units)
```

tokenRules restrictions bitfield.

## RESTRICTION_REPLICABLE

```ts
export const RESTRICTION_REPLICABLE = 0x0002 // "unlimited mints" edition-replication c...
```

interchangeable amounts (satoshis = units)

## RESTRICTION_TRACK_TRANSFERS

```ts
export const RESTRICTION_TRACK_TRANSFERS = 0x0004
```

"unlimited mints" edition-replication covenant active

Reserved: transfers report to the publisher (1-sat publisher notification) so the publisher can track
 current holders. Publisher's explicit, visible choice at mint; private by default. See PLAN.md Addendum E.

## RESTRICTION_ENCRYPTED

```ts
export const RESTRICTION_ENCRYPTED = 0x0008
```

The embedded file is Tier-1 encrypted: the FILE output holds ciphertext; the template carries the
 wrapped content key + keySalt (see contentCrypto / PLAN.md Addendum F).

## RESTRICTION_COMPRESSED

```ts
export const RESTRICTION_COMPRESSED = 0x0010
```

The embedded file is gzip-compressed (see compress.ts). Decompress on view, AFTER decrypting if also
 encrypted (we always compress before encrypting). Set only when compression actually shrank the file.

## hexToBytes

```ts
function hexToBytes(hex: string): number[]
```

─── Byte / hex / utf8 helpers ──────────────────────────────────────

## bytesToHex

```ts
function bytesToHex(bytes: number[]): string
```

## utf8ToBytes

```ts
function utf8ToBytes(s: string): number[]
```

## bytesToUtf8

```ts
function bytesToUtf8(bytes: number[]): string
```

## isEmptyOrZero

```ts
function isEmptyOrZero(bytes: number[]): boolean
```

PushDrop minimal-push collapses an empty field to OP_0, which `pushDrop.decode`
normalizes back to `[0]`. So an empty hex field round-trips to "00". This only matters
for mutable fields (stateData / covenantScript); identity fields are fixed-length, so the
Collection ID is unaffected (see DEVIATIONS_FROM_MPT.md §4).

## classifyRecord

```ts
export function classifyRecord(script: LockingScript): number | null
```

─── Record-type classification ─────────────────────────────────────

Read the record type (0x01/0x02/0x03) of a PushDrop output, or null if not a PHAR LAP record.

## TokenFields

```ts
export interface TokenFields {
  /** Collection ID — the txid of TX1 (the template tx), 32 bytes hex. */
  tx1Ref: string
  /** Mutable per-UTXO state (hex). Empty round-trips to "00". Not part of identity. */
  stateData: string
}
```

─── TOKEN record ───────────────────────────────────────────────────

## encodeTokenFields

```ts
export function encodeTokenFields(data: TokenFields): number[][]
```

## decodeTokenFields

```ts
export function decodeTokenFields(fields: number[][]): TokenFields | null
```

At `if (fields[3].length !== 32) return null`:

TX1-ref must be a 32-byte txid

## buildTokenScript

```ts
export function buildTokenScript(ownerPubKeyHex: string, data: TokenFields): LockingScript
```

Build a token PushDrop locking script, locked to the owner's public key.

## parseTokenScript

```ts
export function parseTokenScript(
  script: LockingScript,
): { ownerPubKeyHex: string; fields: TokenFields } | null
```

Parse a token PushDrop output → owner pubkey + token fields, or null.

## MessageFields

```ts
export interface MessageFields {
  /** Context reference (32-byte hex): collection id / thread-root txid, or 64 zeros for a standalone DM. */
  ref: string
  /** The message envelope bytes (header + body; built/opened by messageCodec). */
  envelope: number[]
}
```

─── MESSAGE record (Messaging v1) ──────────────────────────────────
A message is a PushDrop output locked to the RECIPIENT's pubkey, structurally a twin of a token:
[P, version, RECORD_MESSAGE, ref(32), envelope]. The `ref` mirrors `tx1Ref` (context: collection id
or thread-root txid, or 32 zero bytes for a standalone DM); the `envelope` mirrors `stateData` and
carries the typed payload (see messageCodec).

## encodeMessageFields

```ts
export function encodeMessageFields(data: MessageFields): number[][]
```

## decodeMessageFields

```ts
export function decodeMessageFields(fields: number[][]): MessageFields | null
```

At `if (fields[3].length !== 32) return null`:

ref must be a 32-byte value

## buildMessageScript

```ts
export function buildMessageScript(recipientPubKeyHex: string, data: MessageFields): LockingScript
```

Build a message PushDrop locking script, locked to the RECIPIENT's public key.

## parseMessageScript

```ts
export function parseMessageScript(
  script: LockingScript,
): { recipientPubKeyHex: string; fields: MessageFields } | null
```

Parse a message PushDrop output → recipient pubkey + message fields, or null.

## TEMPLATE_TAG_LICENSE

```ts
export const TEMPLATE_TAG_LICENSE = 0x01     // payload = utf8 licence CODE (e.g. "TS-C...
```

─── TEMPLATE record (TX1) ──────────────────────────────────────────

Tagged-trailer field tags (leading byte of an optional template field appended after the positional core +
encryption block). Tagging keeps a trailer field from ever colliding with the bare 32-byte fileHash.

## TEMPLATE_TAG_LICENSE_REF

```ts
export const TEMPLATE_TAG_LICENSE_REF = 0x02 // payload = raw bytes of a 32-byte txid p...
```

payload = utf8 licence CODE (e.g. "TS-COM-1", "CC-BY-4.0", "ARR")

## TEMPLATE_LICENSE_MAX

```ts
export const TEMPLATE_LICENSE_MAX = 30
```

payload = raw bytes of a 32-byte txid pointing at the full licence text

Max licence-code length (bytes). Kept < 31 so a [tag,...code] trailer is never exactly 32 bytes (which would
 be indistinguishable from a bare fileHash). Codes are short identifiers, so this is comfortable.

## TemplateFields

```ts
export interface TemplateFields {
  tokenName: string
  /** 8-byte hex: supply, divisibility, restrictions, version (see encodeTokenRules). */
  tokenRules: string
  /** Covenant script bytes (hex). Empty = no covenant (plain PushDrop tokens). */
  covenantScript: string
  /** Optional 32-byte hex SHA-256 of an embedded file (file bytes live in a FILE output). For encrypted
   *  collections this is SHA-256 of the *ciphertext*. */
  fileHash?: string
  /** Tier-1 encrypted content (Addendum F): wrapped content key + its keySalt. Present together, and only
   *  when fileHash is too. Raw bytes (see contentCrypto). */
  wrappedKey?: number[]
  keySalt?: number[]
  /** Optional IMMUTABLE licence code (fixed at mint, travels with the coin) — a short identifier naming the
   *  canonical terms (drives resale/commercial-use logic). See TEMPLATE_TAG_LICENSE. */
  license?: string
  /** Optional 64-hex txid pointing at the full licence text minted on-chain. See TEMPLATE_TAG_LICENSE_REF. */
  licenseRef?: string
}
```

## encodeTemplateFields

```ts
export function encodeTemplateFields(data: TemplateFields): number[][]
```

At `if (data.wrappedKey != null && data.keySalt != null) {`:

wrappedKey + keySalt ride after fileHash (encrypted content always has all three).

At `if (data.license != null && data.license.length > 0) {`:

Tagged licence trailer (backward-compatible): appended AFTER the positional core + encryption block. Each
entry leads with a tag byte, so it can never be read as the bare 32-byte fileHash, and the encryption pair is
located on decode via the isEncrypted rules-flag (not field count).

## decodeTemplateFields

```ts
export function decodeTemplateFields(fields: number[][]): TemplateFields | null
```

At `covenantScript: isEmptyOrZero(fields[5]) ? '' : bytesToHex(fields[5]),`:

Empty covenant normalizes to "00" via OP_0; treat that as "no covenant".

At `if (fields.length > i && fields[i].length === 32) {`:

fileHash is the ONLY bare 32-byte field — trailer entries are tag-prefixed (≥33 bytes for a 32-byte payload,
and licence codes are capped < 31), so a 32-byte field here is unambiguously the file hash.

At `if (decodeTokenRules(result.tokenRules).isEncrypted && fields.length >= i + 2) {`:

The encryption pair (wrappedKey, keySalt) is present exactly when the rules flag says so — a definitive
signal that survives the licence trailer (the old count-based rule would misread trailer fields as keys).

At `for (; i < fields.length; i++) {`:

Tagged licence trailer (optional, any order): each remaining field is [tag, ...payload].

## buildTemplateScript

```ts
export function buildTemplateScript(publisherPubKeyHex: string, data: TemplateFields): LockingScript
```

Build a TX1 template PushDrop locking script, locked to the publisher's public key.

## parseTemplateScript

```ts
export function parseTemplateScript(
  script: LockingScript,
): { publisherPubKeyHex: string; fields: TemplateFields } | null
```

Parse a TX1 template output → publisher pubkey + template fields, or null.

## FileFields

```ts
export interface FileFields {
  mimeType: string
  fileName: string
  fileBytes: number[]
}
```

─── FILE record (TX1, optional) ────────────────────────────────────

## encodeFileFields

```ts
export function encodeFileFields(data: FileFields): number[][]
```

## decodeFileFields

```ts
export function decodeFileFields(fields: number[][]): FileFields | null
```

## buildFileScript

```ts
export function buildFileScript(publisherPubKeyHex: string, data: FileFields): LockingScript
```

Build a FILE PushDrop locking script, locked to the publisher's public key.

## parseFileScript

```ts
export function parseFileScript(
  script: LockingScript,
): { publisherPubKeyHex: string; fields: FileFields } | null
```

## LEGACY_FILE_MARKERS

```ts
const LEGACY_FILE_MARKERS = new Set(['MPT-FILE', 'P-FILE'])
```

─── LEGACY plaintext file format (pre-covenant provenance mints) ────────────────────────────────────
The original on-chain file encoding, superseded by the PushDrop FILE record above but still resolvable so
an origin provenance mint can be reused/played in a Block Media Format composition. Layout:
  OP_FALSE OP_RETURN  <marker>  <mimeType>  <fileName>  <data…>
where <marker> is "MPT-FILE" (Merkle-Proof-Token generation) or "P-FILE" (P-protocol generation). The
content is plaintext + unencrypted — authentic by being the on-chain transaction itself (no separate hash
commitment or Tier-1 wrapping). Extend LEGACY_FILE_MARKERS if further generations appear.

## readLegacyPush

```ts
function readLegacyPush(bytes: number[], i: number): { data: number[]; next: number } | null
```

At `else return null`:

not a pushdata opcode

## parseLegacyFileScript

```ts
export function parseLegacyFileScript(script: LockingScript): { fields: FileFields; marker: string } | null
```

At `if (bytes[i] === 0x00) i++`:

optional OP_FALSE

At `if (bytes[i] !== 0x6a) return null`:

OP_RETURN

At `for (const p of parts.slice(3)) for (const b of p) fileBytes.push(b)`:

concat remaining pushes = the file

## StorefrontFields

```ts
export interface StorefrontFields {
  /** Short blurb shown on the collection / sales page (set at mint, immutable). May be empty. */
  description: string
  /** Optional public (unencrypted) cover image. All three cover fields are present together or absent. */
  coverMimeType?: string
  coverFileName?: string
  coverBytes?: number[]
  /** Optional public BACK cover image (flippable on the sales page). Appended after the front cover, so older
   *  storefronts (7 fields) decode unchanged and older wallets ignore the extra fields. Present together or absent. */
  backCoverMimeType?: string
  backCoverFileName?: string
  backCoverBytes?: number[]
}
```

─── STOREFRONT record (TX1, optional) ──────────────────────────────
Immutable "what you're buying" metadata, carried as its own TX1 output so it stays in an immutable
record (TX1 is the Collection ID tx, never re-created) instead of the mutable stateData field. Every
edition binds to it via tx1Ref, and it is the public face of a collection even when the content file
is Tier-1 encrypted. Layout mirrors FILE with a leading description field:
  [ P, version, RECORD_STOREFRONT, description, coverMimeType, coverFileName, coverBytes ]
A cover image is optional: when absent, the three cover fields are empty and only the description shows.

## encodeStorefrontFields

```ts
export function encodeStorefrontFields(data: StorefrontFields): number[][]
```

At `if (data.backCoverBytes != null && data.backCoverBytes.length > 0) {`:

Only append the back-cover fields when there's a back cover — no-back-cover storefronts stay byte-identical.

## decodeStorefrontFields

```ts
export function decodeStorefrontFields(fields: number[][]): StorefrontFields | null
```

At `const hasCover = !isEmptyOrZero(fields[6])`:

Empty fields round-trip to "00" via OP_0 (see isEmptyOrZero); normalize those back to empty.

## buildStorefrontScript

```ts
export function buildStorefrontScript(publisherPubKeyHex: string, data: StorefrontFields): LockingScript
```

Build a STOREFRONT PushDrop locking script, locked to the publisher's public key.

## parseStorefrontScript

```ts
export function parseStorefrontScript(
  script: LockingScript,
): { publisherPubKeyHex: string; fields: StorefrontFields } | null
```

## encodeMockupFields

```ts
export function encodeMockupFields(manifest: number[]): number[][]
```

─── MOCKUP record (TX1, optional) ──────────────────────────────────
  [ P, version, RECORD_MOCKUP, manifestBytes ]
The manifestBytes are a packed mockup-cover manifest (mockup.ts packCover). A renderer that finds this output
composites the collection's storefront cover (the preview design) onto the referenced prop. Its own output so
it never interleaves with the storefront's optional back-cover fields.

## decodeMockupFields

```ts
export function decodeMockupFields(fields: number[][]): number[] | null
```

At `return fields[3]`:

the packed manifest bytes (pass to mockup.parseCover)

## buildMockupScript

```ts
export function buildMockupScript(publisherPubKeyHex: string, manifest: number[]): LockingScript
```

## parseMockupScript

```ts
export function parseMockupScript(script: LockingScript): { publisherPubKeyHex: string; manifest: number[] } | null
```

## ProfileFields

```ts
export interface ProfileFields {
  alias?: string
  avatarMimeType?: string
  avatarBytes?: number[]
}
```

─── PROFILE record (a key's self-published identity) ───────────────
  [ P, version, RECORD_PROFILE, alias, avatarMimeType, avatarBytes ]
Locked to the publisher's own pubkey, posted on their own address; resolved by pubkey. Both fields
optional: alias-only, avatar-only, or both. The avatar is a small pre-downscaled image (see profile.ts).

## encodeProfileFields

```ts
export function encodeProfileFields(data: ProfileFields): number[][]
```

## decodeProfileFields

```ts
export function decodeProfileFields(fields: number[][]): ProfileFields | null
```

## buildProfileScript

```ts
export function buildProfileScript(ownerPubKeyHex: string, data: ProfileFields): LockingScript
```

Build a PROFILE PushDrop locking script, locked to the owner's public key.

## parseProfileScript

```ts
export function parseProfileScript(
  script: LockingScript,
): { ownerPubKeyHex: string; fields: ProfileFields } | null
```

## BonusKind

```ts
export type BonusKind = 'link' | 'code'
```

─── NOTE record (seller's mutable promo note) ──────────────────────
A public, author-locked note keyed to a collection: [ P, version, RECORD_NOTE, collectionRef(32), text ].
Published standalone by a seller (discoverable via their address history) and/or carried on a buyer's
purchase tx as the notification output. Not part of the edition covenant, so it is freely mutable.

Optional bonus a seller attaches to a note, claimable by the buyer.

## BONUS_LINK

```ts
const BONUS_LINK = 1
```

Trailing note fields are TYPED PAIRs: a 1-byte type marker + its value. Extensible and backward-compatible
(old notes' bonus pair still reads; old clients reading new notes ignore unknown trailing pairs, and — since
the bonus is written first — still find the bonus where they expect it).

## NOTE_TAGS

```ts
const NOTE_TAGS = 4    // space/comma-separated category hashtags
```

a seller-authored listing heading (distinct from the immutable collection title)

## NoteFields

```ts
export interface NoteFields {
  /** Collection id (TX1 txid, 32-byte hex) this note is about. */
  collectionRef: string
  /** The note text (UTF-8) — the listing description / promo. */
  text: string
  /** Optional seller-authored listing heading (updatable; not the immutable collection title). */
  heading?: string
  /** Optional category tags (slug-like, no leading '#'). */
  tags?: string[]
  /** Optional buyer bonus: an external link (seller's site delivers it) or a redeemable code. */
  bonusKind?: BonusKind
  bonusValue?: string
}
```

space/comma-separated category hashtags

## encodeNoteFields

```ts
export function encodeNoteFields(data: NoteFields): number[][]
```

At `if (data.bonusKind != null && data.bonusValue != null && data.bonusValue.length > 0) {`:

Bonus FIRST (so an un-updated client still reads it at fields[5..6]), then the new typed pairs.

## decodeNoteFields

```ts
export function decodeNoteFields(fields: number[][]): NoteFields | null
```

At `for (let i = 5; i + 1 < fields.length; i += 2) {`:

Trailing typed pairs (any order): [typeByte][value].

## buildNoteScript

```ts
export function buildNoteScript(authorPubKeyHex: string, data: NoteFields): LockingScript
```

Build a NOTE PushDrop locking script, locked to the author's public key.

## parseNoteScript

```ts
export function parseNoteScript(
  script: LockingScript,
): { authorPubKeyHex: string; fields: NoteFields } | null
```

## PreviewFields

```ts
export interface PreviewFields {
  /** Collection id (TX1 txid, 32-byte hex) this preview is for. */
  collectionRef: string
  /** Audio MIME (e.g. 'audio/mpeg' for mp3). */
  mimeType: string
  /** The preview clip bytes (a short public sample; ~200–500 KB). */
  previewBytes: number[]
}
```

─── PREVIEW record (a publisher's public audio sample) ─────────────
  [ P, version, RECORD_PREVIEW, collectionRef(32B), mimeType, previewBytes ]
Collection-keyed like NOTE + binary payload like FILE. Locked to the publisher's pubkey, posted on their own
address; resolved by scanning that address (latest-by-publisher wins). Public/plaintext — no encryption.

## encodePreviewFields

```ts
export function encodePreviewFields(data: PreviewFields): number[][]
```

## decodePreviewFields

```ts
export function decodePreviewFields(fields: number[][]): PreviewFields | null
```

## buildPreviewScript

```ts
export function buildPreviewScript(publisherPubKeyHex: string, data: PreviewFields): LockingScript
```

Build a PREVIEW PushDrop locking script, locked to the publisher's public key.

## parsePreviewScript

```ts
export function parsePreviewScript(
  script: LockingScript,
): { publisherPubKeyHex: string; fields: PreviewFields } | null
```

## ConfigFields

```ts
export interface ConfigFields {
  /** Encrypted-to-self envelope bytes (header + ECIES body) carrying the config JSON. */
  envelope: number[]
}
```

─── CONFIG record (a key's encrypted self-backup) ──────────────────
  [ P, version, RECORD_CONFIG, envelope ]
Locked to your own pubkey, posted on your own address. The `envelope` is an ECIES-to-self message envelope
(see messageCodec) carrying the JSON config blob, so only your key decrypts it. Resolved latest-by-height.

## encodeConfigFields

```ts
export function encodeConfigFields(data: ConfigFields): number[][]
```

## decodeConfigFields

```ts
export function decodeConfigFields(fields: number[][]): ConfigFields | null
```

## buildConfigScript

```ts
export function buildConfigScript(ownerPubKeyHex: string, data: ConfigFields): LockingScript
```

Build a CONFIG PushDrop locking script, locked to the owner's own public key.

## parseConfigScript

```ts
export function parseConfigScript(
  script: LockingScript,
): { ownerPubKeyHex: string; fields: ConfigFields } | null
```

## encodeTokenRules

```ts
export function encodeTokenRules(
  supply: number,
  divisibility: number,
  restrictions: number,
  version: number,
): string
```

─── Token rules (8 bytes: 4 × uint16 LE) ───────────────────────────

  Bytes 0-1: supply        (whole tokens minted at genesis; 0 = unlimited / replicable)
  Bytes 2-3: divisibility  (fragments per whole; 0 = indivisible)
  Bytes 4-5: restrictions  (bitfield; see RESTRICTION_*)
  Bytes 6-7: version       (rules schema version)

## DecodedTokenRules

```ts
export interface DecodedTokenRules {
  supply: number
  divisibility: number
  restrictions: number
  version: number
  isFungible: boolean
  isReplicable: boolean
  isUnlimited: boolean
  /** Transfers report to the publisher (RESTRICTION_TRACK_TRANSFERS) — reserved, see Addendum E. */
  isTracked: boolean
  /** The embedded file is Tier-1 encrypted (RESTRICTION_ENCRYPTED) — see Addendum F. */
  isEncrypted: boolean
  /** The embedded file is gzip-compressed (RESTRICTION_COMPRESSED) — decompress after decrypt. */
  isCompressed: boolean
}
```

## decodeTokenRules

```ts
export function decodeTokenRules(rulesHex: string): DecodedTokenRules
```

## collectionId

```ts
export function collectionId(tx1Ref: string): string
```

─── Collection ID ──────────────────────────────────────────────────

The Collection ID is simply the txid of TX1 (the template transaction), which every token
carries as `tx1Ref`. This helper exists for readability/intent at call sites.
