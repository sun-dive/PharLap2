# src/app.js

PHAR LAP — browser wallet (single-page app).

Wires the protocol modules (pushDrop / tokenCodec / collectionBuilder / transfer / verify)
to a minimal UI: wallet + balance, mint a collection, my tokens, send, check-incoming, verify.
Raw-key model: a WIF in localStorage; funding/broadcast/fetch via WoC (walletProvider);
verification via verifyTokenLineage. Tokens are tracked locally (PharLapStore) since PushDrop
outputs are not WoC-address-indexed.

## APP_VERSION

```js
const APP_VERSION = '2.01'
```

Phar Lap's version, changed by hand for each release. Shown at the foot of the page as `Smart NFTs · v<version>`.

## APP_BASE

```ts
const APP_BASE = location.pathname.replace(/[^/]*$/, '')
```

The directory this page is served from: '/' at the domain root, '/pharlap2test/' in a test deploy. Every
 server endpoint and share link is built under it, so a copy in a subdirectory never reaches another copy's.

## key

```ts
let key: Signer | null // null in watch-only mode (the online box holds no key)
```

present → watch-only: pubkey hex, no private key on this box

## pubKeyHex

```ts
let pubKeyHex: string
```

null in watch-only mode (the online box holds no key)

## address

```ts
let address: string
```

## provider

```ts
let provider: WalletProvider
```

## store

```ts
let store: PharLapStore
```

## nftView

```ts
let nftView: 'list' | 'grid' = 'list' // My-NFTs view mode (persisted in localStorage)
```

## nftSort

```ts
let nftSort: 'recent' | 'publisher' = 'recent' // My-NFTs grouping: by recency (then MI...
```

My-NFTs view mode (persisted in localStorage)

## lastInbox

```ts
let lastInbox: IncomingMessage[] = [] // last scanned inbox, for re-render after saving...
```

My-NFTs grouping: by recency (then MIME) or by publisher

## lastUpdatesFeed

```ts
let lastUpdatesFeed: UpdateItem[] | null = null // last updates feed, for re-render aft...
```

last scanned inbox, for re-render after saving an alias

## $

```ts
const $ = (id: string): HTMLElement =>
```

last updates feed, for re-render after saving an alias

─── small DOM helpers ──────────────────────────────────────────────

## val

```ts
const val = (id: string): string =>
```

## short

```ts
const short = (s: string, n = 10): string =>
```

## kb

```ts
const kb = (bytes: number): string =>
```

## fmtTime

```ts
const fmtTime = (ms: number): string =>
```

Format a UTC epoch-ms timestamp in the viewer's OWN local timezone (the stored value is timezone-free).

## fmtUtc

```ts
const fmtUtc = (ms: number): string =>
```

Format a UTC epoch-ms timestamp as a fixed UTC string (same for every viewer) — e.g. on-chain provenance.

## setStatus

```ts
function setStatus(msg: string, kind: 'info' | 'error' | 'ok' = 'info'): void
```

## setStatusHtml

```ts
function setStatusHtml(html: string, kind: 'info' | 'error' | 'ok' = 'info'): void
```

Like setStatus, but renders trusted HTML (only ever called with built-in markup + idChip — never raw input).

## idChip

```ts
function idChip(full: string): string
```

A click-to-copy chip: shows a shortened id, copies the FULL value on click (delegated handler below).

## `document.addEventListener('click', e => {`

Delegated click-to-copy: clicking any shortened .copyid chip copies its full value to the clipboard.

## MNEMONIC_KEY

```ts
const MNEMONIC_KEY = 'p2:wallet:mnemonic'
```

─── wallet ─────────────────────────────────────────────────────────

The key is kept SEALED in IndexedDB (src/keystore.ts). WIF_KEY and MNEMONIC_KEY are its plain copies from
before the seal: read once to move them into it, and still written by a browser that cannot keep it sealed.

## DERIVATION_PATH

```ts
const DERIVATION_PATH = "m/44'/236'/0'/0/0"
```

set once the user confirms they've written the seed down

Fixed BIP-44 path (236 = BSV coin type). MUST never change — restores derive the same key from it.

## keyFromMnemonic

```ts
function keyFromMnemonic(phrase: string, passphrase = ''): Signer
```

Derive the wallet private key from a BIP-39 phrase (BIP-32 at the fixed path). Throws on an invalid phrase.

## newSeedWallet

```ts
function newSeedWallet(): { mnemonic: string; key: Signer }
```

Make a fresh seed wallet: a 12-word phrase + the key it derives.

At `const mnemonic = bip39.fromEntropy(crypto.getRandomValues(new Uint8Array(16)))`:

128 bits = 12 words

## words

```ts
let words: string | null = null
```

The open wallet's words, in memory; null for a WIF import and in watch-only.

## keySealed

```ts
let keySealed = false
```

True when this browser keeps the key sealed, false when it could keep only the plain copy.

## wordsOrNull

```ts
const wordsOrNull = (w: string | null | undefined): string | null =>
```

## SEALED_FLAG

```ts
const SEALED_FLAG = 'p2:wallet:sealed'
```

Set while this browser keeps a sealed key, so a load that cannot read the store knows one is waiting there.

## keepSecret

```ts
async function keepSecret(k: Signer, w: string | null, seal = true): Promise<void>
```

Keep a wallet's secret: sealed, then its plain copies deleted. When this browser cannot keep it sealed, as plain
copies, as before; a sealed copy of an earlier wallet is then removed if it can be, so it cannot come back in
place of this one. `seal` false keeps the plain copies only and touches nothing sealed.

At `try { localStorage.setItem(SEALED_FLAG, '1'); localStorage.removeItem(WIF_KEY); localStorage.remo...`:

sealed all the same

At `} catch {`:

not kept sealed: the plain copy below

At `if (seal) try { await forgetSecret(); localStorage.removeItem(SEALED_FLAG) } catch {`:

no usable IndexedDB: nothing sealed there

## dropPlainCopies

```ts
function dropPlainCopies(s: Secret): void
```

Delete the plain copies a sealed secret makes redundant. Copies of a DIFFERENT key are left alone: a key is never lost.

At `} catch {`:

the sealed copy is what loads

## P1_WIF, P1_WORDS, P1_WATCH

```ts
const P1_WIF = 'p:wallet:wif', P1_WORDS = 'p:wallet:mnemonic', P1_WATCH = 'p:wallet:watch'
```

─── Phar Lap 1's wallet: imported, never written ───────────────────

Phar Lap 1 kept its wallet and settings under `p:` names in this same site's storage. ⛔ Phar Lap 2 MUST import
that wallet, whatever page reopens it, and never writes or deletes a `p:` item: Phar Lap 1's key is the original
wallet's key.

## IMPORTED_KEY

```ts
const IMPORTED_KEY = 'p2:wallet:importedFrom1'
```

The Phar Lap 1 wallet imported here: its address, or `watch:` and its public key. Each is imported once, so a
 wallet chosen in Phar Lap 2 afterwards is never replaced by it again.

## P1_WALLET_ITEMS

```ts
const P1_WALLET_ITEMS = ['tokens', 'contacts', 'contactsAt', 'pinned', 'myalias', 'myal...
```

A wallet's own items: where the imported wallet takes another's place, they replace that wallet's.

## P1_JOINED_ITEMS

```ts
const P1_JOINED_ITEMS = ['aliases', 'avatars']
```

Caches of other people's names and pictures: joined, keeping what Phar Lap 2 already has.

## P1_FILLED_ITEMS

```ts
const P1_FILLED_ITEMS = ['nftview', 'nftsort', 'activeTab', 'refBy', 'affRefCode']
```

Settings: copied only where Phar Lap 2 has none.

## ASIDE

```ts
const ASIDE = 'aside:'
```

The name a wallet set aside by an import is kept under, with its address: sealed, or as a plain copy where nothing
 can be sealed. Never deleted.

## pharLap1Wallet

```ts
function pharLap1Wallet(): { key: Signer; words: string | null } | null
```

## copyPharLap1Items

```ts
function copyPharLap1Items(replace: boolean): void
```

Copy Phar Lap 1's items to Phar Lap 2's names. `replace`: its wallet's own items take the place of the ones here.

At `try { localStorage.setItem('p2:' + k, JSON.stringify({ ...JSON.parse(v), ...JSON.parse(ours(k) ??...`:

a cache: it fills in again

## setAside

```ts
async function setAside(k: Signer, w: string | null, seal: boolean): Promise<void>
```

Keep a wallet aside, never deleted: sealed under its own name, or as a plain copy where nothing can be sealed.

At `if (seal) { try { await saveSecret({ wif: k.toWif(), words: w }, ASIDE + k.address()); return } c...`:

the plain copy below

## importPharLap1Watch

```ts
async function importPharLap1Watch(): Promise<void>
```

Phar Lap 1 watch-only, and no wallet with a key here: imported as watch-only. A wallet with a key is never put
aside for a watch-only one, which holds no key.

At `try { if ((await loadSecret()) != null) return } catch {`:

no usable store: nothing sealed there

At `} catch {`:

storage blocked: nothing to import into

## LoadedWallet

```ts
interface LoadedWallet { key: Signer; words: string | null; then: 'recover' | 'fresh' | 'import' | null }
```

What loadWallet found, and what is still to do: a restore (`recover`), a new wallet's backup (`fresh`), or Phar
 Lap 1's wallet chosen in place of one that would not open (`import`).

## loadWallet

```ts
async function loadWallet(): Promise<LoadedWallet>
```

The wallet on this device, in this order: Phar Lap 1's, imported once (sealed, its items copied, in place of any
wallet here, which is kept aside); Phar Lap 2's sealed key; its plain copy from before the seal, moved into it; and
only when none of them exists, a new seed wallet. ⛔ Never a new wallet in place of one that will not open: a sealed
record the browser will not open, or a store that will not open where a key was sealed, is never replaced
unasked (askForUnreadable).

At `let readable = true`:

⚠ When the store cannot be read, whether a sealed key is in it cannot be told either: this load then writes
  nothing there, so a key sealed earlier is never written over.

At `try { await setAside(mine.key, mine.words, readable) } catch { return opened(mine, kept) }`:

never lost: opened as it is

At `const fresh = newSeedWallet()`:

first run: a recoverable phrase

### loadWallet › opened

```ts
async function opened(m: { key: Signer; words: string | null }, sealed: Secret | null): Promise<LoadedWallet>
```

At `try { localStorage.setItem(SEALED_FLAG, '1') } catch {`:

the flag only helps a later load

At `} else await keepSecret(m.key, m.words, readable)`:

the plain copy from before the seal, moved into it

## askForUnreadable

```ts
function askForUnreadable(why: 'unreadable' | 'store', p1: { key: Signer; words: string | null } | null): Promise<LoadedWallet>
```

The wallet will not open: a sealed record the browser will not open (Safari does this when it cannot use the
Keychain key it stored it under), or (`store`) the store it is sealed in. Nothing is written over it until the
person reloads, brings it back with its words or WIF, opens Phar Lap 1's wallet, or chooses a new wallet. The
last three go through switchWallet, which keeps the wallet.

## markBackedUp

```ts
function markBackedUp(): void
```

## needsSeedBackup

```ts
function needsSeedBackup(): boolean
```

A fresh seed wallet the user hasn't confirmed backing up yet (WIF-only wallets have no seed → false).

## useKey

```ts
function useKey(k: Signer, w: string | null): void
```

At `localStorage.removeItem(WATCH_KEY)`:

a real key supersedes any watch-only state

At `void keepStorage()`:

a wallet exists: ask the browser not to evict this site's storage

At `salesCache = null`:

the Sales scan belongs to the previous key

At `provider.seedTransactions(heldTransactions(markerBackup))`:

the wallet's own copies: never fetched again

## useWatchKey

```ts
function useWatchKey(watchPubKeyHex: string): void
```

Load a WATCH-ONLY wallet: holdings/balance/exports/broadcast by public key alone — no private key on
 this box. Signing happens on the offline machine; here every signing action is blocked.

At `provider.seedTransactions(heldTransactions(markerBackup))`:

the wallet's own copies: never fetched again

## isWatchOnly

```ts
function isWatchOnly(): boolean
```

True when no private key is loaded (watch-only).

## requireKey

```ts
function requireKey(): Signer | null
```

Gate a signing action: returns the key, or null (after a status message) when watch-only.

## switchToWatch

```ts
async function switchToWatch(watchPubKeyHex: string): Promise<void>
```

Enter watch-only mode for `watchPubKeyHex`: wipe any local key, clear the (previous wallet's) holdings
 cache, and recover the watched wallet's holdings from chain. Throws, changing nothing, when the public key is
 not valid or the sealed key cannot be removed.

At `const pub = compressedPubKeyHex(watchPubKeyHex)`:

throws on bad input → caller catches

At `try { await forgetSecret() } catch {`:

No private key lives on a watch-only box: the sealed key goes first, and if it will not go, nothing changes.

At `try { left = await loadSecret() } catch {`:

no usable IndexedDB: nothing sealed there

## switchWallet

```ts
async function switchWallet(k: Signer, recover: boolean, mnemonic?: string): Promise<void>
```

Switch the active wallet. The local token store is a CACHE belonging to the previous wallet, so clear it
and (on a restore) rebuild this wallet's holdings: from its token backup first, its history only for what the
backup does not hold. A fresh random wallet has nothing to recover.

At `const w = wordsOrNull(mnemonic)`:

A seed-derived wallet keeps its phrase; a raw-WIF import has none. Kept before it is used, so a reload in
between opens this wallet, not the one it replaced.

At `void restoreConfigFromChain(true).then(n => {`:

Also pull your encrypted config backup (address book + alias + prefs) for this key, and merge it in.

At `}).catch(() => {`:

best-effort

## renderWallet

```ts
function renderWallet(): void
```

At `if (mine) mine.innerHTML = avatarHtml(pubKeyHex, 22)`:

your own avatar (or identicon)

At `document.body.classList.toggle('watch-only', key == null)`:

CSS hides key-only controls

At `const seedEl = document.getElementById('seedPhrase')`:

The WIF and the words are written into the page only while shown (Show, Reveal), and taken out on Hide.

At `hideWif()`:

re-mask on every wallet (re)load so a switched-in key is never left exposed

## hideWif

```ts
function hideWif(): void
```

Take the WIF out of the page and reset the toggle to "Show".

## hideSeed

```ts
function hideSeed(): void
```

Take the words out of the page (the blur stays, for the moment they are shown). Re-hidden on every wallet load.

## toggleSeed

```ts
function toggleSeed(): void
```

At `el.value = key != null ? (words ?? '') : ''`:

watch-only → no secret

## showSeedModal

```ts
function showSeedModal(mnemonic: string, opts: { gated?: boolean; intro?: string; onDone?: () => void } = {}): void
```

Force the backup moment when a new seed wallet is created: show the 12 words, numbered, with a warning.

## SIMPLESWAP_BASE

```ts
const SIMPLESWAP_BASE = 'https://simpleswap.io/'
```

─── Buy BSV (on-ramp) + referral propagation ───────────────────────
SimpleSwap referral (Orange Gateway shut down). The Buy-BSV button opens SimpleSwap (swap any crypto —
incl. stablecoins USDT/USDC — for BSV) and tags a referral chosen by precedence: a share link's ?aff=… (publisher who shared
the page wins) → your own saved ref-code (p:affRefCode) → who gifted you (persisted) → the app default.
SimpleSwap has a TWO-TIER affiliate, so a referrer you brought in still earns you a cut — but the LINK only
ever carries one winning code; the tiering is settled on SimpleSwap's side. Your own code rides on the links
you share (withAff), closing the loop.

## DEFAULT_REF_CODE

```ts
const DEFAULT_REF_CODE = 'efe9f9694b4f'
```

Default SimpleSwap ref-code, used when no other referral is present. This is sun-dive's AFFILIATE code (the
exchange "?ref=" link from partners.simpleswap.io — NOT the customer refer-a-friend code DzckoPqltw, whose
link forces a signup). Buy-BSV becomes simpleswap.io/?ref=<code>&from=btc-btc&to=bsv-bsv (BSV pre-selected).

## incomingAff

```ts
let incomingAff: string | null = null // ref-code carried in on a share link opened thi...
```

## extractRefCode

```ts
function extractRefCode(input: string): string | null
```

ref-code carried in on a share link opened this session

Pull a ref-code out of a SimpleSwap URL — either the exchange link (?ref=…) or the partner-signup link
 (customer-account/signup?referral=…) — or a bare code; null if none.

At `if (/^[A-Za-z0-9_-]{3,}$/.test(s)) return s`:

a bare ref-code

## myRefCode

```ts
function myRefCode(): string | null
```

## refByCode

```ts
function refByCode(): string | null
```

Persisted ref-code of whoever GIFTED this wallet (set on a gift claim; rides in the config backup so it
 survives a wallet restore on a new device). Lets a gifter keep earning from a user they onboarded.

## rememberGifter

```ts
function rememberGifter(): void
```

On a gift claim, remember the gifter's ref-code so their referral persists for this (often new) wallet.

At `try { if (localStorage.getItem('p2:refBy') == null) localStorage.setItem('p2:refBy', incomingAff)...`:

ignore

## buyBsvUrl

```ts
function buyBsvUrl(): string
```

The Buy-BSV (SimpleSwap) URL for the active context. Precedence: a share link's aff (current page) → your
 own saved code → who gifted you (persisted) → app default. `||` so an empty code falls through cleanly.
 Pre-selects a BTC → BSV swap of ~0.001 BTC (a sane default ≈ $60 of BSV; SimpleSwap's own default is a
 wild 0.1 BTC). The buyer can still change the source coin and the amount.

## onBuyBsv

```ts
function onBuyBsv(): void
```

## withAff

```ts
function withAff(url: string): string
```

Append your referral code to a share URL so buyers who open it fund up under YOUR ref-code.

## collectionShareUrl

```ts
function collectionShareUrl(txid: string, holder: string, giftWif?: string): string
```

A shareable collection link. The collection id goes in the PATH (/c/<txid>) so link-preview crawlers
 see it (share.php renders per-NFT Open Graph from that); the holder + gift voucher stay in the #hash —
 client-only, so the voucher key is never sent to the server. share.php redirects real visitors to the
 app's `#c=…` route, so the app itself is unchanged.

## shortShareBase

```ts
async function shortShareBase(txid: string, holder: string): Promise<string | null>
```

Shorten a share link via the server: registers {txid, holder, referral} (PUBLIC only — never the
 voucher) and returns `${origin}/s/<code>` for the caller to append a gift voucher to as a #hash, or
 null if the server is unreachable (callers fall back to the full /c/<txid> link, which still works
 and still previews). The referral is folded into the code, so it drops out of the visible link.

At `} catch {`:

fall back to the full link

## coverToJpegDataUrl

```ts
function coverToJpegDataUrl(cover: { mimeType: string; bytes: number[] }): Promise<string | null>
```

Re-encode a cover image to a JPEG data URL (crawler-friendly; some don't render WebP) via canvas.

## ogRegistered

```ts
const ogRegistered = new Set<string>()
```

Push a collection's PUBLIC preview assets (cover + title + description) to the server cache so shared
 links get a rich per-NFT preview. Idempotent + fire-and-forget — failure just falls back to the default
 banner. NEVER sends the gift voucher (public data only).

## registerOgAssets

```ts
async function registerOgAssets(info: CollectionInfo): Promise<void>
```

At `} catch { ogRegistered.delete(info.tx1Ref)`:

allow a later retry

## renderAffField

```ts
function renderAffField(): void
```

Show the saved referral code in its field (called on load).

## onSaveAff

```ts
function onSaveAff(): void
```

Save (or clear) the user's SimpleSwap referral code from the settings field.

At `try { localStorage.removeItem('p2:affRefCode') } catch {`:

ignore

At `try { localStorage.setItem('p2:affRefCode', code) } catch {`:

ignore

## QrDecode

```ts
type QrDecode = (d: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts?: string }) => { data: string } | null
```

─── QR scanning (camera) ───────────────────────────────────────────
Opens the camera in a modal and resolves with the first QR's text (or null if cancelled / no camera). Uses
the native BarcodeDetector where available (Chromium/Android, zero cost); on browsers without it (iOS Safari,
Firefox) it LAZY-LOADS a vendored jsQR (./jsqr.min.js) on first use, so the core bundle isn't bloated.

## JSQR_INTEGRITY

```js
const JSQR_INTEGRITY = 'sha384-…'
```

The QR scanner's hash. The app adds jsqr.min.js to the page itself, so index.html does not name it; this hash,
inside app.js, which index.html does name, makes the browser refuse a changed copy. Written by
tools/integrity.mjs; never edited by hand.

## jsqrFn

```ts
let jsqrFn: QrDecode | null = null
```

## loadJsqr

```ts
async function loadJsqr(): Promise<QrDecode | null>
```

## scanQrModal

```ts
async function scanQrModal(title: string): Promise<string | null>
```

At `await video.play().catch(() => {`:

autoplay quirks — the frame loop still reads it

At `let decode = null`:

No native detector (iOS Safari / Firefox) → lazy-load the vendored jsQR now (one-time ~46 KB fetch).

### scanQrModal › tick

```ts
const tick = async (): Promise<void> =>
```

At `} catch {`:

transient decode error — keep scanning

## normalizeScan

```ts
function normalizeScan(kind: string | undefined, text: string): string
```

Normalize a scanned string for the target field (strip a payment URI scheme; pull a pubkey from a share link).

## onScanInto

```ts
async function onScanInto(input: HTMLInputElement, kind: string | undefined): Promise<void>
```

Scan a QR into an input field, then fire `input` so any live preview updates.

## wireScanButtons

```ts
function wireScanButtons(): void
```

Inject a 📷 button beside every `input[data-scan]`, wrapping the pair in a flex row.

## refreshBalance

```ts
async function refreshBalance(): Promise<void>
```

## readFile

```ts
async function readFile(input: HTMLInputElement): Promise<{ mimeType: string; fileName: string; bytes: number[] } | undefined>
```

─── mint ───────────────────────────────────────────────────────────

## readContent

```ts
async function readContent(input: HTMLInputElement, albumName: string): Promise<{ mimeType: string; fileName: string; bytes: number[] } | undefined>
```

Read a content input: ONE file → that file; MULTIPLE → packed into a single PharLap album container
 (one blob to the chain — covenant/provenance unchanged). Tracks are ordered by filename, so numbering
 them 01.., 02.. controls the order. The whole release is hash-committed + timestamped as one unit.

## confirmAudioFidelity

```ts
function confirmAudioFidelity(file: { mimeType: string; fileName: string; bytes: number[] }): boolean
```

Non-blocking heads-up before embedding large or lossless audio on-chain (it's permanent and the fee
 scales with size). A WARNING, not a gate — returns true to proceed (always an option, for max-fidelity
 masters), false only if the user explicitly cancels. Silent when there's nothing to flag.

At `const big = file.bytes.length > 8 * 1024 * 1024`:

8 MB

## onMint

```ts
async function onMint(): Promise<void>
```

## EDITION_BOND_SATS

```ts
const EDITION_BOND_SATS = 1
```

─── editions (experimental covenant) ──────────────────────────────

Default refundable bond (sats) each edition rides on; the publisher overrides it per collection at mint.

## fmtPrice

```ts
function fmtPrice (sats: number): string
```

Readable price: large amounts as BSV (0.485 BSV / 1.25 BSV, ≥ 0.01 BSV), small ones as whole sats.

## chosenBond

```ts
function chosenBond(): number
```

The bond chosen in the mint form (≥ 1 sat dust floor).

## feeMode

```ts
let feeMode: 'fixed' | 'pct' = 'fixed' // Publish pricing input mode (both mint plain v...
```

## computeFees

```ts
function computeFees(): { publisherFeeSats: number; holderFeeSats: number }
```

Publish pricing input mode (both mint plain v1 fixed fees)

Resolve the fixed (publisher, holder) fees from the active Publish pricing mode. Percentage mode is a
 calculator: the fee pot = final price − bond; the reseller (holder) keeps its net share, publisher the
 rest. Both floored at 1 sat (a 0-sat fee is dust + leaves no sale signal). Minted as plain v1 fixed-fee.

At `const fees = Math.max(2, (parseInt(val('edPrice') || '0', 10) || 0) - bond)`:

≥2 so each fee ≥1

## ownTerms

```ts
function ownTerms(): EditionTerms
```

## setFeeMode

```ts
function setFeeMode(mode: 'fixed' | 'pct'): void
```

Toggle the Publish pricing input mode + refresh the percentage preview.

## updateFeePctPreview

```ts
function updateFeePctPreview(): void
```

At `if (enteredPrice < bond + 2) {`:

price must clear the bond with room for both fees

## termsFromToken

```ts
function termsFromToken(t: StoredToken): EditionTerms
```

## storeEdition

```ts
function storeEdition(o: { txId: string; outputIndex: number; lockHex: string }, collectionId: string, name: string, terms: EditionTerms, note?: SellerNote | null): void
```

## COVER_OUT

```ts
const COVER_OUT = 800
```

── Cover crop + resize: a square 800×800 WebP (JPEG fallback) so on-chain covers stay small + uniform ──

## croppedCover

```ts
let croppedCover: { mimeType: string; fileName: string; bytes: number[] } | null = null
```

## coverPrevUrl

```ts
let coverPrevUrl: string | null = null
```

## paintCoverPreview

```ts
function paintCoverPreview(blob: Blob | null): void
```

## isAnimatedImage

```ts
async function isAnimatedImage(f: File): Promise<boolean>
```

True for an animated WebP (has an ANIM chunk) or a GIF — running these through the crop canvas would
 flatten them to a single static frame, so we offer to keep them as-is instead.

## isSvgImage

```ts
function isSvgImage(f: File): boolean
```

True for an SVG — vector + often self-animating (SMIL). Running it through the raster crop canvas would
 flatten it to one static frame (or fail to load on a heavy animated SVG), so we keep it as-is instead.

## cropAndStoreCover

```ts
async function cropAndStoreCover(f: File): Promise<boolean>
```

Crop a chosen image (file or photo) and store the processed cover bytes. Returns false if cancelled.
 An animated WebP/GIF — or an SVG — is offered as a pass-through (keeps the animation / vector sharpness)
 rather than being flattened by the raster crop.

At `if (svg) return false`:

never rasterise an SVG through the crop canvas — that's the path that was failing

## onCoverSelected

```ts
async function onCoverSelected(): Promise<void>
```

Cover file picked from disk → crop + store (clear the input if the crop is cancelled).

## onTakePhoto

```ts
async function onTakePhoto(): Promise<void>
```

"Take photo" → open the camera, capture a frame, then run it through the same crop flow.

At `;($('edCover')).value = ''`:

a captured photo supersedes any file selection

## capturePhotoModal

```ts
async function capturePhotoModal(): Promise<File | null>
```

Open the device camera in a modal; resolve a captured still as a File, or null if cancelled.

At `await video.play().catch(() => {`:

autoplay quirks — the still capture still works

## openCropModal

```ts
function openCropModal(file: File): Promise<Blob | null>
```

Interactive square crop + downscale → WebP (JPEG fallback). Resolves the Blob, or null if cancelled.

At `const base = Math.max(VIEW / img.width, VIEW / img.height)`:

zoom=1 just covers the square

At `{ const { w, h } = dims(); ox = (VIEW - w) / 2; oy = (VIEW - h) / 2 }`:

start centered

At `const k = canvas.width / (canvas.clientWidth || canvas.width)`:

CSS px → buffer px (canvas may display smaller)

## chosenLicense

```ts
function chosenLicense(): string
```

The licence code chosen in the Publish form ('' = none). "Custom code…" reveals a free-text input.

## downscaleWebp

```ts
async function downscaleWebp(bytes: number[], mimeType: string, maxDim: number): Promise<number[]>
```

Downscale image bytes to WebP at maxDim (longest side) — used to derive the public preview cover.

## PublishTier

```ts
type PublishTier = 'unlimited' | 'limited' | 'exclusive'
```

── Publish tier: Unlimited (covenant) / Limited (plain capped-N) / Exclusive (plain 1-of-1) ──

## publishTier

```ts
let publishTier: PublishTier = 'unlimited'
```

## setPublishTier

```ts
function setPublishTier(t: PublishTier): void
```

Switch the Publish form between the covenant edition path and the plain capped-supply tiers: toggle the
 covenant-only fields (bond / pricing / combine), adapt the quantity control, and relabel the mint button.

## onMintEdition

```ts
async function onMintEdition(): Promise<void>
```

At `const mockupF = ($('edMockupFile'))?.files?.[0]`:

Mockup attachment: if a .bmc bundle is attached, mint this as a PRODUCT mockup (design composited on a prop).
Reuses the form's Type toggle (Unlimited = covenant / Limited / Exclusive), fees, bond, licence and encrypt —
the bundle supplies the content (clean design) + preview cover. Delegates to mintMockupProduct.

At `const propTxid = val('edMockupProp').trim() || bundle.recipe.propTxid || undefined`:

Reuse a prop: the form field wins; otherwise honour a propTxid baked into the bundle (Prop catalogue pick).

At `const dmime = bundle.designMime`:

The design master is FULL-RES + original format (PoD quality) — mint it verbatim as the sellable clean
FILE. Derive a display-res preview (1024, WebP) for the public cover; the curator downsamples that again.

At `const dbmp = await createImageBitmap(new Blob([new Uint8Array(bundle.design)], { type: dmime }))`:

The design's own dimensions classify its socket ratio — a new prop is minted to accept exactly this shape.

At `const file = combineMode ? await buildCombinedManifest(name) : await readContent($('edFile'), name)`:

Combine mode mints an EP whose content is a REFERENCE manifest (pointers to existing mints, no re-upload);
otherwise embed the picked file(s) as usual.

At `const cover = croppedCover ?? await readFile($('edCover'))`:

prefer the cropped/resized cover

At `const backCover = await readFile($('edBackCover'))`:

optional flippable back cover (sales page)

At `if (publishTier !== 'unlimited') {`:

Plain capped-supply tiers (Limited / Exclusive): no covenant, fixed supply. The publisher holds the run and
transfers one token per sale. Encrypted product + storefront cover ride the same shared pipeline as editions.

At `const terms = ownTerms()`:

Fixed-fee editions.

## buildCombinedManifest

```ts
async function buildCombinedManifest(epName: string): Promise<{ mimeType: string; fileName: string; bytes: number[] } | undefined>
```

── Combine mode: mint an EP whose content is a reference manifest (pointers to existing mints) ──

Read each picked collection's committed fileHash + name — a cheap template-only load via loadCollection,
 NOT a content download — and pack them into a reference manifest to mint as the EP's content. Returns
 undefined if fewer than 2 are picked (an EP needs at least two). Throws if a pick has no embedded content.

## checkedCombineIds

```ts
function checkedCombineIds(): string[]
```

## updateCombineHint

```ts
function updateCombineHint(): void
```

## renderCombinePicker

```ts
function renderCombinePicker(): void
```

Populate the combine picker from the collections this wallet holds (deduped) — your singles to bundle.

## noteToPropagate

```ts
async function noteToPropagate(t: StoredToken): Promise<SellerNote | undefined>
```

The note (promo + bonus) to carry when I sell/transfer an edition I hold: my own published note wins,
 else the note that came with this copy (sticky default → hands-off propagation).

At `try { const p = await resolveSellerNote(provider, pubKeyHex, t.collectionId); if (p && noteHasCon...`:

best-effort

## pruneIfEditionSpent

```ts
async function pruneIfEditionSpent(t: StoredToken): Promise<boolean>
```

When a covenant action is rejected with "missing or spent", the edition's UTXO may be genuinely gone
 (already moved/burned, possibly in another session/wallet) while still lingering in the local cache —
 PushDrop editions aren't address-indexed, so Refresh can't reconcile them. Confirm by querying the
 edition's own locking script: if its exact outpoint is no longer unspent, drop the stale entry so the
 dead card self-heals. Returns true if it pruned (genuinely spent), false if still live (transient/unpropagated).

At `const spender = await provider.getSpendingTx(t.txId, t.outputIndex)`:

⚠ RETIRE ONLY ON A NAMED SPENDER. The by-script unspent list was used here before, and a holding was
retired because the explorer's answer happened to be empty while the copy was live. An output that is
gone has a transaction that took it; the explorer names it, and nothing less counts.

At `if (spender == null) return false`:

no spender on record — keep it

At `store.markSent(t.txId, t.outputIndex)`:

genuinely spent: retire the stale active entry

At `return false`:

network hiccup — don't prune on uncertainty

## onReplicate

```ts
async function onReplicate(t: StoredToken): Promise<void>
```

At `const bondNote = editionSupportsBurn(hexBytes(t.lockHex))`:

A bonded edition's replica carries the same refundable bond — the dominant non-fee cost — so call it out.

At `store.markSent(t.txId, t.outputIndex)`:

The original UTXO is now spent; it was re-created at out[0] (token back to the holder = us, verbatim).

At `storeEdition({ txId: r.replicaOutpoint.txId, outputIndex: r.replicaOutpoint.outputIndex, lockHex:...`:

The buyer's new replica (out[1]) is also ours in a self-test — it carries the propagated note.

## onTransferEdition

```ts
async function onTransferEdition(t: StoredToken): Promise<void>
```

## pendingListPartner

```ts
let pendingListPartner: string | null = null
```

Onboard a listing partner: transfer THIS copy to a listing wallet's pubkey (a curation site, or your own
 cold listing wallet). That wallet holds + resells the copy, collecting the reseller fee on sales via its
 link; the publisher fee still goes to the collection's publisher. Returns the wallet's ready listing link.

Set by a "List your NFT here" deep link (#list=<pubkey>): the listing wallet to onboard the next copy to.

## onOnboardPartner

```ts
async function onOnboardPartner(t: StoredToken): Promise<void>
```

At `partner = pendingListPartner`:

Pre-filled from a curation site's "List your NFT here" link — the publisher just picks a collection + confirms.

At `pendingListPartner = null`:

consume the one-shot deep-link target

## showPartnerLinkModal

```ts
function showPartnerLinkModal(name: string, link: string, partnerPubKey: string): void
```

Show the partner's ready-made listing link (copyable + QR) after onboarding.

## onBurn

```ts
async function onBurn(t: StoredToken): Promise<void>
```

Burn an owned edition: owner-signed spend that destroys the token and reclaims its bond to your wallet.

At `store.markSent(t.txId, t.outputIndex)`:

the token is destroyed

At `if (/missing inputs|missingorspent/i.test(msg)) {`:

The node's "Missing inputs" (bad-txns-inputs-missingorspent) means the edition's UTXO is either not yet
visible (unconfirmed/unpropagated) OR already spent. A raw-tx fetch 404 = the parent tx isn't indexed yet.
Don't claim "unconfirmed" — it may have been moved or already burned and the local cache is stale.

## downloadText

```ts
function downloadText(filename: string, text: string, mime = 'text/plain'): void
```

─── air-gapped signing (Advanced) ──────────────────────────────────
Online box exports an unsigned request → offline box signs it with the key → online box broadcasts.
Only files cross the gap; the key never leaves the offline machine. Engine in airgap.ts.

## readFileText

```ts
function readFileText(input: HTMLInputElement): Promise<string | null>
```

## populateAirgapEditions

```ts
function populateAirgapEditions(): void
```

Fill the edition picker with the wallet's held covenant editions (the only spendable air-gap targets).

## syncAirgapAction

```ts
function syncAirgapAction(): void
```

Toggle the recipient field by the chosen action (burn needs no recipient).

## onAirgapExport

```ts
async function onAirgapExport(): Promise<void>
```

Step 1 (online): gather the edition + funding inputs and download a keyless signing request.

At `const funding = await Promise.all(selected.map(async u => ({ utxo: u, sourceTx: await provider.ge...`:

The request carries each funding input's source transaction, so the offline signer can check it.

## pendingSignReq

```ts
let pendingSignReq: AirgapRequest | null = null
```

## onAirgapSignFile

```ts
async function onAirgapSignFile(): Promise<void>
```

Step 2a (offline): read + validate an imported request and show what will be signed.

## onAirgapSign

```ts
async function onAirgapSign(): Promise<void>
```

Step 2b (offline): sign the imported request with this wallet's key and download the signed raw tx.

At `const k = requireKey(); if (k == null) return`:

signing happens on the offline (keyed) box, not a watch-only one

## cosignRaw

```ts
let cosignRaw: string | null = null
```

─── Co-signing (any transaction, not just this app's) ──────────────

Phar Lap's air-gap signer rebuilds what it signs, which is the right rule and stays the rule for the
actions it knows. This is the other case: a transaction assembled elsewhere, around a script this
wallet has never heard of, with a blank left where its signature goes. It cannot be rebuilt here —
but it does not have to be TRUSTED either, because what it costs is derivable from its own bytes.
See src/cosign.ts for why that is enough.

## cosignSources

```ts
let cosignSources: CosignSource[] = []
```

## cosignSigned

```ts
let cosignSigned: string | null = null
```

## onCosignRead

```ts
async function onCosignRead(): Promise<void>
```

Read the pasted/imported transaction, fetch every input's source, and report what signing would do.

At `const ids = [...new Set(tx.inputs.map((i) => wireToTxid(i.txid)))]`:

Every input's source is needed to know its VALUE — without which the fee, and therefore the true
cost of signing, cannot be worked out. cosign.ts refuses rather than guess, so gather them first.

At `catch {`:

left out deliberately: analyseCosign reports the gap rather than papering over it

## renderCosign

```ts
function renderCosign(a: CosignAnalysis): void
```

Put the DERIVED figures in front of the signer. Nothing here is taken from the sender's description.

At `` else if (o.kind === 'data') what = `data · <span style="opacity:.85">${esc(o.text ?? '')}</span>` ``:

A stranger's bytes. Escaped and shown as TEXT — never linkified, whatever it looks like.

## onCosignSign

```ts
async function onCosignSign(): Promise<void>
```

Sign this wallet's inputs. Everything else in the transaction is left byte-for-byte alone.

## onCosignBroadcast

```ts
async function onCosignBroadcast(): Promise<void>
```

## onAirgapBroadcast

```ts
async function onAirgapBroadcast(): Promise<void>
```

Step 3 (online): broadcast a signed raw tx imported from the offline machine.

## readSendBsvForm

```ts
function readSendBsvForm(): { toAddress: string; amountSats: number; sendMax: boolean } | null
```

─── Send BSV (plain P2PKH payment) ─────────────────────────────────

Read + validate the Send-BSV form. Returns null (after setting an error status) if invalid.

## onSendBsv

```ts
async function onSendBsv(): Promise<void>
```

Online: build, sign and broadcast a plain BSV payment.

## onSendBsvExport

```ts
async function onSendBsvExport(): Promise<void>
```

Air-gap: gather the funding online and export an unsigned payment request to sign offline.

At `const dry = await buildPaymentTx({ key: Signer.fromPrivateKey(crypto.getRandomValues(new Uint8Arr...`:

Dry-run the build to surface the exact figure (and catch insufficient funds) before exporting. Uses a
throwaway key purely for SIZING — the tx is never broadcast and the real signer rebuilds it — so this
works even in watch-only mode where no private key is present.

## onSend

```ts
async function onSend(txId: string, outputIndex: number): Promise<void>
```

─── send ───────────────────────────────────────────────────────────

## onSendMessage

```ts
async function onSendMessage(): Promise<void>
```

─── messaging ──────────────────────────────────────────────────────

## onPublishProfile

```ts
async function onPublishProfile(): Promise<void>
```

Publish your profile (alias + optional avatar) on-chain so others resolve your @name + face by pubkey.

## onCheckMessages

```ts
async function onCheckMessages(): Promise<void>
```

At `const k = requireKey(); if (k == null) return`:

messages are encrypted to the key; can't read them watch-only

At `applyLatestAliases(msgs.map(m => ({ pk: m.senderPubKeyHex, alias: m.senderAlias })))`:

Apply only each sender's LATEST self-claim. msgs are newest-first, so the first alias seen per sender
is the newest — applying every message would let an older one revert a more recent rename.

## renderInbox

```ts
function renderInbox(msgs: IncomingMessage[]): void
```

At `card.className = 'token msg'`:

.msg overrides the NFT flex-row so content stacks and actions sit bottom-left

## onReply

```ts
function onReply(m: IncomingMessage): void
```

Reply: drop the sender's key into the compose box, match its privacy, and focus the message field.

## nameCache

```ts
const nameCache = new Map<string, string>()
```

─── check incoming ─────────────────────────────────────────────────
A received edition's token doesn't carry the collection title (that lives in TX1's template), so the
incoming scan defaults it to "Edition". Resolve the real name from TX1 (cached per collection).

## latestBroadcast

```ts
const latestBroadcast = new Map<string, Broadcast>()
```

Latest publisher announcement per collection, filled by the Updates feed; My tokens shows it inline.

## resolveCollectionName

```ts
async function resolveCollectionName(tx1RefHex: string): Promise<string>
```

At `} catch {`:

keep fallback

## backupTxIdsNotHeld

```ts
function backupTxIdsNotHeld(): string[]
```

The transactions the backup records whose tokens the wallet's list does not hold: read them even when old.

## heldEditionScripts

```ts
function heldEditionScripts(): Map<string, string>
```

Edition scripts the wallet's list already holds, with their collection: the edition scan's starting point.

## onCheckIncoming

```ts
async function onCheckIncoming(opts: { full?: boolean } = {}): Promise<void>
```

Find new and moved tokens. LOCAL FIRST: when this wallet has a token backup, only transactions above its last
block are read from the wallet's history, plus any it records whose tokens are not in the list; every held edition is
still checked for where it now is. `full` reads the whole history instead: the fallback with no backup.

At `const since = localFirst ? markerBackup.readToHeight - 1 : -1`:

the top block read is read again

At `for (const t of store.list()) if (t.collectionName && t.collectionName !== 'Edition' && !nameCach...`:

Names the list already holds: no first transaction of a collection is fetched just to read its name.

At `try {`:

Plain PushDrop tokens.

At `else if (t.height) store.setHeightHint(t.txId, t.outputIndex, t.height)`:

a token stored before its height was kept

At `try {`:

Edition covenant outputs (not address-indexed) — found via the transfer notification breadcrumb.
Run independently so a plain-scan failure can't block it.

At `if (store.reactivate(e.txId, e.outputIndex)) edAdded++`:

A retired entry the chain still shows unspent comes back: the scan is the authority, not the last click.

At `store.setCollectionName(e.txId, e.outputIndex, name)`:

backfill the real title on older "Edition" entries

At `if (e.height) store.setHeightHint(e.txId, e.outputIndex, e.height)`:

and the block, on entries stored without it

## MARKERS_KEY_PREFIX

```ts
const MARKERS_KEY_PREFIX = 'p2:markers:'
```

─── token backup: every marker and token this wallet has received ──

Kept in this browser per address, brought up to date each time a wallet loads (only what is new since
the last use is fetched), and saved as a file to move to another device. See src/markerBackup.ts.

## markerBackup

```ts
let markerBackup: MarkerBackup = emptyMarkerBackup('')
```

## markerChecks

```ts
let markerChecks = 0
```

Restores and rescans still checking the wallet's history. A count: a key restore and a file restore can overlap.

## loadMarkerBackup

```ts
function loadMarkerBackup(addr: string): MarkerBackup
```

At `} catch {`:

unreadable: a fresh record, rebuilt from the history by the next refresh

## withTokenList

```ts
function withTokenList(b: MarkerBackup): MarkerBackup
```

The backup with the wallet's current token list, when the list belongs to that wallet.

## forFile

```ts
function forFile(b: MarkerBackup): MarkerBackup
```

The backup as saved to a file: with the token list and each collection's card data, as cached here.

At `if (mime === undefined || !thumbResolved(id)) continue`:

not resolved here: the restore fetches it

## applyCards

```ts
function applyCards(cards: Record<string, CardData> | undefined): void
```

Put a backup's card data into this browser's cache, for collections it has not resolved itself.

## saveMarkerBackup

```ts
function saveMarkerBackup(b: MarkerBackup): void
```

At `const { cards: _cards, ...local } = withTokenList(b)`:

Card data is left out here: this browser already caches it, under its own keys.

At `try { localStorage.setItem(MARKERS_KEY_PREFIX + b.address, JSON.stringify(local)) } catch {`:

blocked or full: the file still works

## updateMarkerNote

```ts
function updateMarkerNote(text?: string): void
```

At `const busy = markerRefreshRunning || markerChecks > 0 ? ' Checking for newer transactions…' : ''`:

While work runs, the count shown is from before it: say so, or it reads as the result.

## refreshMarkerBackup

```ts
async function refreshMarkerBackup(): Promise<void>
```

Bring this wallet's token backup up to date. The result is JOINED to the backup current when it finishes, so
a file restored while it ran is kept. A wallet switched mid-run gets its own run straight after.

## restoreChoicePending

```ts
let restoreChoicePending = false
```

Set while a restore waits for the person to choose: a backup file, or reading the wallet's whole history.

## showRestoreChoice

```ts
function showRestoreChoice(on: boolean): void
```

The choice has its OWN line under the status line. ⚠ In the status line itself, the next message (the
balance check's "Balance updated.") replaced it within seconds, before anyone could choose.

## restoreTokens

```ts
function restoreTokens(): void
```

After a restore: apply what this browser already holds for the wallet, or ask before reading its history.

## applyBackup

```ts
async function applyBackup(b: MarkerBackup, from: string): Promise<void>
```

Put a backup's tokens and transactions in place, then read from the wallet's history only what is newer.

## rescanWalletHistory

```ts
async function rescanWalletHistory(): Promise<void>
```

The fallback with no backup: read the whole history, then record it.

## checkForNewer

```ts
async function checkForNewer(opts: { full?: boolean } = {}): Promise<void>
```

Check the wallet's history, then bring the backup up to date. The backup line says it is checking until both
 are done.

## onTokenBackupSave

```ts
function onTokenBackupSave(): void
```

## onTokenBackupRestore

```ts
async function onTokenBackupRestore(): Promise<void>
```

## onVerify

```ts
async function onVerify(txId: string, outputIndex: number): Promise<void>
```

─── verify ─────────────────────────────────────────────────────────

At `const out = tx.outputs[outputIndex]`:

Edition covenant: O(1) bind to the collection — byte-match the token's covenant against the template
TX1 committed (proves genuine, immutable rules; no lineage walk needed — see verify.ts / MPT thesis).

At `` let anchor = `TX1 ${short(r.collectionId ?? '')}` ``:

Provenance: the collection's on-chain anchor (TX1) — its txid + when it was mined (best-effort).

At `} catch {`:

provenance is best-effort

At `let name = ''`:

Read collection name from TX1 for display.

At `} catch {`:

ignore

## viewerUrl

```ts
let viewerUrl: string | null = null
```

─── file viewer ────────────────────────────────────────────────────

## CachedContent

```ts
interface CachedContent { mimeType: string; fileName: string; bytes: Uint8Array; verified: boolean; msg: string }
```

─── Content cache (IndexedDB) ──────────────────────────────────────────────
Persist DECODED NFT content locally so re-opening it is instant + works offline, instead of re-pulling
(and re-decoding) the whole tx from chain every time. Keyed by collection id. localStorage is far too
small (~5 MB) for media; IndexedDB handles hundreds of MB. Entirely best-effort — any failure (private
mode, quota, no IndexedDB) silently falls back to fetching from chain.

## contentDbPromise

```ts
let contentDbPromise: Promise<IDBDatabase | null> | null = null
```

## openContentDb

```ts
function openContentDb(): Promise<IDBDatabase | null>
```

## cachedContentGet

```ts
async function cachedContentGet(key: string): Promise<CachedContent | null>
```

## cachedContentPut

```ts
async function cachedContentPut(key: string, value: CachedContent): Promise<void>
```

## DecodedContent

```ts
interface DecodedContent { mimeType: string; fileName: string; bytes: number[]; verified: boolean; msg: string }
```

## fetchCollectionContent

```ts
async function fetchCollectionContent(collectionId: string, memberName?: string): Promise<DecodedContent | null>
```

Fetch + decode + hash-verify ONE collection's embedded content (cache-first; persists a verified replica).
 Returns null if the collection has no embedded file. Throws on decode failure (caller handles) — kept
 status-free so it can be reused per-reference when resolving a manifest.

Fetch a component by BMF reference. If the collection is a BMC set and `memberName` is given, return that
member; otherwise the collection's single file (the name is then just informational).

At `if (set == null) return content`:

not a set — the reference name is just informational

## fetchCollectionRaw

```ts
async function fetchCollectionRaw(collectionId: string): Promise<DecodedContent | null>
```

At `for (const o of tx1.outputs) {`:

Legacy plaintext provenance mints (MPT-FILE / P-FILE): unencrypted content in an OP_RETURN, authentic
by being the on-chain tx itself. Lets an origin mint be reused/played in a BMF composition.

At `const ciphertextOk = encrypted && template?.fileHash === hexOf(sha256Bytes(file.fileBytes))`:

fileHash binds the ciphertext for encrypted content (privacy) but the ORIGINAL plaintext for public
content (provenance) — so the encrypted check runs on the raw stored blob, the public check on the plaintext.

At `let bytes = file.fileBytes`:

Unwind the stored bytes in reverse of how they were made: decrypt first, then decompress.

At `if (verified) void cachedContentPut(collectionId, { mimeType: file.mimeType, fileName: file.fileN...`:

Persist the decoded content so the next open is instant + offline (only cache a verified replica).

## viewBmf

```ts
async function viewBmf(collectionId: string, name: string, manifest: DecodedContent): Promise<void>
```

Resolve a Block Media Format (BMF) manifest: fetch each on-chain component (audio + scene clips) by its
 txid, then hand the lot to the EXISTING scene-timeline player as an in-memory album — audio track + scene
 clips + a synthesized `video.cue`. Each fetched component self-verifies against its own on-chain commitment
 (fetchCollectionContent), so a resolved video is a composition of independently-provenanced, owned parts.
 A clip referenced at several cues is fetched once and reused (store-once, reference-many).

At `let audioName = bmf.audio?.name ?? ''`:

Audio (referenced by tx → fetch its bytes from chain).

At `const cueLines = []`:

Synthesized cue mapping each scene time → its resolved track name (skip unresolved refs).

At `let epCover = null`:

The manifest mint's own cover → disc fallback (best-effort).

At `try { epCover = (await loadCollection(collectionId)).cover } catch {`:

no cover

### viewBmf › refKey

```ts
const refKey = (s: { tx?: string | null; name?: string }): string =>
```

Scenes — fetch each DISTINCT reference once. Key by tx + member name, so several members of ONE BMC set
(same tx, different name) each resolve, and a member reused across cues is fetched only once.

## onView

```ts
async function onView(collectionId: string, collectionName: string): Promise<void>
```

At `if (isBmf(decoded.mimeType, decoded.bytes)) { await viewBmf(collectionId, collectionName, decoded...`:

A Block Media Format manifest references on-chain components (audio + scene clips) — resolve + play as video.

At `if (isManifest(decoded.mimeType, decoded.bytes)) { await viewReferenceManifest(collectionId, coll...`:

A reference manifest points at other works instead of embedding bytes — resolve + play them as an album.

At `const bmcSet = parseBmcSet(decoded.bytes)`:

A BMC set is a store-only ZIP of independently-referenceable members — show them inline, not just the container.

## viewReferenceManifest

```ts
async function viewReferenceManifest(collectionId: string, epName: string, manifest: DecodedContent): Promise<void>
```

Resolve a reference-manifest collection: fetch each referenced work's content, hash-check it against what
 the manifest committed, and play the lot as one album. A reference that's unavailable or hash-mismatched is
 skipped (shown in the status) rather than failing the whole release. A referenced album is flattened.

At `if (decoded == null || hexOf(sha256Bytes(decoded.bytes)) !== r.hash) { missing++; continue }`:

Integrity: the resolved content must hash to what the EP author committed in the manifest.

At `let epCover = null`:

The EP's own cover (lightweight template+storefront load) → disc fallback for any track lacking embedded art.

At `try { epCover = (await loadCollection(collectionId)).cover } catch {`:

no cover — tracks fall back to no art

## albumUrls

```ts
let albumUrls: string[] = []
```

Object URLs for unpacked album tracks + the live player's teardown — released when the viewer
re-renders or closes (stops the animation loop, audio, and AudioContext; revokes the blob URLs).

## epTeardown

```ts
let epTeardown: (() => void) | null = null
```

## epVizSpeaker

```ts
let epVizSpeaker: boolean = (() => { try { return localStorage.getItem('pharlap2:viz') ...
```

Visualization preference (persists across tracks/sessions): the disc either SPINS (default) or, in "speaker"
mode, stays still and pushes in/out with the bass — a no-rotation option for anyone the spinning makes dizzy.

## revokeAlbumUrls

```ts
function revokeAlbumUrls(): void
```

At `if (epTeardown) { try { epTeardown() } catch {`:

ignore

## SceneTimeline

```ts
interface SceneTimeline { scenes: { t: number; url: string }[] }
```

## PlayerTrack

```ts
interface PlayerTrack { name: string; mimeType: string; url: string; discUrls: string[]; coverUrls: string[]; lyrics: ParsedLyrics | null; timeline: SceneTimeline | null }
```

## renderPlayer

```ts
function renderPlayer(host: HTMLElement, srcTracks: AlbumTrack[], fallbackCover?: { mimeType: string; bytes: number[] } | null): void
```

Render one or more tracks (a packed album, or a single audio file) as the "Ethereal" EP player —
 spinning disc, circular audio visualizer, reactive background orbs, playlist, seek, prev/play/next,
 volume. Plays the in-memory tracks; non-audio files are offered as downloads below. A packed .cue/.lrc
 file ([mm:ss.xx]scene.webp lines) drives a scene-timeline "music video" synced to playback. Ported
 (scoped ep-) from the MusicPlayer-test player.

At `let fallbackArtUrl = null`:

A release-level cover (e.g. an EP's own art) shown on the disc for any track that carries no embedded art.

At `const cueFiles = srcTracks.filter(t => /\.(cue|lrc)$/i.test(t.name))`:

Scene-timeline "videos": a packed .cue/.lrc file whose lines are [mm:ss.xx]scene-file.webp maps song time to
a scene image (each typically an animated WebP at its own fps). The player swaps the visible scene by playback
time → a seekable, audio-synced music video. Reuses the LRC engine (parseLyrics): the "text" is the filename.

At `const cueSceneNames = new Set()`:

packed files used as scenes (kept out of the downloads list)

At `const isFlac = t.mimeType.includes('flac') || /\.flac$/i.test(t.name)`:

Embedded cover art (FLAC PICTURE blocks / MP3 ID3 APIC frames — e.g. front + back cover added in Kid3)
→ object URLs for a slideshow on the disc.

At `const pics = isFlac ? parseFlacPictures(t.bytes) : isMp3 ? parseId3Pictures(t.bytes) : []`:

Embedded pictures by type (APIC/PICTURE picture-type byte): 3 = Front, 4 = Back, 6 = Media (the CD's
label side). The spinning DISC shows the "Media" art when present (a moving record label), else the front;
the 🖼️ cover view shows the Front+Back sleeve. So you can embed a static front cover AND an animated Media
image without the disc cross-fading between them.

At `let coverUrls = allArt`:

🖼️ cover view = a full-size slideshow of ALL the art (the animated Media plays large here too — a pseudo
music video), cross-fading through front/back/media. Falls back to the release cover below if empty.

At `if (discUrls.length === 0 && fallbackArtUrl != null) discUrls = [fallbackArtUrl]`:

No embedded art on this track → fall back to the release cover (e.g. the EP's own art), if any.

At `const lyrics = parseLyrics(isFlac ? parseFlacLyrics(t.bytes) : isMp3 ? parseId3Lyrics(t.bytes) : ...`:

Embedded lyrics (USLT for MP3, LYRICS/UNSYNCEDLYRICS for FLAC — added in Kid3). Plain text or LRC (timed).

At `const probe = document.createElement('audio')`:

Route only browser-PLAYABLE audio into the player; formats it can't decode (WMA/APE/DSD…) and non-audio
files become downloads instead of a silent dead player. canPlayType is the source of truth; when the MIME
is missing we trust a known-good extension and let the runtime error handler catch any remaining miss.

At `for (const at of audioTracks) {`:

Attach a scene timeline to each audio track — matched by basename (01.cue ↔ 01.flac), else the sole cue sheet.

At `let speakerScale = 1`:

visualization: disc pulse amount in "speaker" mode (set per-frame); 1 = at rest

At `const art = q('.ep-art')`:

Embedded cover art on the disc — slideshow (cross-fade) if a track carries more than one picture.
The 🖼️/💿 toggle (shown only when art exists) flips between the player view and a full, uncropped cover view.

At `try { localStorage.setItem('pharlap2:viz', epVizSpeaker ? 'speaker' : 'disc') } catch {`:

private mode — session only

At `const lyricsToggle = q('.ep-lyrics-toggle')`:

Lyrics overlay — a scrim-backed text layer over the disc/cover (shows through to the art behind). The 📝
toggle appears only when the current track carries lyrics. Synced (LRC) lyrics highlight + auto-scroll the
active line in time with playback; plain lyrics just scroll. Independent of the cover/disc view.

At `const videoToggle = q('.ep-video-toggle')`:

Scene-timeline "music video" — the 🎬 toggle (shown only when the current track has a cue sheet) enters video
view: the scene image fills the disc area and swaps by playback time, so it stays synced through seeks/pauses
(lyrics can overlay on top). Same active-index drive as the lyrics.

At `scene.onload = () => {`:

Size the video view to the clip's real aspect ratio (square, 16:9, whatever) so it uses the largest
available space instead of being centre-cropped into a fixed 1:1 box.

At `if (on) { lastScene = -1; syncScene() }`:

paint the current scene immediately (works while paused too)

At `let dlBox = null`:

Lazy "Downloads" list under the player — for non-audio files and any track the browser can't play.

At `if (tornDown || !audio.src) return`:

ignore the error fired when src is cleared on teardown

At `showArt(audioTracks[0].discUrls, audioTracks[0].coverUrls)`:

show the first track's cover up front, before playback

At `loadLyrics(audioTracks[0].lyrics)`:

surface the 📝 toggle before playback if the first track has lyrics

At `loadTimeline(audioTracks[0].timeline)`:

surface the 🎬 toggle if the first track has a scene timeline

At `for (const t of otherTracks) addDownload(t, isAudioFile(t) ? 'can’t play in this browser' : undef...`:

Non-audio files (artwork, liner notes…) and any unplayable audio → downloads under the player.

At `try { audio.pause() } catch {`:

ignore

At `try { void audioCtx?.close() } catch {`:

ignore

### renderPlayer › sceneUrlFor

```ts
const sceneUrlFor = (name: string): string =>
```

At `const sceneUrlFor = (name) => {`:

name is an actual srcTracks name (resolveCue matched it)

### renderPlayer › isCueOrScene

```ts
const isCueOrScene = (t: PlayerTrack): boolean =>
```

Downloads exclude the cue sheet(s) + any WebP scenes they reference — those are the video, not loose files.

### renderPlayer › runArtSlideshow

```ts
function runArtSlideshow(urls: string[]): void
```

the current track's two art sets (disc = Media, cover = Front+Back)

### renderPlayer › showArt

```ts
function showArt(disc: string[], cover: string[]): void
```

Load the current track's two art sets and show the one for the active view (💿 disc = Media, 🖼️ = Front+Back).

### renderPlayer › applyViz

```ts
const applyViz = (): void =>
```

Visualization mode: spinning disc (default) vs "speaker" (no spin; the disc pushes in/out with the bass).
Defined here — after `player`/`vizToggle`/`discContainer` exist — and called once to apply the saved pref.

At `if (!epVizSpeaker) { discContainer.style.transform = ''; speakerScale = 1 }`:

back to disc mode → drop the pulse transform

### renderPlayer › initAudioContext

```ts
function initAudioContext(): void
```

At `} catch {`:

the visualizer is best-effort; audio still plays without it

### renderPlayer › frame

```ts
function frame(): void
```

Reactive orbs + circular bars — one rAF loop, both best-effort (no analyser ⇒ static).

At `if (player.classList.contains('viz-speaker') && !player.classList.contains('art-view') && !player...`:

Speaker mode: the disc pushes in/out with the bass (eased so it pumps rather than jitters; rests at scale 1).
Only in the normal disc view — not the full cover or video views (which resize the container themselves).

## showFile

```ts
function showFile(title: string, file: { mimeType: string; fileName: string; fileBytes: number[] }, verified: boolean, note?: string): void
```

At `const albumTracks = isAlbum(file.mimeType, file.fileBytes) ? parseAlbum(file.fileBytes) : null`:

An album unpacks to many tracks; a lone audio file plays as a one-track release — both get the player.

## viewBmc

```ts
function viewBmc(title: string, content: DecodedContent, set: BmcSet): void
```

A BMC set is a store-only ZIP of N independently-referenceable members. Rather than hand over the opaque
 .bmc as a download, render each member inline (image/audio/video/text → the right element, else a per-member
 download link) with its name, plus a whole-set download for reuse/import elsewhere.

At `albumUrls.push(url)`:

revoked by revokeAlbumUrls() on close / next view

At `const setUrl = URL.createObjectURL(new Blob([new Uint8Array(content.bytes)], { type: 'application...`:

The whole opaque .bmc container, for reuse/import into another composition.

## showAlbumTracks

```ts
function showAlbumTracks(title: string, tracks: AlbumTrack[], verified: boolean, note: string, subtitle: string, fallbackCover?: { mimeType: string; bytes: number[] } | null): void
```

Open the viewer on a set of already-resolved tracks (used by reference-manifest playback — the tracks
 come from other collections, so there's no single file blob). Mirrors showFile's album branch.

## closeViewer

```ts
function closeViewer(): void
```

## Cat

```ts
type Cat = 'image' | 'audio' | 'video' | 'document' | 'text' | 'archive' | 'other'
```

─── token list ─────────────────────────────────────────────────────
MIME → display category. Ordered; each held collection lands in exactly one collapsible section.

## CATS

```ts
const CATS: { key: Cat; label: string; icon: string }[] = [
```

## mimeCategory

```ts
function mimeCategory(mime: string | null): Cat
```

At `if (m === ALBUM_MIME) return 'audio'`:

a packed album is a music release

## renderTokens

```ts
function renderTokens(skipWarm = false): void
```

At `const active = [...store.active()].sort((a, b) => {`:

Newest first by acquisition height (unconfirmed/unknown = newest), so the order is meaningful even
after a bulk from-chain recovery (where insertion order is scan order, not chronological). Tiebreak
by addedAt so freshly minted/received tokens stay on top.

At `const groups = new Map()`:

Group identical holdings (same collection = interchangeable copies/editions), preserving sort order
by first appearance. A single copy renders as a normal card; multiples collapse into one group card.

At `const buckets = new Map()`:

Bucket each collection by content type. A collection whose MIME isn't cached yet sits in a temporary
"identifying…" section until the metadata fetch warms the cache (then we re-render once). On the warm
re-render (skipWarm) any still-unresolved collection has failed to fetch — show it under Other.

At `if (single) host.append(sectionBody(items, myHash))`:

With only one type present, skip the section chrome — a lone header adds nothing.

At `if (!isWatchOnly()) resolvePublisherIdentitiesThen(active, () => renderTokens(true))`:

Watch-only skips publisher-identity/avatar resolution: that path scans each publisher's full address
history (a busy publisher → many large content-mint txs) and drives a resolve→re-render cycle that can
hang the page. A monitoring view doesn't need publisher names/avatars — cards show identicons.

## renderTokensByPublisher

```ts
function renderTokensByPublisher(host: HTMLElement, active: StoredToken[], groups: Map<string, StoredToken[]>, myHash: string): void
```

"Sort by publisher" view: collections grouped under their publisher (avatar + @alias) instead of by type.

At `const buckets = new Map()`:

Bucket collections by publisher: a resolved pubkey, else 'you' / 'pending' / 'none'.

At `if (!isWatchOnly()) resolvePublisherIdentitiesThen(active, () => renderTokens(true))`:

Watch-only skips publisher-identity/avatar resolution: that path scans each publisher's full address
history (a busy publisher → many large content-mint txs) and drives a resolve→re-render cycle that can
hang the page. A monitoring view doesn't need publisher names/avatars — cards show identicons.

### renderTokensByPublisher › isPub

```ts
const isPub = (k: string) =>
```

Order: your own first, then resolved publishers (by display name), then still-resolving, then publisher-less.

## card

```ts
function card(collectionId: string, copies: StoredToken[], myHash: string): HTMLElement
```

## sectionBody

```ts
function sectionBody(items: Array<[string, StoredToken[]]>, myHash: string): HTMLElement
```

A section's contents, rendered per the current view: a vertical list of cards, or a wall of tiles.

## sectionEl

```ts
function sectionEl(label: string, items: Array<[string, StoredToken[]]>, myHash: string): HTMLElement
```

A collapsible type section: a clickable header (icon + label + count) over its cards/tiles.

At `if ((e.target).closest('.copy-id, button') != null) return`:

let chip copy / buttons win

## tileEl

```ts
function tileEl(collectionId: string, copies: StoredToken[], myHash: string): HTMLElement
```

A grid tile for a collection group: thumbnail + name + ×N count; click opens the detail modal.

## openTokenDetail

```ts
function openTokenDetail(collectionId: string, copies: StoredToken[], myHash: string): void
```

Open the detail modal for a collection group (the full card + actions; groups start expanded).

## closeTokenModal

```ts
function closeTokenModal(): void
```

## setNftView

```ts
function setNftView(v: 'list' | 'grid'): void
```

At `try { localStorage.setItem('p2:nftview', v) } catch {`:

fine

## setNftSort

```ts
function setNftSort(s: 'recent' | 'publisher'): void
```

At `try { localStorage.setItem('p2:nftsort', s) } catch {`:

fine

## updateSortToggle

```ts
function updateSortToggle(): void
```

## updateViewToggle

```ts
function updateViewToggle(): void
```

## warmAndRerender

```ts
async function warmAndRerender(collectionIds: string[]): Promise<void>
```

Warm the MIME/thumbnail cache for all held collections, then re-render once so they settle into sections.

## tokenThumbEl

```ts
function tokenThumbEl(collectionId: string): HTMLElement
```

A card thumbnail element (placeholder, then filled async from the collection's public cover/image).

## tokenExtrasHtml

```ts
function tokenExtrasHtml(t: StoredToken): string
```

Per-copy extra lines (state, seller note, bonus, latest broadcast) as HTML.

## onPublishPreview

```ts
async function onPublishPreview(t: StoredToken): Promise<void>
```

Publisher-only: publish a PUBLIC "listen before you buy" preview clip for a collection. The publisher uploads
 a finished mp3 (trimmed in their DAW); it's posted on-chain under their key so the sales page + nft.sale can
 play it to prospective buyers. Latest published wins. PHAR LAP does not trim/transcode — upload only.

## tokenActions

```ts
function tokenActions(t: StoredToken, myHash: string): HTMLElement
```

The per-copy action buttons (Replicate/Transfer/OPEN/Sales/Verify for editions; Send/Verify/OPEN else).

At `const ro = isWatchOnly()`:

watch-only: read/explore only, no signing buttons

At `if (!ro && t.lockHex != null && editionSupportsBurn(hexBytes(t.lockHex))) {`:

🔥 Burn — only for burn-capable (bonded) editions; reclaims the bond and destroys the token.

At `if (!ro) {`:

🎁 Gift / links / reclaim — any holder can gift (resellers too); vouchers derive from their own key.

At `if (iAmPublisher) {`:

📣 Broadcast + 👥 Buyers stay publisher-only (collection-wide actions).

## singleCard

```ts
function singleCard(t: StoredToken, myHash: string): HTMLElement
```

A normal single-copy card.

## groupCard

```ts
function groupCard(collectionId: string, copies: StoredToken[], myHash: string, startOpen = false): HTMLElement
```

A collapsible group of identical (same-collection) copies: header + a ×N count, expanding to per-copy rows.

At `if ((e.target).closest('.copy-id') != null) return`:

let click-to-copy win, don't toggle

## metaInFlight

```ts
const metaInFlight = new Map<string, Promise<void>>()
```

Per-collection card metadata (thumbnail + content MIME type) is derived from ONE TX1 fetch, deduped per
collection and cached locally (see thumbs.ts) — never stored on-chain. The fetch runs async so the card
list renders instantly; thumbnails fill in and the type sections settle once the cache warms.

## fillCardThumb

```ts
async function fillCardThumb(thumbEl: HTMLElement, collectionId: string): Promise<void>
```

At `if (url == null) return`:

keep the placeholder

## ensureCollectionMeta

```ts
async function ensureCollectionMeta(collectionId: string): Promise<void>
```

Resolve (and cache) a collection's thumbnail + MIME type from its TX1, deduped per collection.

## fetchCollectionMeta

```ts
async function fetchCollectionMeta(collectionId: string): Promise<void>
```

At `cacheMime(collectionId, file?.mimeType ?? null)`:

MIME for the type sections = the embedded content file's type (null = no file). Plaintext even when
the bytes are encrypted, so encrypted collections still categorize.

At `if (coverBytes?.length) { if (await makeThumb(collectionId, coverBytes, coverMime) != null) return }`:

Thumbnail: prefer the public storefront cover; else a public, image-typed embedded file (decompress if needed).

At `if (rules?.isCompressed) { try { bytes = await decompress(bytes) } catch {`:

use raw

At `}`:

transient fetch/parse error — leave unresolved so the next render retries

## safeUtf8

```ts
function safeUtf8(hex: string): string
```

## onCopyClick

```ts
function onCopyClick(e: MouseEvent): void
```

Truncated ids (collection / tx / utxo) are shown abbreviated to save space but carry the FULL value in
data-copy, so a click copies the whole string (e.g. to paste into WhatsOnChain). One delegated listener
handles every [data-copy] element in the app.

## toastTimer

```ts
let toastTimer: ReturnType<typeof setTimeout> | undefined
```

## toast

```ts
function toast(message: string): void
```

## escapeHtml

```ts
function escapeHtml(s: string): string
```

## contacts

```ts
let contacts: Record<string, string> = {} // pubkeyHex(lc) → your saved/verified alias ...
```

─── aliases (self-asserted display names) ──────────────────────────
A key names ITSELF (carried in the message/post envelope, bound to the sender pubkey). Aliases are NOT
unique — the pubkey is the real identity (shown on hover). Your saved contacts (verified) override a
key's self-claim; an unseen self-claim shows as "unverified" until you save it. All local, nothing extra
on-chain beyond the envelope part.

## contactsAt

```ts
let contactsAt: Record<string, number> = {} // pubkeyHex(lc) → updatedAt ms (for newest...
```

pubkeyHex(lc) → your saved/verified alias (wins)

## seenAliases

```ts
let seenAliases: Record<string, string> = {} // pubkeyHex(lc) → observed self-asserted ...
```

pubkeyHex(lc) → updatedAt ms (for newest-wins backup merge)

## pinned

```ts
let pinned: Record<string, 1> = {} // pubkeyHex(lc) → 1 if you set a CUSTOM label (don'...
```

pubkeyHex(lc) → observed self-asserted alias (unverified)

## persist

```ts
function persist(k: string, v: object): void
```

pubkeyHex(lc) → 1 if you set a CUSTOM label (don't auto-follow renames)

At `function persist(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {`:

quota

## loadAliases

```ts
function loadAliases(): void
```

## getMyAlias

```ts
function getMyAlias(): string
```

## setMyAlias

```ts
function setMyAlias(a: string): void
```

At `try { localStorage.setItem('p2:myalias', a); localStorage.setItem('p2:myaliasAt', String(nowMs())...`:

fine

## nowMs

```ts
const nowMs = (): number =>
```

─── config backup bookkeeping ──────────────────────────────────────

## touchContact

```ts
function touchContact(k: string): void
```

updatedAt for a contact (set on save/rename/remove) — drives newest-wins restore merge + the dirty nudge.

## markConfigDirty

```ts
function markConfigDirty(): void
```

Mark local config changed since the last backup; refresh the nudge if the Contacts modal is open.

At `try { localStorage.setItem('p2:cfgDirty', String((parseInt(localStorage.getItem('p2:cfgDirty') ??...`:

fine

## rememberAlias

```ts
function rememberAlias(pubKeyHex: string, alias: string): void
```

Record a self-asserted alias from a key. A saved contact you ACCEPTED (not pinned) follows the key's
 renames — it's provably the same key; a contact you gave a CUSTOM label (pinned) stays put. Unsaved keys
 just track their latest self-claim (shown as unverified).

At `if (!pinned[k] && contacts[k] !== alias) { contacts[k] = alias; persist('p2:contacts', contacts);...`:

follow rename

## applyLatestAliases

```ts
function applyLatestAliases(items: Array<{ pk: string; alias?: string }>): void
```

Apply only each key's LATEST self-claim from a NEWEST-FIRST list (first occurrence per key wins), so an
 older message can't revert a more recent rename.

## saveContact

```ts
function saveContact(pubKeyHex: string, alias: string, customLabel = false): void
```

Save a contact. `customLabel` = you typed your own name (pin it; don't auto-follow the key's renames);
 otherwise you accepted the key's self-claim (follow future renames).

## removeContact

```ts
function removeContact(pubKeyHex: string): void
```

At `touchContact(k)`:

bump timestamp so a later backup reflects the change (deletes don't sync — no tombstones)

## ignoreSeen

```ts
function ignoreSeen(pubKeyHex: string): void
```

At `try { localStorage.setItem('p2:aliases', JSON.stringify(seenAliases)) } catch {`:

fine

## refreshNameSurfaces

```ts
function refreshNameSurfaces(): void
```

Re-render every surface that shows names, after a contact change.

## NameInfo

```ts
interface NameInfo { name: string; verified: boolean; isMe: boolean; alias?: string }
```

## displayName

```ts
function displayName(pubKeyHex: string): NameInfo
```

## myPubKeyLc

```ts
function myPubKeyLc(): string
```

## keyHue

```ts
function keyHue(pubKeyHex: string): number
```

A key's signature hue (0–359), derived from its pubkey — used by the identicon AND a custom avatar's
 ring, so the colour is an un-fakeable per-key anchor either way.

## identiconSvg

```ts
function identiconSvg(pubKeyHex: string, px = 18): string
```

A deterministic, key-derived avatar (symmetric 5×5 SVG). Free, universal, and UN-spoofable: a faked
 @alias on a different key renders a different pattern, so the icon is a visual identity anchor.

At `` if (x < 2) cells += `<rect x="${N - 1 - x}" y="${y}" width="1" height="1"/>` ``:

mirror for symmetry

## avatars

```ts
let avatars: Record<string, string> = {} // pubkeyHex(lc) → avatar data-URL, or NO_AVATAR
```

p:avatars sentinel: resolved, this key has no published avatar

## cachedAvatar

```ts
function cachedAvatar(pubKeyHex: string): string | null
```

pubkeyHex(lc) → avatar data-URL, or NO_AVATAR

## setAvatar

```ts
function setAvatar(pubKeyHex: string, value: string): void
```

At `try { localStorage.setItem('p2:avatars', JSON.stringify(avatars)) } catch {`:

quota

## avatarHtml

```ts
function avatarHtml(pubKeyHex: string, px = 18): string
```

Avatar (published image) if known, else the identicon — both wear the key-derived ring/colour.

## nameChip

```ts
function nameChip(pubKeyHex: string, opts: { save?: boolean } = {}): string
```

HTML for a key reference anywhere it appears: avatar/identicon + @name (copy-to-clipboard the full pubkey,
 hover to see it) + an "⚠ unverified" cue for a self-claimed name, and (when `save`) a one-click save.

## bytesToDataUrl

```ts
function bytesToDataUrl(mime: string, bytes: number[]): string
```

## avatarInFlight

```ts
const avatarInFlight = new Map<string, Promise<boolean>>()
```

Published profiles (avatar + alias) are resolved by pubkey from the key's own address. The persistent
p:avatars cache gives instant display; we re-resolve each key once PER SESSION so updated profiles (new
avatar or @name) are picked up rather than cached forever.

## profileChecked

```ts
const profileChecked = new Set<string>() // keys whose profile we've re-resolved this s...
```

## ensureAvatar

```ts
async function ensureAvatar(pubKeyHex: string): Promise<boolean>
```

keys whose profile we've re-resolved this session

## fetchProfileInto

```ts
async function fetchProfileInto(k: string): Promise<boolean>
```

At `let aliasChanged = false`:

The published profile supplies a NAME only as a fallback when we have none (e.g. a storefront publisher
you've never messaged). It must NOT override a saved contact or an envelope-provided name — the message
envelope is the fresher, authoritative source for renames (a published profile can lag behind it).

At `} catch { return false }`:

transient: leave unresolved for a later retry

## resolveAvatarsThen

```ts
function resolveAvatarsThen(pubKeys: string[], rerender: () => void): void
```

Resolve profiles (avatar + alias) for these keys in the background; re-render if any newly resolved.

## publisherKeyInFlight

```ts
const publisherKeyInFlight = new Map<string, Promise<string | null>>()
```

── Publisher identity ────────────────────────────────────────────────
The covenant carries only the publisher's hash160; their full pubkey (needed to show an avatar/alias and to
message them) is recovered once per collection from TX1's funding input (`<sig> <pubkey>`, hash-verified),
then cached on every held copy of that collection.

## myPubKeyHash

```ts
function myPubKeyHash(): string
```

## recoverPublisherKey

```ts
async function recoverPublisherKey(collectionId: string, publisherHashHex: string): Promise<string | null>
```

At `} catch {`:

transient (e.g. TX1 not fetchable yet) — leave unresolved for a later pass

## resolvePublisherKey

```ts
function resolvePublisherKey(t: StoredToken): Promise<string | null>
```

## resolvePublisherIdentitiesThen

```ts
function resolvePublisherIdentitiesThen(tokens: StoredToken[], rerender: () => void): void
```

Recover unresolved publisher pubkeys (then warm their profiles) in the background; re-render on success.

At `const known = tokens.map(t => t.publisherPubKeyHex).filter((v) => v != null)`:

Warm avatars/aliases for already-resolved publishers regardless.

At `let wrote = false`:

⚠⚠ WRITE THE KEY ONTO THE STORE BEFORE RE-RENDERING, EVERY TIME. The in-flight map hands back a key it
resolved earlier, and a copy stored since then (a replica just minted) carries no key yet. Re-rendering
without writing it finds that copy unresolved again, resolves it from the map in a microtask, and
re-renders again, without ever yielding to the event loop: 100 % CPU, no timers, memory climbing until
the browser is killed. Measured 12 Sept 2026 on a live replicate. So: write, and re-render only if a
write happened.

At `resolveAvatarsThen(got, rerender)`:

pull their profiles too

At `rerender()`:

show the chip now (identicon until the avatar lands)

## ComposeCtx

```ts
interface ComposeCtx { product?: string; recipientRole: 'buyer' | 'publisher' }
```

## fillWildcards

```ts
function fillWildcards(text: string, recipientKey: string, ctx: ComposeCtx): string
```

Substitute message wildcards for one recipient. %buyer% / %publisher% map to the recipient or to you (the
 sender) depending on which role the recipient plays; %product% → the collection name.

## openCompose

```ts
function openCompose(recipients: string[], opts: { who: string } & ComposeCtx): void
```

Compose overlay over the current page (so you return to the same card/scroll on close). One recipient, or
 many (a personalized mail-merge: %buyer% per recipient, %product% = the collection — one encrypted tx each).
 Reuses the same encrypted-send path as the Messages tab.

### openCompose › updatePreview

```ts
const updatePreview = (): void =>
```

Live preview of the merge for the first recipient (only when a wildcard is actually used).

## composeTo

```ts
function composeTo(pubKeyHex: string, who: string, ctx: ComposeCtx): void
```

Message one key (NFT-card publisher chip / single buyer row).

## onMessagePublisher

```ts
function onMessagePublisher(pubKeyHex: string, product?: string): void
```

"Message publisher" from an NFT card.

## publisherRowEl

```ts
function publisherRowEl(t: StoredToken, myHash: string): HTMLElement | null
```

A small "by @publisher [avatar] ✉ Message" row for an edition card; null for non-editions.

At `if (t.publisherPubKeyHashHex == null) return null`:

not an edition / no publisher recorded

At `if (pk == null) { row.innerHTML = '<span class="muted">by publisher…</span>'; return row }`:

resolving

## onAliasSaveClick

```ts
function onAliasSaveClick(e: MouseEvent): void
```

At `renderInbox(lastInbox)`:

reflect the now-verified name in the inbox

At `if (lastUpdatesFeed != null) renderUpdatesFeed(lastUpdatesFeed)`:

…and in the updates feed

## updateMsgToName

```ts
function updateMsgToName(): void
```

Live hint under the compose "to" field: show @name when the entered key has a known alias.

## cfgDirtyCount

```ts
function cfgDirtyCount(): number
```

─── config backup / restore ────────────────────────────────────────

## lastBackupAt

```ts
function lastBackupAt(): number
```

## updateCfgBackupNote

```ts
function updateCfgBackupNote(): void
```

Refresh the "N changes since last backup" nudge in the Contacts modal (no-op if it isn't mounted).

## onConfigBackup

```ts
async function onConfigBackup(): Promise<void>
```

At `try { for (const k of ['p2:nftview', 'p2:nftsort', 'p2:refBy', 'p2:affRefCode']) { const v = loca...`:

p:refBy (who gifted this wallet) + p:affRefCode (your own ref-code) ride along so referral attribution
survives a wallet restore on a new device (option-1 cross-device carry).

At `try { localStorage.setItem('p2:cfgBackupAt', String(nowMs())); localStorage.setItem('p2:cfgDirty'...`:

fine

## restoreConfigFromChain

```ts
async function restoreConfigFromChain(quiet = false): Promise<number>
```

Restore the latest backup and merge it in (newest-wins). Returns how many entries the backup contributed.

At `try { localStorage.setItem('p2:myalias', merged.alias); if (merged.aliasAt != null) localStorage....`:

fine

At `if (blob.prefs != null) { try { for (const [k, v] of Object.entries(blob.prefs)) localStorage.set...`:

Restore UI prefs (only sets that aren't already chosen locally is overkill — backup is authoritative for prefs).

At `if (blob.prefs != null) { try { for (const [k, v] of Object.entries(blob.prefs)) localStorage.set...`:

fine

## onConfigRestore

```ts
async function onConfigRestore(): Promise<void>
```

## openContactsModal

```ts
function openContactsModal(): void
```

─── address book ───────────────────────────────────────────────────

## closeContactsModal

```ts
function closeContactsModal(): void
```

## renderContacts

```ts
function renderContacts(): void
```

## contactsSection

```ts
function contactsSection(title: string, rows: [string, string][], kind: 'saved' | 'seen', empty: string): HTMLElement
```

## contactRow

```ts
function contactRow(pk: string, alias: string, kind: 'saved' | 'seen'): HTMLElement
```

## onAddContact

```ts
function onAddContact(): void
```

## CollectionInfo

```ts
interface CollectionInfo {
  tx1Ref: string
  name: string
  description: string
  cover: { mimeType: string; bytes: number[] } | null
  /** Optional flippable back cover (sales page). */
  backCover: { mimeType: string; bytes: number[] } | null
  encrypted: boolean
  replicable: boolean
  hasContentFile: boolean
  /** MIME of the embedded content, when small enough to parse under the sales-page fetch cap. null if there's no
   *  content OR it was too big to fetch (oversized — assumed to be large media, e.g. a song). */
  contentMime: string | null
  /** Content category hint (image/audio/video/…) — only set on the BigRed-cache fast path (a light load skips the
   *  FILE output, so contentMime is null there). Used by the 🎧 preview gate. Undefined on a full chain load. */
  contentCategory?: Cat
  /** SHA-256 (hex) of the embedded content, committed in the TX1 template — used to reference this collection
   *  from a combination/EP manifest (and to integrity-check the resolved content). null if no content file. */
  fileHash: string | null
  /** Immutable licence code committed at mint (e.g. "TS-COM-1"), or null. Travels with the coin. */
  license: string | null
  /** Optional txid → full licence text minted on-chain, or null. */
  licenseRef: string | null
  publisherPubKeyHex: string | null
  fees: { publisher: number; holder: number } | null
  /** The collection's covenant template bytes (hex) — lets the buy flow reconstruct a holder's edition. */
  covenantHex: string
  /** Refundable bond a buyer funds into their own copy (sats) = the genesis edition output value. 0 if none. */
  bondSats: number
}
```

─── init ───────────────────────────────────────────────────────────
─── collection / sales view (shareable link landing) ───────────────
A link of the form  …/#c=<TX1-txid>[&h=<holderPubKey>]  opens a public storefront page for a
collection (PLAN.md Step 2). `c` is the Collection ID (TX1 txid); `h` (optional) names the holder
whose edition a buyer will replicate from — the tip-resolution + buy flow land in the next steps.

## cvObjectUrl

```ts
let cvObjectUrl: string | null = null
```

## cvBackObjectUrl

```ts
let cvBackObjectUrl: string | null = null // back-cover object URL for the sales-page flip
```

## cvPreviewObjectUrl

```ts
let cvPreviewObjectUrl: string | null = null // audio-preview object URL for the sales ...
```

back-cover object URL for the sales-page flip

## currentCollection

```ts
let currentCollection: { info: CollectionInfo; holderPubKey: string | null } | null = null
```

audio-preview object URL for the sales page

## cvNote

```ts
let cvNote: SellerNote | null = null
```

The seller's current note (promo + optional bonus) for the open collection, captured onto a purchase.

## cvNoteRefreshId

```ts
let cvNoteRefreshId: string | null = null // collection to re-fetch on nft.sale after a...
```

## NFTSALE_ORIGIN

```ts
const NFTSALE_ORIGIN = 'https://nft.sale' // hard-coded for now — revisit for multiple ...
```

collection to re-fetch on nft.sale after a note publish (the ↻ button)

## cvGiftWif

```ts
let cvGiftWif: string | null = null
```

hard-coded for now — revisit for multiple marketplace sites

Funded voucher WIF from a `&g=` gift link — when set, "Get a copy" claims free (the voucher pays).

## setCvStatus

```ts
function setCvStatus(msg: string, kind: 'info' | 'error' | 'ok' = 'info'): void
```

## cvGetButtons

```ts
function cvGetButtons(): HTMLButtonElement[]
```

The buy/claim CTA appears twice — a hero copy up top (above the fold) and the one in the buy card —
so it's reachable without scrolling. These keep both in lockstep (same label + disabled state).

## setCvGetLabel

```ts
function setCvGetLabel(text: string): void
```

## setCvGetDisabled

```ts
function setCvGetDisabled(disabled: boolean): void
```

## reflectCvOwnership

```ts
function reflectCvOwnership(info: CollectionInfo): void
```

Reflect ownership on the storefront's buy buttons: once this wallet holds a copy, GHOST them to
 "✓ You own a copy" (disabled) so a stray second click can't accidentally buy again — and reveal a
 low-key "Buy another copy" link for the rare deliberate re-purchase (editions are uncapped). Otherwise
 the normal "Get a copy" button. Skipped entirely during a gift claim (its label/flow is special).

## parseHashRoute

```ts
function parseHashRoute(): { c: string; h: string | null; g: string | null; src: string | null } | null
```

Read a `#c=…&h=…` hash route, or null if absent. Also captures a referral `aff` ref-code for this session.
 `src` = the originating BigRed site's hostname (added by its "Get a copy" link) — used as a display cache to
 paint the cover/title/description instantly instead of waiting on the slow chain load.

At `if (aff != null && aff !== '') incomingAff = aff`:

a share link's referral overrides the default Buy-BSV code

## loadCollection

```ts
async function loadCollection(tx1Ref: string, holderPubKeyHint?: string | null, opts: { light?: boolean } = {}): Promise<CollectionInfo>
```

Fetch TX1 and extract everything the storefront page needs (template + storefront + fees).

At `let template`:

Read ONLY the small metadata outputs (template + storefront), skipping any large embedded content file,
so the sales page renders without pulling the whole (possibly tens-of-MB) TX1. Layout is deterministic:
[0]=template, [1]=file (may be huge), [2]=storefront, [last]=change. We scan outputs with a size cap; an
output too big to fetch IS the content file (→ hasContentFile), skipped without downloading its body.

At `let contentMime = null`:

captured when the content file is small enough to parse (under the cap)

At `for (let i = 0; i < (opts.light ? 1 : 6); i++) {`:

template is [0]; storefront comes after the (possibly huge) file, so once we have both we can stop — that
also avoids WoC's 502-on-out-of-range past the last output. Any fetch error on an index is treated as a
skip (not a hard failure) so a transient/late hiccup can't break a load that already has what it needs.
Light mode (BigRed-cache fast path): fetch ONLY the template output [0] for the covenant — skip the big
storefront/cover + file outputs, since cover/title/description come from the cache. Falls back to a full
load (caller re-invokes without `light`) if the template isn't at [0].

At `try { hex = await provider.getOutputScriptHexCapped(tx1Ref, i, 8 * 1024 * 1024) }`:

headroom for a rich animated front+back storefront cover

At `if (hex === 'oversized') { hasContentFile = true; continue }`:

the embedded content file — skipped, not downloaded

At `if (ff) { hasContentFile = true; contentMime = ff.fields.mimeType }`:

a SMALL embedded file (fetched under the cap)

At `if (template != null && storefront != null) break`:

have everything the sales page needs

At `if (opts.light) hasContentFile = template.fileHash != null`:

light skips the FILE output; infer from the committed hash

At `} catch {`:

leave null — non-replicable or unparseable covenant

At `let bondSats = 0`:

Refundable bond: read it from the live edition tip (a small script-hash fetch), NOT the big TX1 — the
template output's value isn't recoverable without the full tx. Resolved only when a holder context is
supplied (the sales page); callers needing just name/publisher (the updates feed) omit it and skip this hop.

At `} catch {`:

best-effort — leave the bond unknown

At `const backCover = storefront?.backCoverBytes && (storefront.backCoverMimeType ?? '').toLowerCase(...`:

Back cover only counts if it's genuinely an IMAGE — a non-image (e.g. a zip mis-parked in the back-cover
slot at mint) otherwise shows an empty flip on the sales page.

## renderCollectionView

```ts
function renderCollectionView(info: CollectionInfo, opts?: { coverUrl?: string }): void
```

At `if (info.backCover) {`:

Optional flippable back cover: a small "⇄" button over the cover toggles front ⇄ back.

At `const img = document.createElement('img'); img.className = 'cv-cover-img'; img.src = opts.coverUrl`:

BigRed-cache fast path: no cover bytes loaded (light load) — render the cached cover by URL. If it 404s
(collection not curated on that site), drop to the placeholder.

At `const prevHost = $('cvPreview')`:

Public audio preview — a lazy "🎧 Preview": resolve + play only when a prospective buyer asks, so the sales
page never fetches the (large) clip unless someone wants to listen. Plaintext/public — no holder gate.

At `const contentIsAudio = info.contentMime != null ? mimeCategory(info.contentMime) === 'audio'`:

Preview is an audio-sample feature — only offer it for audio releases (an audio file or a packed album), so
BMF/BMC/image/agent collections don't show a dead "🎧 Preview". Oversized content (mime skipped at load) is
assumed to be large media, e.g. a >8MB song, and keeps the button.

At `: info.contentCategory != null ? info.contentCategory === 'audio'`:

BigRed-cache light path (no mime fetched)

At `audio.setAttribute('controlsList', 'nodownload')`:

hide the native download — a blob url saves an unnamed file

At `const ext = /mp4|m4a|aac/i.test(clip.mimeType || '') ? 'm4a' : 'mp3'`:

Our own download link so the clip saves as the collection title ("Artist - Track.mp3"). Blob urls are
same-origin, so the download attribute's filename is honoured.

At `` const bondBit = bond > 1 ? ` + ${fmtPrice(bond)} refundable bond` : '' ``:

Show the real buyer total: the seller's price/fees PLUS the refundable bond locked into the buyer's own copy.

At `reflectCvOwnership(info)`:

Buy buttons reflect ownership: ghosted to "✓ You own a copy" if this wallet already holds one (prevents an
accidental re-buy on revisit), else the normal "Get a copy". (A gift claim overrides the label afterwards.)

At `const holdsIt = store.active().some(t => t.collectionId === info.tx1Ref)`:

Show a "View content" button if this wallet already holds an edition of this collection.

## showViewButton

```ts
function showViewButton(info: CollectionInfo, show: boolean): void
```

Reveal the sales-page "View content" button for holders (label reflects encryption).

## cacheHostFrom

```ts
function cacheHostFrom(srcHost: string | null): string | null
```

Resolve which BigRed site (if any) to use as a display cache. Explicit `&src=<host>` from a "Get a copy" link
 wins; else the referring page's hostname (works for any BigRed niche site, no per-site config). Returns a bare
 hostname or null (→ chain-only, e.g. a Phar Lap share link or direct paste).

At `try { const r = new URL(document.referrer); if (r.origin !== location.origin) host = r.hostname.t...`:

ignore

At `return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null`:

a bare hostname only — never a path/scheme

## ListingCache

```ts
interface ListingCache { title: string; description: string; category: Cat; coverUrl: string }
```

## fetchListingCache

```ts
async function fetchListingCache(host: string, collectionId: string): Promise<ListingCache | null>
```

Best-effort fetch of a BigRed site's cached listing (title/description/price + cover URL) for an instant
 sales-page paint. Returns null on any miss/timeout/CORS failure so the caller falls back to the chain.

## openCollectionView

```ts
async function openCollectionView(tx1Ref: string, holderPubKey: string | null, giftWif: string | null = null, srcHost: string | null = null): Promise<void>
```

At `const host = cacheHostFrom(srcHost)`:

Fast path: if the buyer came from a BigRed site, paint its cached cover/title/description INSTANTLY, then a
light chain load (covenant only, no multi-MB cover download) enables the buy. Any cache miss/failure falls
straight through to the full chain load below.

At `info = await loadCollection(tx1Ref, holderPubKey)`:

light failed (odd output layout) → full chain load

At `if (cache) info = { ...info, name: info.name || cache.title, description: info.description || cac...`:

Graft the cache's display fields onto the (light) covenant info so renderCollectionView has everything.

At `if (info.cover != null) void registerOgAssets(info)`:

only when the cover bytes were actually loaded (full load)

At `setCvGetLabel('🎁 Get your free copy')`:

Reframe the page as a free gift claim.

At `void loadSellerNote(info, holderPubKey ?? info.publisherPubKeyHex)`:

Resolve the seller's current promo note (async, best-effort) for the link's seller.

## onOpenSalesPage

```ts
function onOpenSalesPage(t: StoredToken): void
```

Open the sales page for an edition you hold, as its seller (so Share yields YOUR link).

## closeCollectionView

```ts
function closeCollectionView(): void
```

At `if (location.hash) history.replaceState(null, '', location.pathname + location.search)`:

Drop the hash so a reload returns to the wallet rather than re-opening the storefront.

## currentShareLink

```ts
async function currentShareLink(): Promise<string | null>
```

The sales-page link for the current collection, from the current seller's perspective (routed holder
 else this wallet). Null if no collection is open.

## shareCollectionLink

```ts
async function shareCollectionLink(): Promise<void>
```

## showQrModal

```ts
function showQrModal(title: string, text: string): void
```

Pop a centered modal showing a scannable QR for `text`, with the text printed below it.

## hideBonus

```ts
function hideBonus(): void
```

Render the bonus area: a claim CTA for a holder, else a teaser; nothing if there's no bonus.

## showBonus

```ts
function showBonus(note: SellerNote | null, claimable: boolean): void
```

## loadSellerNote

```ts
async function loadSellerNote(info: CollectionInfo, sellerPub: string | null): Promise<void>
```

Resolve and show the seller's current note for the open collection; show the editor if it's my page.

At `;($('cvNoteRefresh')).style.display = 'none'; cvNoteRefreshId = null`:

reset the ↻ button per collection

At `} catch {`:

best-effort — a missing note is normal

At `if (current == null && info.covenantHex) {`:

Hands-off propagation: if the seller hasn't published their own, use the note that rode in on their
edition (the on-chain echo from when they acquired it).

At `} catch {`:

best-effort

At `if (current == null && isMine) {`:

Carry-forward: on my own page, if nothing resolved, offer what I captured when I bought.

At `showBonus(current, holdsIt)`:

holder sees a claim button; everyone else a teaser

## paintCvNote

```ts
function paintCvNote(note: SellerNote): void
```

Render the seller note (heading + description + tags) into the storefront note box.

## parseTagsInput

```ts
function parseTagsInput(s: string): string[]
```

Parse a tags input ("#software #tools" or comma-separated) into slug-like tags.

## onSaveSellerNote

```ts
async function onSaveSellerNote(): Promise<void>
```

## onRefreshNote

```ts
async function onRefreshNote(): Promise<void>
```

After publishing/updating a note, ask nft.sale to re-read it. refresh.php enqueues the collection id; the curator
cron re-resolves the live note (title/desc/tags) on its next run — no server login, no full re-scan.

## showFundPrompt

```ts
function showFundPrompt(needed: number, have: number): void
```

At `` $('cvFundQr').innerHTML = `<div class="qr-holder qr-fund">${qrSvg(bsvPaymentUri(address, needed))... ``:

Inline payment QR with the amount needed (BIP21 bitcoin: URI — the BSV standard).

At `$('cvFund').scrollIntoView({ behavior: 'smooth', block: 'center' })`:

The fund panel sits below the buy card — make sure it's visible when it appears (esp. from the top button).

## hideFundPrompt

```ts
function hideFundPrompt(): void
```

## buying

```ts
let buying = false
```

"Get a copy": resolve the seller's current edition → fund check → permissionless replicate → reveal.

## onGetCopy

```ts
async function onGetCopy(): Promise<void>
```

At `if (cvGiftWif) {`:

── Gift claim: a funded voucher (in the link) pays the whole tx; the recipient just owns the copy.
   No price prompt, no fund check, works for a brand-new or existing wallet.

At `return`:

finally re-enables the button + clears the buying flag

At `if (needsSeedBackup()) {`:

Brand-new wallet? Secure the seed FIRST — it's the only key to the NFT we're about to add, so
back it up BEFORE broadcasting the claim. The gated modal's only exit is its confirm button, so
this await resolves once the user has written the phrase down; only then does the claim proceed.

At `if (!giftNote) { try { giftNote = readNoteFromTx(await provider.getSourceTransaction(tip.txId), i...`:

best-effort

At `rememberGifter()`:

persist the gifter's Buy-BSV referral on this (often brand-new) wallet

At `cvGiftWif = null`:

single-use — the voucher is now spent

At `setCvStatus('✅ Added to your wallet — opening your gift…', 'ok')`:

Confirm it landed, then open the content.

At `const publisherCut = tip.terms.publisherFeeSats`:

Price = the seller's fixed fees.

At `const bond = tip.tokenSats`:

Confirm against the EXACT total (fees + refundable bond + network fee) — known only after the tx is
built, so confirmSpend gates the real spend, not just the fees. `approved` keeps a retry from re-asking.

At `const needed = price + tip.tokenSats + 1200`:

Fund check: the buyer funds the price/fees + ONE bond (their replica, out[1]) + a miner-fee margin.
out[0]'s bond rides forward from the spent edition input, so it isn't funded by the buyer.

At `let echoNote = cvNote`:

The note (promo + bonus) to carry to my copy: the seller's resolved note, or (fallback) whatever rode in.

At `try { echoNote = readNoteFromTx(await provider.getSourceTransaction(tip.txId), info.tx1Ref) } cat...`:

best-effort

At `if ((e).message === SPEND_CANCELLED) throw e`:

user declined the spend — don't retry

At `setCvStatus('Another buyer was first — finding the seller’s new edition…')`:

The tip was likely taken by another buyer (double-spend) — re-resolve the seller's new edition and retry.

At `storeEdition({ txId: bought.replicaOutpoint.txId, outputIndex: bought.replicaOutpoint.outputIndex...`:

The buyer's replica (out[1]) is now ours — track it with the note + bonus that rode in on the purchase.

At `showViewButton(info, true)`:

you're a holder now — keep a persistent View button on the page

At `showBonus(echoNote, true)`:

flip any bonus teaser to a live claim

At `if (info.hasContentFile) void onView(info.tx1Ref, info.name)`:

Reveal the content (decrypts automatically — you're a holder now).

At `reflectCvOwnership(info)`:

Reflect ownership rather than blindly re-enabling: after a successful buy the wallet now holds a copy, so
the buttons ghost to "✓ You own a copy" (no accidental second purchase); on cancel/failure they re-enable.

## onBroadcast

```ts
async function onBroadcast(t: StoredToken): Promise<void>
```

Publisher: broadcast a public announcement to all holders of a collection (one tx, pull-delivered).

## onGiftCopies

```ts
async function onGiftCopies(t: StoredToken): Promise<void>
```

Any holder: create N pre-funded free-gift links for a collection (each single-use). Resellers can gift too;
 their net cost per claim is higher (they pre-pay the publisher's cut, which doesn't return to them).

At `let claimCost = 0, publisherCut = 0`:

Per-voucher funding = the recipient's replica BOND + the claim's price/fees + miner fee + a small starter.
What RETURNS on a claim differs by role: the publisher gets price + fees back (net ≈ bond + miner fee); a
reseller gets only their own share back, so they additionally eat the publisher's cut.

At `} catch {`:

leave 0

At `const bond = t.tokenSats ?? EDITION_BOND_SATS`:

unknown → assume the default (over-funding a voucher is harmless; under-funding fails the claim)

At `const fundEach = bond + claimCost + MINER + 800`:

recipient starter

At `const netEach = bond + MINER + (iAmPublisher ? 0 : publisherCut)`:

settled net once a gift is claimed

At `const { nextIndex } = await scanGiftVouchers(provider, k, t.collectionId)`:

Deterministic keys: scan for the next free index so a new batch doesn't collide with existing vouchers.

## onViewGiftLinks

```ts
async function onViewGiftLinks(t: StoredToken): Promise<void>
```

Recover this collection's UNCLAIMED gift links from your key + chain (deterministic vouchers), and re-show
 them — so you never lose access to links you didn't save.

At `const k = requireKey(); if (k == null) return`:

voucher keys derive from the wallet key

## onReclaimGifts

```ts
async function onReclaimGifts(t: StoredToken): Promise<void>
```

Any holder: reclaim UNCLAIMED gift links — sweep their pre-funded sats back to your wallet (invalidating
 those links). Already-claimed gifts are untouched.

## showGiftLinksModal

```ts
function showGiftLinksModal(title: string, links: string[]): void
```

Show the generated gift links: bulk copy/download + a per-link QR for in-person handouts.

## onViewBuyers

```ts
async function onViewBuyers(t: StoredToken): Promise<void>
```

Publisher: scan your address history for sales of this collection and list the buyers (each DM-able).

### onViewBuyers › render

```ts
const render = (res: { buyers: BuyerRecord[]; scanned: number; capped: boolean }): void =>
```

At `msg.onclick = () => composeTo(b.pubKeyHex, 'this buyer', { product: title, recipientRole: 'buyer' })`:

stacks over the list

## salesCache

```ts
let salesCache: MySales | null = null
```

📊 Sales dashboard: one scan of your address history → all your sales, both as creator (every sale of a
 collection you publish) and as reseller (your direct resales), grouped per collection.

─── Sales tab (stats + breakdown) ──────────────────────────────────

## salesNames

```ts
const salesNames = new Map<string, string>()
```

## fmtBsv

```ts
const fmtBsv = (sats: number): string =>
```

## giftsDone

```ts
const giftsDone = new WeakSet<MySales>()
```

Scans whose exact gift check has finished — until a scan is in here the Gifts tile shows "…" (not a bogus 0).

## p2pkhInputPubKeyHash

```ts
function p2pkhInputPubKeyHash(input: { script: Uint8Array }): string | null
```

The pubkey-hash (hex, lc) that a P2PKH input's scriptSig unlocks with — its trailing push is the pubkey.
 Lets us read a funding key straight from the signature, no source-output lookup. null if not a P2PKH spend.

## renderSalesTab

```ts
async function renderSalesTab(force = false): Promise<void>
```

Render the Sales tab. Reuses the last scan unless `force` (or first visit) — the scan is the expensive bit.

At `void fillGiftStats(res, height)`:

background: exactly tag which sales were gift claims, then repaint

## statTile

```ts
function statTile(label: string, value: string, sub: string): string
```

## paintSales

```ts
function paintSales(res: MySales, height: number): void
```

At `const monthFloor = height > 0 ? height - 30 * BLOCKS_PER_DAY : 0`:

Approximate "this month" by block-height delta (unconfirmed counts as recent).

At `const giftsKnown = giftsDone.has(res)`:

A gift claim cycles your OWN pre-funded voucher money back as "fees", so it's not real revenue. Once the
background gift-tagging finishes we can subtract those for a true "Net revenue". Both stats show "…" until
then, and "—" in watch-only mode (no key → can't detect which sales were gift-funded).

At `const netEarned = earned - giftEarned`:

gifts excluded

### paintSales › earnOf

```ts
const earnOf = (x: UnifiedSale): number =>
```

de-duplicated: one row per real sale, so no double-count across creator/reseller roles

## salesUnified

```ts
function salesUnified(sales: UnifiedSale[], names: Map<string, string>): HTMLElement
```

One de-duplicated list of sales, grouped by collection — each purchase shown ONCE, with its date and which
 fees you earned (both / publisher-only / holder-only). Replaces the old overlapping creator+reseller sections.

At `const buyerKeys = new Map()`:

lc -> original key, to de-dupe buyers for "message all"

## fillGiftStats

```ts
async function fillGiftStats(res: MySales, height: number): Promise<void>
```

Background: tag EXACTLY which sales were gift claims, then repaint. A claim is funded by one of the
 collection's gift vouchers, so we derive that collection's funded voucher hashes (bounded by how many links
 you ever made) and check each sale's funding input against them — a sweep/reclaim never funds a sale, so it's
 correctly excluded. Only your published collections have your vouchers. Best-effort; skipped when watch-only.

At `if (hashes.size === 0) continue`:

no gift links for this collection → none of its sales are gifts

At `const tx = await provider.getSourceTransaction(s.txId)`:

the small replicate tx (never content)

At `for (let i = 1; i < tx.inputs.length; i++) {`:

input[0] = the edition being cloned; funding follows

At `} catch {`:

best-effort — leave untagged

At `if (salesCache !== res) return`:

a newer scan superseded this one

At `paintSales(res, height)`:

repaint with exact 🎁 labels + the true gift count

## discAnchor

```ts
let discAnchor: StoredToken | null = null // the held edition whose corridor is current...
```

─── discussions (lineage corridors) ────────────────────────────────

## discRooms

```ts
function discRooms(): StoredToken[]
```

the held edition whose corridor is currently open

One room per held EDITION collection (corridors are a lineage/replication feature); first held copy anchors it.

## renderDiscRooms

```ts
function renderDiscRooms(): void
```

## openDiscRoom

```ts
async function openDiscRoom(t: StoredToken): Promise<void>
```

## loadDiscThread

```ts
async function loadDiscThread(t: StoredToken): Promise<void>
```

At `sendBtn.disabled = false`:

re-enable on every (re)load — a prior successful post left it disabled

At `const opts = []`:

Post targets: your line (self) + reply to any upline; the publisher can also post to everyone (root).

At `const targetIdx = result.nodes.indexOf(target)`:

Drop a downstream breadcrumb on every node ABOVE the target (its ancestors in the corridor) so they
discover this post; root is included, giving the publisher the whole-tree view.

## discIdentityBadge

```ts
function discIdentityBadge(authorPubKeyHex: string, ctx: { nodes: CorridorNode[]; publisherHash?: string }): string
```

Un-spoofable identity badge for a post author, derived from lineage: 👑 creator (author hashes to the
 covenant's publisher key), 🌱 original holder (a genesis node owner), ✓ holder (a resolved corridor owner).

At `} catch {`:

malformed key — no badge

## renderDiscFeed

```ts
function renderDiscFeed(feedEl: HTMLElement, posts: Array<DiscPost & { node: CorridorNode }>, ctx: { nodes: CorridorNode[]; publisherHash?: string }): void
```

## onCheckUpdates

```ts
async function onCheckUpdates(): Promise<void>
```

Holder: pull announcements from the publishers of every collection you hold → newest-first feed.

At `} catch {`:

skip a collection that fails to load

At `feed.sort((a, b) => (b.height || 1e12) - (a.height || 1e12))`:

newest first; unconfirmed → top

At `applyLatestAliases(feed.map(b => ({ pk: b.publisherPubKeyHex, alias: b.senderAlias })))`:

newest broadcast's @name per publisher

At `renderTokens()`:

surface any newly-cached latest announcements inline on the tokens

## UpdateItem

```ts
type UpdateItem = Broadcast & { name: string; publisherPubKeyHex: string }
```

## renderUpdatesFeed

```ts
function renderUpdatesFeed(feed: UpdateItem[]): void
```

## activateTab

```ts
function activateTab(name: string): void
```

Wire the wallet section tabs (show one panel at a time) and restore the last-viewed tab.

Switch the active wallet tab (also reachable programmatically, e.g. "Message publisher" → Messages).

At `` const navBtn = document.querySelector(`.tab[data-tab="${name}"]`) ``:

Watch-only: never land on a key-only tab (Publish / DMs) — fall back to the Wallet tab.

At `try { localStorage.setItem('p2:activeTab', name) } catch {`:

private mode — ignore

At `if (name === 'discussions' && discAnchor == null) renderDiscRooms()`:

Populate the Discussions room list on open (unless a room is already open, so a reload of the tab keeps it).

At `if (name === 'sales') void renderSalesTab()`:

reuses the cached scan after the first visit

## initTabs

```ts
function initTabs(): void
```

At `document.querySelectorAll('[data-goto]').forEach(el => {`:

Home-page cards (and any other in-app shortcut) jump to a tab via data-goto.

At `try { saved = localStorage.getItem('p2:activeTab') } catch {`:

ignore

## init

```ts
async function init(): Promise<void>
```

At `await importPharLap1Watch()`:

The wallet loads first: an import from Phar Lap 1 copies its names and contacts, which are read after it.

At `loadAliases()`:

before useKey(): renderWallet() draws your own avatar, which reads the loaded p2:avatars cache

At `void refreshMarkerBackup()`:

each use brings the token backup up to date, from the last block it read

At `try { if (localStorage.getItem('p2:nftview') === 'grid') nftView = 'grid' } catch {`:

default list

At `try { if (localStorage.getItem('p2:nftsort') === 'publisher') nftSort = 'publisher' } catch {`:

default recent

At `document.addEventListener('click', onCopyClick)`:

click-to-copy for any [data-copy] element

At `document.addEventListener('click', onAliasSaveClick)`:

save a self-claimed alias to your contacts

At `$('tokenModalBody').addEventListener('click', e => {`:

Any action button inside the detail modal navigates or mutates — hide the modal so it doesn't stack over
a viewer/storefront that the action opens (capture phase, hide-only, so the button's own handler still runs).

At `wireScanButtons()`:

inject 📷 scan buttons beside [data-scan] inputs

At `;($('edFile')).disabled = on`:

In combine mode the EP's content IS the reference manifest, so the file/encrypt inputs don't apply.

At `enc.disabled = on; if (on) enc.checked = false`:

disabling alone leaves .checked true — clear it

At `;($('edBond')).addEventListener('input', updateFeePctPreview)`:

bond feeds the buyer-total preview

At `;($('tokBackupFile')).addEventListener('change', () => { if (restoreChoicePending) void onTokenBa...`:

A restore waiting on "Choose backup file" goes ahead as soon as one is chosen.

At `localStorage.removeItem(BACKED_UP_KEY); showSeedModal(mnemonic)`:

new seed → not backed up until confirmed

At `;($('restoreWif')).value = ''`:

the key is kept; it does not stay in the page

At `await switchWallet(k, true)`:

WIF import has no phrase; recover purchases from chain

At `await switchWallet(k, true, phrase)`:

recover purchases from chain + keep the phrase

At `markBackedUp()`:

they typed their own seed → it's already backed up

At `$('btnSendBsv').onclick = () => void onSendBsv()`:

Send BSV (plain payment) + air-gap export

At `$('advAirgap').addEventListener('toggle', () => { if (($('advAirgap')).open) populateAirgapEditio...`:

Air-gapped signing (Advanced panel)

At `$('viewer').onclick = (e) => { if (e.target === $('viewer')) closeViewer() }`:

click backdrop to close

At `$('cvWallet').onclick = () => closeCollectionView()`:

Collection / sales view (shareable links).

At `document.querySelector('.cv-buy')?.scrollIntoView({ behavior: 'smooth', block: 'center' })`:

The hero button sits above the fold, but the flow it drives (status, price confirm, fund prompt) lives
in the buy card lower down — scroll it into view so the purchase isn't happening off-screen.

At `$('cvBuyAnother').onclick = () => {`:

Deliberate re-purchase escape hatch (shown only once you own a copy): a confirm, then the normal buy flow.

At `const listParam = new URLSearchParams(location.hash.replace(/^#/, '')).get('list')`:

"List your NFT here" deep link (#list=<pubkey>): pre-fill the onboard target and send the publisher to
My NFTs to pick a collection to send a copy of.

At `const route = parseHashRoute()`:

If the page was opened via a share link, show the storefront over the wallet.

At `if (loaded?.then === 'recover') await switchWallet(loaded.key, true, loaded.words ?? undefined)`:

A wallet brought back, or begun again, in place of one that would not open: kept now, as any switch is.
