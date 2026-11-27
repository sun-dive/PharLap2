// © 2026 sun-dive — Business Source License 1.1 (see LICENSE).
import { Tx } from '../impl/js/transaction.mjs'
import { LockingScript, Script } from '../impl/js/script.mjs'
import { Signer, wireToTxid } from '../impl/js/signer.mjs'
import { toHex } from '../impl/js/bytes.mjs'
import * as bip39 from '../impl/js/bip39.mjs'
import { hexBytes, hexOf, utf8Of, sha256Bytes, hash160Bytes, addressFromPubHex, compressedPubKeyHex } from './bytes.js'
import { WalletProvider } from './walletProvider.js'
import { PharLapStore } from './pharlapStore.js'
import { createCollection, getSafeUtxos, selectFunding, PHARLAP_OUTPUT_SATS, DEFAULT_FEE_PER_KB, SPEND_CANCELLED } from './collectionBuilder.js'
import { readMockupBundle, mintMockupProduct } from './mockupIngest.js'
import { ratioOf, RATIOS } from './mockup.js'
import { createEdition, replicateEdition, transferEdition, burnEdition, scanIncomingEditions, resolveHolderEdition, createGiftVouchers, scanGiftVouchers, scanVoucherHashes, sweepGiftVouchers, claimGiftEdition, scanCollectionBuyers, scanMySales,  } from './editionBuilder.js'
import { buildAirgapRequest, buildAirgapPaymentRequest, signAirgapRequest, encodeAirgapRequest, decodeAirgapRequest,  } from './airgap.js'
import { analyseCosign, cosignTransaction,  } from './cosign.js'
import { sendPayment, gatherPaymentFunding, buildPaymentTx, assertValidAddress } from './payment.js'
import { parseEditionScript, editionSupportsBurn } from './covenant.js'
import { createTransfer, scanIncoming } from './transfer.js'
import { packAlbum, parseAlbum, isAlbum, ALBUM_MIME, MAX_ALBUM_TRACKS } from './album.js'
import { packManifest, parseManifest, isManifest, MANIFEST_MIME } from './refManifest.js'
import { isBmf, parseBmf, fmtLrcTime } from './bmf.js'
import { parseBmcSet, bmcMember } from './bmc.js'
import { parseFlacPictures, parseFlacLyrics } from './flacMeta.js'
import { parseId3Pictures, parseId3Lyrics } from './id3.js'
import { parseLyrics } from './lyrics.js'
import { resolveCue } from './sceneTimeline.js'
import { sendMessage, scanIncomingMessages } from './messageBuilder.js'
import { publishSellerNote, resolveSellerNote, readNoteFromTx, noteHasContent } from './sellerNote.js'
import { publishPreview, resolvePreview, MAX_PREVIEW_BYTES } from './preview.js'
import { publishBroadcast, resolveBroadcasts } from './broadcast.js'
import { qrSvg, bsvPaymentUri } from './qr.js'
import { verifyTokenLineage, verifyEditionCovenant } from './verify.js'
import { parseTemplateScript, parseFileScript, parseStorefrontScript, parseLegacyFileScript, decodeTokenRules,  } from './tokenCodec.js'
import { cachedThumb, thumbResolved, cacheNoThumb, cacheThumbUrl, makeThumb, cachedMime, cacheMime, downscaleToAvatar } from './thumbs.js'
import { publishProfile, resolveProfile } from './profile.js'
import { readCorridor, postToNodeFeed,  } from './discussion.js'
import { publishConfigBackup, resolveConfigBackup, mergeConfig } from './configBackup.js'
import { emptyMarkerBackup, updateMarkerBackup, parseMarkerBackup, mergeMarkerBackups, markerTxIds, markerBackupFileName, heldTransactions,  } from './markerBackup.js'
import { unwrapContentKey, decryptContent } from './contentCrypto.js'
import { loadSecret, saveSecret, forgetSecret, keepStorage, UNREADABLE } from './keystore.js'
import { decompress } from './compress.js'

const APP_BASE = location.pathname.replace(/[^/]*$/, '')

const WIF_KEY = 'p2:wallet:wif'
const WATCH_KEY = 'p2:wallet:watch'

let key
let pubKeyHex
let address
let provider
let store
let nftView = 'list'
let nftSort = 'recent'
let lastInbox = []
let lastUpdatesFeed = null

const $ = (id) => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el
}
const val = (id) => ($(id)).value.trim()
const short = (s, n = 10) => (s.length > 2 * n ? `${s.slice(0, n)}…${s.slice(-n)}` : s)
const kb = (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`)
const fmtTime = (ms) => { try { return new Date(ms).toLocaleString() } catch { return '' } }
const fmtUtc = (ms) => { try { return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') } catch { return '' } }
function setStatus(msg, kind = 'info') {
  const el = $('status')
  el.textContent = msg
  el.className = `status ${kind}`
}
function setStatusHtml(html, kind = 'info') {
  const el = $('status')
  el.innerHTML = html
  el.className = `status ${kind}`
}
function idChip(full) {
  return `<span class="copyid" data-full="${escapeHtml(full)}" title="Click to copy the full id">${escapeHtml(short(full))}</span>`
}
document.addEventListener('click', e => {
  const chip = (e.target)?.closest?.('.copyid')
  if (chip?.dataset.full) { void navigator.clipboard?.writeText(chip.dataset.full); toast('Copied ✓') }
})

const MNEMONIC_KEY = 'p2:wallet:mnemonic'
const BACKED_UP_KEY = 'p2:wallet:backedUp'
const DERIVATION_PATH = "m/44'/236'/0'/0/0"

function keyFromMnemonic(phrase, passphrase = '') {
  const m = phrase.trim().replace(/\s+/g, ' ')
  if (!bip39.isValid(m)) throw new Error('invalid seed phrase')
  return Signer.fromSeed(bip39.toSeed(m, passphrase), DERIVATION_PATH)
}

function newSeedWallet() {
  const mnemonic = bip39.fromEntropy(crypto.getRandomValues(new Uint8Array(16)))
  return { mnemonic, key: keyFromMnemonic(mnemonic) }
}

let words = null
let keySealed = false

const wordsOrNull = (w) => (w != null && w.trim() !== '' ? w : null)

const SEALED_FLAG = 'p2:wallet:sealed'

async function keepSecret(k, w, seal = true) {
  const wif = k.toWif()
  if (seal) {
    try {
      await saveSecret({ wif, words: w })
      keySealed = true
      try { localStorage.setItem(SEALED_FLAG, '1'); localStorage.removeItem(WIF_KEY); localStorage.removeItem(MNEMONIC_KEY) } catch { }
      return
    } catch { }
  }
  keySealed = false
  localStorage.setItem(WIF_KEY, wif)
  if (w != null) localStorage.setItem(MNEMONIC_KEY, w); else localStorage.removeItem(MNEMONIC_KEY)
  if (seal) try { await forgetSecret(); localStorage.removeItem(SEALED_FLAG) } catch { }
}

function dropPlainCopies(s) {
  try {
    const wif = localStorage.getItem(WIF_KEY)
    if (wif == null || wif !== s.wif) return
    const w = wordsOrNull(localStorage.getItem(MNEMONIC_KEY))
    if (w != null && w !== s.words) return
    localStorage.removeItem(WIF_KEY); localStorage.removeItem(MNEMONIC_KEY)
  } catch { }
}

const P1_WIF = 'p:wallet:wif', P1_WORDS = 'p:wallet:mnemonic', P1_WATCH = 'p:wallet:watch'
const IMPORTED_KEY = 'p2:wallet:importedFrom1'
const P1_WALLET_ITEMS = ['tokens', 'contacts', 'contactsAt', 'pinned', 'myalias', 'myaliasAt', 'cfgDirty', 'cfgBackupAt', 'wallet:backedUp']
const P1_JOINED_ITEMS = ['aliases', 'avatars']
const P1_FILLED_ITEMS = ['nftview', 'nftsort', 'activeTab', 'refBy', 'affRefCode']
const ASIDE = 'aside:'

function pharLap1Wallet() {
  try {
    const wif = localStorage.getItem(P1_WIF)
    return wif ? { key: Signer.fromWif(wif), words: wordsOrNull(localStorage.getItem(P1_WORDS)) } : null
  } catch { return null }
}

function copyPharLap1Items(replace) {
  const theirs = (k) => localStorage.getItem('p:' + k)
  const ours = (k) => localStorage.getItem('p2:' + k)
  for (const k of P1_WALLET_ITEMS) {
    const v = theirs(k)
    if (v != null && (replace || ours(k) == null)) localStorage.setItem('p2:' + k, v)
    else if (v == null && replace) localStorage.removeItem('p2:' + k)
  }
  for (const k of P1_JOINED_ITEMS) {
    const v = theirs(k); if (v == null) continue
    try { localStorage.setItem('p2:' + k, JSON.stringify({ ...JSON.parse(v), ...JSON.parse(ours(k) ?? '{}') })) } catch { }
  }
  for (const k of P1_FILLED_ITEMS) { const v = theirs(k); if (v != null && ours(k) == null) localStorage.setItem('p2:' + k, v) }
}

async function setAside(k, w, seal) {
  if (seal) { try { await saveSecret({ wif: k.toWif(), words: w }, ASIDE + k.address()); return } catch { } }
  localStorage.setItem('p2:wallet:' + ASIDE + k.address(), JSON.stringify({ wif: k.toWif(), words: w }))
}

async function importPharLap1Watch() {
  try {
    const pub = localStorage.getItem(P1_WATCH)
    if (pub == null || localStorage.getItem(P1_WIF) != null || localStorage.getItem(WATCH_KEY) != null) return
    if (localStorage.getItem(IMPORTED_KEY) === 'watch:' + pub) return
    if (localStorage.getItem(WIF_KEY) != null || localStorage.getItem(SEALED_FLAG) != null) return
    try { if ((await loadSecret()) != null) return } catch { }
    copyPharLap1Items(false)
    localStorage.setItem(WATCH_KEY, pub)
    localStorage.setItem(IMPORTED_KEY, 'watch:' + pub)
  } catch { }
}

async function loadWallet() {
  let kept = null
  let readable = true
  try { kept = await loadSecret() } catch { readable = false }
  const p1 = pharLap1Wallet()
  if (kept === UNREADABLE) return askForUnreadable('unreadable', p1)
  if (!readable && localStorage.getItem(SEALED_FLAG) != null) return askForUnreadable('store', p1)

  let mine = null
  if (kept != null) {
    try { mine = { key: Signer.fromWif(kept.wif), words: wordsOrNull(kept.words) } } catch { return askForUnreadable('unreadable', p1) }
  } else {
    const wif = localStorage.getItem(WIF_KEY)
    if (wif) { try { mine = { key: Signer.fromWif(wif), words: wordsOrNull(localStorage.getItem(MNEMONIC_KEY)) } } catch { mine = null } }
  }

  if (p1 != null && localStorage.getItem(IMPORTED_KEY) !== p1.key.address()) {
    const other = mine != null && mine.key.address() !== p1.key.address()
    if (other) {
      try { await setAside(mine.key, mine.words, readable) } catch { return opened(mine, kept) }
    }
    const w = p1.words ?? (other ? null : mine?.words ?? null)
    copyPharLap1Items(other)
    await keepSecret(p1.key, w, readable)
    localStorage.setItem(IMPORTED_KEY, p1.key.address())
    return { key: p1.key, words: w, then: null }
  }
  if (mine != null) return opened(mine, kept)
  const fresh = newSeedWallet()
  await keepSecret(fresh.key, fresh.mnemonic, readable)
  return { key: fresh.key, words: fresh.mnemonic, then: null }

  async function opened(m, sealed) {
    if (sealed != null) {
      keySealed = true
      try { localStorage.setItem(SEALED_FLAG, '1') } catch { }
      dropPlainCopies(sealed)
    } else await keepSecret(m.key, m.words, readable)
    return { key: m.key, words: m.words, then: null }
  }
}

function askForUnreadable(why, p1) {
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'modal'
    const say = why === 'store'
      ? 'Your wallet is sealed in this browser, but the browser would not open its storage just now. Nothing has been changed. Reload the page to try again.'
      : 'A wallet is saved in this browser, but the browser will not open it. Nothing has been changed. Bring it back with its 12 words or its WIF.'
    overlay.innerHTML =
      '<div class="modal-box" style="max-width:460px">' +
      '<div class="modal-head"><span>🔑 Your wallet will not open</span></div>' +
      `<p style="font-size:13px;margin:0 0 10px">${say}</p>` +
      '<div class="row" style="margin:0 0 10px">' +
      (why === 'store' ? '<button class="unr-reload">Reload</button>' : '') +
      (p1 != null ? `<button class="secondary unr-p1">Open your original wallet (${escapeHtml(short(p1.key.address(), 6))})</button>` : '') +
      '</div>' +
      '<textarea class="unr-secret" rows="2" autocomplete="off" spellcheck="false" placeholder="your 12 words, or the WIF" style="width:100%;box-sizing:border-box"></textarea>' +
      '<p class="unr-err" style="font-size:13px;color:#e5484d;margin:6px 0 0" hidden></p>' +
      '<div class="row" style="margin-top:12px"><button class="unr-restore">Restore</button><button class="secondary unr-new">Start a new wallet instead</button></div>' +
      '</div>'
    const field = overlay.querySelector('.unr-secret')
    const err = overlay.querySelector('.unr-err')
    const done = (r) => { field.value = ''; overlay.remove(); resolve(r) }
    overlay.querySelector('.unr-reload')?.addEventListener('click', () => location.reload())
    overlay.querySelector('.unr-p1')?.addEventListener('click', () => { if (p1 != null) done({ key: p1.key, words: p1.words, then: 'import' }) })
    overlay.querySelector('.unr-restore')?.addEventListener('click', () => {
      const v = field.value.trim().replace(/\s+/g, ' ')
      try {
        if (bip39.isValid(v)) done({ key: keyFromMnemonic(v), words: v, then: 'recover' })
        else done({ key: Signer.fromWif(v), words: null, then: 'recover' })
      } catch { err.textContent = 'Those are not 12 valid words or a valid WIF.'; err.hidden = false }
    })
    const startNew = overlay.querySelector('.unr-new')
    startNew.addEventListener('click', () => {
      if (startNew.dataset.sure !== '1') { startNew.dataset.sure = '1'; startNew.textContent = 'Yes, replace the saved wallet'; return }
      const fresh = newSeedWallet()
      done({ key: fresh.key, words: fresh.mnemonic, then: 'fresh' })
    })
    document.body.append(overlay)
  })
}

function markBackedUp() { localStorage.setItem(BACKED_UP_KEY, '1') }
function needsSeedBackup() { return words != null && !localStorage.getItem(BACKED_UP_KEY) }

function useKey(k, w) {
  localStorage.removeItem(WATCH_KEY)
  key = k
  words = w
  void keepStorage()
  pubKeyHex = toHex(k.publicKey())
  address = k.address()
  provider = new WalletProvider(address)
  salesCache = null
  renderWallet()
  markerBackup = loadMarkerBackup(address)
  provider.seedTransactions(heldTransactions(markerBackup))
}

function useWatchKey(watchPubKeyHex) {
  const pub = compressedPubKeyHex(watchPubKeyHex)
  key = null
  words = null
  pubKeyHex = pub
  address = addressFromPubHex(pub)
  provider = new WalletProvider(address)
  salesCache = null
  renderWallet()
  markerBackup = loadMarkerBackup(address)
  provider.seedTransactions(heldTransactions(markerBackup))
}

function isWatchOnly() { return key == null }

function requireKey() {
  if (key == null) {
    setStatus('This is a watch-only wallet — it holds no private key. Export the request here, sign it on your offline machine, then broadcast the signed result.', 'error')
    return null
  }
  return key
}

async function switchToWatch(watchPubKeyHex) {
  const pub = compressedPubKeyHex(watchPubKeyHex)
  try { await forgetSecret() } catch {
    let left = null
    try { left = await loadSecret() } catch { }
    if (left != null) throw new Error('the key could not be removed from this browser')
  }
  localStorage.removeItem(SEALED_FLAG)
  localStorage.setItem(WATCH_KEY, pub)
  localStorage.removeItem(WIF_KEY)
  localStorage.removeItem(MNEMONIC_KEY)
  store.clear()
  useWatchKey(pub)
  renderTokens()
  void refreshBalance()
  restoreTokens()
}

async function switchWallet(k, recover, mnemonic) {
  const w = wordsOrNull(mnemonic)
  await keepSecret(k, w)
  store.clear()
  useKey(k, w)
  renderTokens()
  void refreshBalance()
  if (!recover) void refreshMarkerBackup()
  if (recover) {
    restoreTokens()
    void restoreConfigFromChain(true).then(n => {
      if (n > 0) { renderContacts(); refreshNameSurfaces(); updateCfgBackupNote(); toast(`Restored ${n} contact${n > 1 ? 's' : ''} from your backup`) }
    }).catch(() => { })
  }
}

function renderWallet() {
  $('address').textContent = address
  $('pubkey').textContent = pubKeyHex
  const mine = document.getElementById('myIdenticon')
  if (mine) mine.innerHTML = avatarHtml(pubKeyHex, 22)
  document.body.classList.toggle('watch-only', key == null)
  const watchEl = document.getElementById('watchBanner'); if (watchEl != null) watchEl.hidden = key != null
  const seedEl = document.getElementById('seedPhrase')
  if (seedEl != null) seedEl.placeholder = words != null ? 'Tap Reveal to show the 12 words' : '(this wallet was imported from a WIF - it has no seed phrase; back up the WIF below)'
  hideWif()
  hideSeed()
  const sealNote = document.getElementById('keySealNote')
  if (sealNote != null) sealNote.textContent = keySealed
    ? '🔒 Kept sealed in this browser. The words and the WIF are shown only when you tap Reveal or Show.'
    : '⚠️ This browser could not seal the key, so it is kept unsealed, as before.'
}

function hideWif() {
  const el = $('wif')
  el.type = 'password'
  el.value = ''
  $('btnWifShow').textContent = '👁 Show'
}

function hideSeed() {
  const el = document.getElementById('seedPhrase'); const btn = document.getElementById('btnSeedShow')
  if (el != null) { el.value = ''; el.classList.add('blurred') }
  if (btn != null) btn.textContent = '👁 Reveal'
}
function toggleSeed() {
  const el = document.getElementById('seedPhrase'); const btn = document.getElementById('btnSeedShow')
  if (el == null || btn == null) return
  if (!el.classList.contains('blurred')) { hideSeed(); return }
  el.value = key != null ? (words ?? '') : ''
  el.classList.remove('blurred')
  btn.textContent = '🙈 Hide'
}

function showSeedModal(mnemonic, opts = {}) {
  const words = mnemonic.split(' ')
  const overlay = document.createElement('div'); overlay.className = 'modal'
  const closeBtn = opts.gated ? '' : '<button class="secondary seed-close">✕ Close</button>'
  const intro = opts.intro ? `<p style="font-size:13px;margin:0 0 8px;color:#eab300;font-weight:600">${escapeHtml(opts.intro)}</p>` : ''
  const doneLabel = opts.gated ? '✅ I’ve written down my seed phrase — claim my NFT gift' : 'I’ve written it down'
  overlay.innerHTML =
    '<div class="modal-box" style="max-width:460px">' +
    `<div class="modal-head"><span>🔑 Your new seed phrase</span>${closeBtn}</div>` +
    intro +
    '<p class="muted" style="font-size:13px;margin:0 0 10px">Write these 12 words down, in order, and keep them secret &amp; safe. <b>Anyone with them controls this wallet</b>, and if you lose them with no backup it <b>cannot be recovered</b>.</p>' +
    `<div class="seed-grid">${words.map((w, i) => `<div class="seed-word"><span class="seed-num">${i + 1}</span> ${escapeHtml(w)}</div>`).join('')}</div>` +
    `<div class="row" style="margin-top:12px"><button class="seed-copy">Copy phrase</button><button class="secondary seed-done">${doneLabel}</button></div>` +
    '</div>'
  const close = () => overlay.remove()
  overlay.querySelector('.seed-close')?.addEventListener('click', close)
  overlay.querySelector('.seed-done')?.addEventListener('click', () => { markBackedUp(); close(); opts.onDone?.() })
  overlay.querySelector('.seed-copy')?.addEventListener('click', () => void navigator.clipboard?.writeText(mnemonic))
  document.body.append(overlay)
}

const SIMPLESWAP_BASE = 'https://simpleswap.io/'
const DEFAULT_REF_CODE = 'efe9f9694b4f'
let incomingAff = null

function extractRefCode(input) {
  const s = input.trim()
  if (s === '') return null
  const m = s.match(/[?&](?:ref|referral)=([^&\s]+)/i)
  if (m) return decodeURIComponent(m[1])
  if (/^[A-Za-z0-9_-]{3,}$/.test(s)) return s
  return null
}
function myRefCode() {
  try { return localStorage.getItem('p2:affRefCode') } catch { return null }
}
function refByCode() {
  try { return localStorage.getItem('p2:refBy') } catch { return null }
}
function rememberGifter() {
  if (incomingAff == null || incomingAff === '') return
  try { if (localStorage.getItem('p2:refBy') == null) localStorage.setItem('p2:refBy', incomingAff) } catch { }
}
function buyBsvUrl() {
  const code = incomingAff || myRefCode() || refByCode() || DEFAULT_REF_CODE
  const ref = code ? 'ref=' + encodeURIComponent(code) + '&' : ''
  return SIMPLESWAP_BASE + '?' + ref + 'from=btc-btc&to=bsv-bsv&amount=0.001'
}
function onBuyBsv() { window.open(buyBsvUrl(), '_blank', 'noopener,noreferrer') }

function withAff(url) {
  const code = myRefCode()
  return code != null && code !== '' ? `${url}&aff=${encodeURIComponent(code)}` : url
}

function collectionShareUrl(txid, holder, giftWif) {
  const params = new URLSearchParams({ h: holder })
  if (giftWif) params.set('g', giftWif)
  return withAff(`${location.origin}${APP_BASE}c/${txid}#${params.toString()}`)
}

async function shortShareBase(txid, holder) {
  try {
    const r = await fetch(`${APP_BASE}shorten.php`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txid, holder, aff: myRefCode() ?? undefined }),
    })
    const data = await r.json().catch(() => null)
    if (r.ok && data != null && typeof data.code === 'string' && data.code) return `${location.origin}${APP_BASE}s/${data.code}`
  } catch { }
  return null
}

function coverToJpegDataUrl(cover) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(cover.bytes)], { type: cover.mimeType }))
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
        const ctx = c.getContext('2d')
        if (ctx == null) { resolve(null); return }
        ctx.drawImage(img, 0, 0)
        resolve(c.toDataURL('image/jpeg', 0.85))
      } catch { resolve(null) } finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

const ogRegistered = new Set()
async function registerOgAssets(info) {
  if (ogRegistered.has(info.tx1Ref)) return
  ogRegistered.add(info.tx1Ref)
  try {
    const cover = info.cover ? await coverToJpegDataUrl(info.cover) : null
    await fetch(`${APP_BASE}register.php`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txid: info.tx1Ref, title: info.name, description: info.description, cover: cover ?? undefined }),
    })
  } catch { ogRegistered.delete(info.tx1Ref) }
}

function renderAffField() {
  const el = document.getElementById('affRefCode')
  if (el != null) el.value = myRefCode() ?? ''
}
function onSaveAff() {
  const raw = val('affRefCode')
  if (raw === '') {
    try { localStorage.removeItem('p2:affRefCode') } catch { }
    setStatus('Referral code cleared — your shared links use the app default.', 'ok'); return
  }
  const code = extractRefCode(raw)
  if (code == null) { setStatus('That doesn’t look like a SimpleSwap link or ref-code.', 'error'); return }
  try { localStorage.setItem('p2:affRefCode', code) } catch { }
  ;($('affRefCode')).value = code
  setStatus('Saved — your shared sales pages now carry your Buy-BSV referral.', 'ok')
}

let jsqrFn = null
async function loadJsqr() {
  if (jsqrFn != null) return jsqrFn
  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = './jsqr.min.js'; s.async = true
      s.onload = () => resolve(); s.onerror = () => reject(new Error('load failed'))
      document.head.append(s)
    })
    const g = (window).jsQRlib
    jsqrFn = g?.default ?? g ?? null
  } catch { jsqrFn = null }
  return jsqrFn
}

async function scanQrModal(title) {
  if (navigator.mediaDevices?.getUserMedia == null) {
    setStatus('This browser can’t access a camera (needs HTTPS + camera support).', 'error'); return null
  }
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
  } catch {
    setStatus('Camera unavailable — allow camera access (and use HTTPS) to scan.', 'error'); return null
  }
  const overlay = document.createElement('div'); overlay.className = 'modal'
  overlay.innerHTML =
    '<div class="modal-box" style="max-width:380px">' +
    `<div class="modal-head"><span>${escapeHtml(title)}</span><button class="secondary scan-close">✕ Close</button></div>` +
    '<video class="qr-scan-video" playsinline muted></video>' +
    '<p class="muted" style="font-size:12px;margin:8px 0 0">Point the camera at a QR code.</p></div>'
  document.body.append(overlay)
  const video = overlay.querySelector('video')
  video.srcObject = stream
  await video.play().catch(() => { })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const Detector = (window).BarcodeDetector
  const detector = Detector != null ? new Detector({ formats: ['qr_code'] }) : null
  let decode = null
  if (detector == null) {
    decode = await loadJsqr()
    if (decode == null) {
      stream.getTracks().forEach(t => t.stop()); overlay.remove()
      setStatus('Couldn’t load the QR scanner — check your connection and retry.', 'error'); return null
    }
  }

  return new Promise(resolve => {
    let done = false
    const finish = (val) => {
      if (done) return; done = true
      stream.getTracks().forEach(t => t.stop())
      overlay.remove(); resolve(val)
    }
    overlay.querySelector('.scan-close')?.addEventListener('click', () => finish(null))
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(null) })
    const tick = async () => {
      if (done) return
      if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        try {
          if (detector != null) {
            const codes = await detector.detect(canvas)
            if (codes.length > 0 && codes[0].rawValue) { finish(codes[0].rawValue); return }
          } else {
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const r = decode(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
            if (r?.data) { finish(r.data); return }
          }
        } catch { }
      }
      requestAnimationFrame(() => void tick())
    }
    requestAnimationFrame(() => void tick())
  })
}

function normalizeScan(kind, text) {
  let s = text.trim()
  if (kind === 'addr') s = s.replace(/^(bitcoin|bitcoinsv|bsv):/i, '').split('?')[0].trim()
  else if (kind === 'pubkey') { const m = s.match(/[?&#]h=([0-9a-fA-F]{66,130})/); if (m) s = m[1] }
  return s
}

async function onScanInto(input, kind) {
  const text = await scanQrModal('📷 Scan QR code')
  if (text == null) return
  input.value = normalizeScan(kind, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  setStatus('Scanned ✓', 'ok')
}

function wireScanButtons() {
  document.querySelectorAll('input[data-scan]').forEach(input => {
    if (input.dataset.scanWired === '1') return
    input.dataset.scanWired = '1'
    const btn = document.createElement('button')
    btn.type = 'button'; btn.className = 'secondary scan-btn'; btn.textContent = '📷'; btn.title = 'Scan a QR code'
    const wrap = document.createElement('div'); wrap.className = 'scan-row'
    input.parentNode?.insertBefore(wrap, input)
    wrap.append(input, btn)
    btn.onclick = () => void onScanInto(input, input.dataset.scan)
  })
}

async function refreshBalance() {
  setStatus('Fetching balance…')
  try {
    const safe = await getSafeUtxos(provider)
    const spendable = safe.reduce((s, u) => s + u.satoshis, 0)
    $('balance').textContent = `${spendable} sats spendable (${safe.length} funding UTXO${safe.length === 1 ? '' : 's'})`
    setStatus('Balance updated.', 'ok')
  } catch (e) {
    setStatus(`Balance error: ${(e).message}`, 'error')
  }
}

async function readFile(input) {
  const f = input.files?.[0]
  if (!f) return undefined
  const buf = new Uint8Array(await f.arrayBuffer())
  return { mimeType: f.type || 'application/octet-stream', fileName: f.name, bytes: Array.from(buf) }
}

async function readContent(input, albumName) {
  const fs = input.files
  if (!fs || fs.length === 0) return undefined
  if (fs.length === 1) return readFile(input)
  if (fs.length > MAX_ALBUM_TRACKS) throw new Error(`Select at most ${MAX_ALBUM_TRACKS} tracks for one release (got ${fs.length}).`)
  const ordered = Array.from(fs).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const tracks = []
  for (const f of ordered) tracks.push({ name: f.name, mimeType: f.type || 'application/octet-stream', bytes: Array.from(new Uint8Array(await f.arrayBuffer())) })
  const safe = (albumName || 'album').replace(/[^\w.-]+/g, '_')
  return { mimeType: ALBUM_MIME, fileName: `${safe}.plep`, bytes: packAlbum(tracks) }
}

function confirmAudioFidelity(file) {
  const isLossless = (mime, name) =>
    /wav|aiff|x-aiff|flac|x-flac|x-pn-wav/.test(mime.toLowerCase()) || /\.(wav|aif|aiff|flac|alac)$/i.test(name)
  let lossless = false
  if (file.mimeType === ALBUM_MIME) {
    for (const t of parseAlbum(file.bytes) ?? []) if (isLossless(t.mimeType, t.name)) { lossless = true; break }
  } else {
    lossless = isLossless(file.mimeType, file.fileName)
  }
  const big = file.bytes.length > 8 * 1024 * 1024
  if (!lossless && !big) return true
  const advice = lossless
    ? 'Compressing to MP3/Opus first can cut the cost dramatically — but if you want maximum fidelity, keeping it lossless is totally fine.'
    : 'Compressing it first can cut the cost — but if you need the full file, that’s fine.'
  return confirm(
    `Heads up — you’re embedding ${lossless ? 'uncompressed / lossless audio' : 'a large file'} (${kb(file.bytes.length)}).\n\n` +
    `It’s stored permanently on-chain, so the mint fee scales with its size. ${advice}\n\nMint as-is?`)
}

async function onMint() {
  const k = requireKey(); if (k == null) return
  const name = val('mintName')
  const count = Math.max(1, parseInt(val('mintCount') || '1', 10))
  if (!name) { setStatus('Enter a collection name.', 'error'); return }
  setStatus('Preparing the mint transaction…')
  try {
    const file = await readContent($('mintFile'), name)
    if (file != null && !confirmAudioFidelity(file)) { setStatus('Mint cancelled — compress the file first, or proceed as-is when you’re ready.'); return }
    const result = await createCollection(provider, k, {
      tokenName: name, supply: count, mintCount: count, file,
      confirmSpend: total => confirm(
        `Mint ${count} NFT${count > 1 ? 's' : ''} in “${name}”${file ? ` (embedding a ${kb(file.bytes.length)} file)` : ''}?\n\n` +
        `This spends ${total.toLocaleString()} sats from your wallet (network fee + ${count} × 1-sat token output${count > 1 ? 's' : ''}).\n\n` +
        `Proceed?`),
    })
    for (const op of result.tokenOutpoints) {
      store.add({ txId: op.txId, outputIndex: op.outputIndex, collectionId: result.collectionId, stateData: '', collectionName: name })
    }
    renderTokens()
    setStatusHtml(`Minted ${result.tokenOutpoints.length} NFT(s). Collection ${idChip(result.collectionId)} (TX1 ${idChip(result.tx1Id)}, TX2 ${idChip(result.tx2Id)}).`, 'ok')
  } catch (e) {
    if ((e).message === SPEND_CANCELLED) { setStatus('Mint cancelled — nothing was spent.'); return }
    setStatus(`Mint failed: ${(e).message}`, 'error')
  }
}

const EDITION_BOND_SATS = 1

function fmtPrice (sats) {
  const s = Math.round(Number(sats) || 0)
  return s >= 1_000_000 ? (s / 1e8).toFixed(3).replace(/\.?0+$/, '') + ' BSV' : s.toLocaleString() + ' sats'
}

function chosenBond() {
  return Math.max(1, parseInt(val('edBond') || String(EDITION_BOND_SATS), 10))
}

let feeMode = 'fixed'

function computeFees() {
  if (feeMode === 'pct') {
    const bond = chosenBond()
    const fees = Math.max(2, (parseInt(val('edPrice') || '0', 10) || 0) - bond)
    const resellerPct = Math.min(100, Math.max(0, parseInt(val('edResellerPct') || '0', 10) || 0))
    const holderFeeSats = Math.min(fees - 1, Math.max(1, Math.round(fees * resellerPct / 100)))
    return { publisherFeeSats: Math.max(1, fees - holderFeeSats), holderFeeSats }
  }
  return {
    publisherFeeSats: Math.max(1, parseInt(val('edPublisherFee') || '1', 10)),
    holderFeeSats: Math.max(1, parseInt(val('edHolderFee') || '1', 10)),
  }
}

function ownTerms() {
  return {
    publisherPubKeyHash: hash160Bytes(hexBytes(pubKeyHex)),
    ...computeFees(),
    tokenSats: chosenBond(),
  }
}

function setFeeMode(mode) {
  feeMode = mode
  $('btnFeeFixed').classList.toggle('active', mode === 'fixed')
  $('btnFeePct').classList.toggle('active', mode === 'pct')
  $('feeFixed').hidden = mode !== 'fixed'
  $('feePct').hidden = mode !== 'pct'
  updateFeePctPreview()
}

function updateFeePctPreview() {
  if (feeMode !== 'pct') return
  const bond = chosenBond()
  const enteredPrice = parseInt(val('edPrice') || '0', 10) || 0
  const el = $('edPctPreview')
  if (enteredPrice < bond + 2) {
    el.innerHTML = `<span style="color:#ffb4ae">Final price must be at least ${(bond + 2).toLocaleString()} sat (above the ${bond.toLocaleString()}-sat bond).</span>`
    return
  }
  const f = computeFees()
  const buyerTotal = f.publisherFeeSats + f.holderFeeSats + bond
  el.innerHTML =
    `→ Reseller <b>${f.holderFeeSats.toLocaleString()}</b> · Publisher <b>${f.publisherFeeSats.toLocaleString()}</b> · bond <b>${bond.toLocaleString()}</b> (refundable)` +
    `<br>Buyer pays <b>${buyerTotal.toLocaleString()} sat</b> per copy <span class="muted">(+ a small network fee; the ${bond.toLocaleString()}-sat bond is reclaimable by burning)</span>`
}

function termsFromToken(t) {
  return {
    publisherPubKeyHash: hexBytes(t.publisherPubKeyHashHex ?? ''),
    publisherFeeSats: t.publisherFeeSats ?? 0,
    holderFeeSats: t.holderFeeSats ?? 0,
    tokenSats: t.tokenSats ?? 1,
  }
}

function storeEdition(o, collectionId, name, terms, note) {
  store.add({
    txId: o.txId, outputIndex: o.outputIndex, collectionId, stateData: '', collectionName: name,
    kind: 'edition', lockHex: o.lockHex, publisherPubKeyHashHex: hexOf(terms.publisherPubKeyHash),
    publisherFeeSats: terms.publisherFeeSats, holderFeeSats: terms.holderFeeSats,
    ...(terms.tokenSats != null ? { tokenSats: terms.tokenSats } : {}),
    ...(note?.text ? { sellerNote: note.text } : {}),
    ...(note?.bonusValue ? { bonusKind: note.bonusKind, bonusValue: note.bonusValue } : {}),
  })
}

const COVER_OUT = 800
let croppedCover = null
let coverPrevUrl = null

function paintCoverPreview(blob) {
  const host = $('edCoverPreview'); if (!host) return
  if (coverPrevUrl) { URL.revokeObjectURL(coverPrevUrl); coverPrevUrl = null }
  if (!blob) { host.innerHTML = ''; return }
  coverPrevUrl = URL.createObjectURL(blob)
  host.innerHTML = `<img src="${coverPrevUrl}" alt="cover" /><span class="muted" style="font-size:12px">Cover — ${kb(blob.size)}</span>`
}

async function isAnimatedImage(f) {
  if (f.type === 'image/gif' || /\.gif$/i.test(f.name)) return true
  if (f.type === 'image/webp' || /\.webp$/i.test(f.name)) {
    try { const s = String.fromCharCode(...new Uint8Array(await f.slice(0, 4096).arrayBuffer())); return s.includes('ANIM') || s.includes('ANMF') } catch { return false }
  }
  return false
}

function isSvgImage(f) {
  return f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)
}

async function cropAndStoreCover(f) {
  const svg = isSvgImage(f)
  if (svg || await isAnimatedImage(f)) {
    const msg = svg
      ? `"${f.name}" is a scalable, self-animating SVG (${kb(f.size)}). Use it as the cover as-is?\n\nOK — keep the SVG (it rides on-chain, stays razor-sharp at any size, and the listing animates).\nCancel — pick a different image (an SVG can't go through the square crop without losing its animation).`
      : `"${f.name}" is animated (${kb(f.size)}). Keep it animated as the cover?\n\nOK — keep the animation as-is (it rides on-chain, so a larger animated cover costs a little more to mint).\nCancel — crop it to a small, static 800×800 cover instead.`
    if (confirm(msg)) {
      const bytes = Array.from(new Uint8Array(await f.arrayBuffer()))
      croppedCover = { mimeType: (svg ? 'image/svg+xml' : f.type) || 'image/webp', fileName: f.name || (svg ? 'cover.svg' : 'cover.webp'), bytes }
      paintCoverPreview(new Blob([new Uint8Array(bytes)], { type: croppedCover.mimeType }))
      return true
    }
    if (svg) return false
  }
  const blob = await openCropModal(f)
  if (!blob) return false
  croppedCover = { mimeType: blob.type || 'image/webp', fileName: 'cover.webp', bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) }
  paintCoverPreview(blob)
  return true
}

async function onCoverSelected() {
  const input = $('edCover')
  const f = input.files?.[0]
  if (!f) { croppedCover = null; paintCoverPreview(null); return }
  if (!(await cropAndStoreCover(f))) input.value = ''
}

async function onTakePhoto() {
  const photo = await capturePhotoModal()
  if (!photo) return
  ;($('edCover')).value = ''
  await cropAndStoreCover(photo)
}

async function capturePhotoModal() {
  if (navigator.mediaDevices?.getUserMedia == null) {
    setStatus('This browser can’t access a camera (needs HTTPS + camera support).', 'error'); return null
  }
  let stream
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }) }
  catch { setStatus('Camera unavailable — allow camera access (and use HTTPS) to take a photo.', 'error'); return null }
  const overlay = document.createElement('div'); overlay.className = 'modal'
  overlay.innerHTML =
    '<div class="modal-box" style="max-width:380px">' +
    '<div class="modal-head"><span>📷 Take a cover photo</span><button class="secondary cam-close">✕ Cancel</button></div>' +
    '<video class="qr-scan-video" playsinline muted></video>' +
    '<div class="row" style="justify-content:center;margin-top:10px"><button class="cam-shot">📸 Capture</button></div></div>'
  document.body.append(overlay)
  const video = overlay.querySelector('video')
  video.srcObject = stream
  await video.play().catch(() => { })

  return new Promise(resolve => {
    let done = false
    const finish = (file) => {
      if (done) return; done = true
      stream.getTracks().forEach(t => t.stop()); overlay.remove(); resolve(file)
    }
    overlay.querySelector('.cam-close').addEventListener('click', () => finish(null))
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(null) })
    overlay.querySelector('.cam-shot').addEventListener('click', () => {
      const w = video.videoWidth, h = video.videoHeight
      if (!w || !h) { setStatus('Camera not ready yet — try again.', 'error'); return }
      const c = document.createElement('canvas'); c.width = w; c.height = h
      c.getContext('2d').drawImage(video, 0, 0, w, h)
      c.toBlob(b => finish(b ? new File([b], 'photo.jpg', { type: b.type || 'image/jpeg' }) : null), 'image/jpeg', 0.92)
    })
  })
}

function openCropModal(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onerror = () => { URL.revokeObjectURL(url); setStatus('Could not read that image.', 'error'); resolve(null) }
    img.onload = () => {
      const VIEW = 300
      const overlay = document.createElement('div'); overlay.className = 'modal'
      overlay.innerHTML =
        '<div class="modal-box" style="max-width:360px">' +
        '<div class="modal-head"><span>✂️ Position your cover</span><button class="secondary crop-cancel">✕ Cancel</button></div>' +
        `<canvas class="crop-canvas" width="${VIEW}" height="${VIEW}"></canvas>` +
        '<label style="margin-top:10px">Zoom</label>' +
        '<input type="range" class="crop-zoom" min="1" max="4" step="0.01" value="1" style="width:100%" />' +
        `<p class="muted" style="font-size:11px;margin:6px 0 12px">Drag to position, slide to zoom. Saved as a ${COVER_OUT}×${COVER_OUT} WebP — small for on-chain storage.</p>` +
        '<div class="row" style="justify-content:flex-end;gap:8px"><button class="secondary crop-cancel2">Cancel</button><button class="crop-use">Use this crop</button></div>' +
        '</div>'
      document.body.appendChild(overlay)
      const canvas = overlay.querySelector('.crop-canvas')
      const ctx = canvas.getContext('2d')
      const zoom = overlay.querySelector('.crop-zoom')

      const base = Math.max(VIEW / img.width, VIEW / img.height)
      let z = 1, ox = 0, oy = 0
      const dims = () => ({ w: img.width * base * z, h: img.height * base * z })
      const clamp = () => { const { w, h } = dims(); ox = Math.min(0, Math.max(VIEW - w, ox)); oy = Math.min(0, Math.max(VIEW - h, oy)) }
      const draw = () => { const { w, h } = dims(); ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, VIEW, VIEW); ctx.drawImage(img, ox, oy, w, h) }
      { const { w, h } = dims(); ox = (VIEW - w) / 2; oy = (VIEW - h) / 2 }
      draw()

      let drag = false, lx = 0, ly = 0
      canvas.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing') })
      canvas.addEventListener('pointermove', e => {
        if (!drag) return
        const k = canvas.width / (canvas.clientWidth || canvas.width)
        ox += (e.clientX - lx) * k; oy += (e.clientY - ly) * k; lx = e.clientX; ly = e.clientY; clamp(); draw()
      })
      const endDrag = () => { drag = false; canvas.classList.remove('grabbing') }
      canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag)
      zoom.addEventListener('input', () => {
        const nz = parseFloat(zoom.value); const r = nz / z; const c = VIEW / 2
        ox = c - (c - ox) * r; oy = c - (c - oy) * r; z = nz; clamp(); draw()
      })

      const close = (b) => { URL.revokeObjectURL(url); overlay.remove(); resolve(b) }
      overlay.querySelector('.crop-cancel').addEventListener('click', () => close(null))
      overlay.querySelector('.crop-cancel2').addEventListener('click', () => close(null))
      overlay.querySelector('.crop-use').addEventListener('click', () => {
        const s = base * z, sx = -ox / s, sy = -oy / s, sSize = VIEW / s
        const out = document.createElement('canvas'); out.width = COVER_OUT; out.height = COVER_OUT
        out.getContext('2d').drawImage(img, sx, sy, sSize, sSize, 0, 0, COVER_OUT, COVER_OUT)
        out.toBlob(b => { if (b && b.type === 'image/webp') close(b); else out.toBlob(j => close(j), 'image/jpeg', 0.85) }, 'image/webp', 0.8)
      })
    }
    img.src = url
  })
}

function chosenLicense() {
  const sel = $('edLicense')
  if (sel == null) return ''
  if (sel.value === '__custom') return (($('edLicenseCustom'))?.value ?? '').trim()
  return sel.value
}

async function downscaleWebp(bytes, mimeType, maxDim) {
  const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mimeType }))
  const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s))
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(bmp, 0, 0, w, h); if (bmp.close) bmp.close()
  const blob = await new Promise(res => cv.toBlob(res, 'image/webp', 0.85))
  if (blob == null) throw new Error('preview encode failed')
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

let publishTier = 'unlimited'
function setPublishTier(t) {
  publishTier = t
  const btnIds = { unlimited: 'btnTierUnlimited', limited: 'btnTierLimited', exclusive: 'btnTierExclusive' }
  for (const [tier, id] of Object.entries(btnIds)) $(id)?.classList.toggle('active', tier === t)
  const covenant = t === 'unlimited'
  document.querySelectorAll('.covenant-only').forEach(el => { (el).hidden = !covenant })
  const countInput = $('edCount')
  if (countInput != null) {
    if (t === 'exclusive') { countInput.value = '1'; countInput.disabled = true }
    else countInput.disabled = false
  }
  const countLabel = $('edCountLabel')
  if (countLabel != null) countLabel.textContent = t === 'exclusive' ? 'Only one exists (1-of-1)'
    : t === 'limited' ? 'How many exist (the whole run)' : 'Editions to mint now'
  const hint = $('tierHint')
  if (hint != null) hint.textContent = covenant
    ? 'Unlimited: a covenant edition anyone can replicate — every copy pays you + the reseller on-chain, no marketplace needed.'
    : t === 'limited' ? 'Limited: a fixed run (e.g. “only 10”). Provable scarcity — you hold them and transfer one per sale.'
    : 'Exclusive: a single 1-of-1. Top-tier scarcity — transferred to the one buyer.'
  const btn = $('btnMintEdition')
  if (btn != null) btn.textContent = covenant ? 'Mint edition collection'
    : t === 'exclusive' ? 'Mint exclusive 1-of-1' : 'Mint limited collection'
}

async function onMintEdition() {
  const k = requireKey(); if (k == null) return
  const name = val('edName')
  if (!name) { setStatus('Enter an edition collection name.', 'error'); return }
  const count = Math.max(1, parseInt(val('edCount') || '1', 10))
  const encrypt = ($('edEncrypt')).checked
  const description = val('edDescription')
  const license = chosenLicense()
  const combineMode = ($('edCombine'))?.checked ?? false
  try {
    const mockupF = ($('edMockupFile'))?.files?.[0]
    if (mockupF) {
      const bundle = readMockupBundle(Array.from(new Uint8Array(await mockupF.arrayBuffer())))
      if (bundle == null) { setStatus('That isn’t a mockup .bmc bundle (no mockup.json inside).', 'error'); return }
      const isCov = publishTier === 'unlimited'
      const terms = isCov ? ownTerms() : null
      const supply = publishTier === 'exclusive' ? 1 : count
      const propTxid = val('edMockupProp').trim() || bundle.recipe.propTxid || undefined
      setStatus('Deriving preview…')
      const dmime = bundle.designMime
      const preview = await downscaleWebp(bundle.design, dmime, 1024)
      const dbmp = await createImageBitmap(new Blob([new Uint8Array(bundle.design)], { type: dmime }))
      const ratio = ratioOf(dbmp.width, dbmp.height); dbmp.close?.()
      setStatus(propTxid ? 'Minting mockup product…' : `Minting prop (${RATIOS[ratio].name}), then product…`)
      const res = await mintMockupProduct(provider, k, {
        base: bundle.base,
        cleanDesign: { mimeType: dmime, bytes: bundle.design },
        previewDesign: { mimeType: 'image/webp', bytes: preview },
        recipe: bundle.recipe,
        propTxid,
        ratio,
        productName: name,
        description: description || undefined,
        encrypt,
        license: license || undefined,
        supply,
        ...(terms ? { covenant: { terms } } : {}),
        confirmSpend: total => confirm(
          `Mint “${name}” as a ${isCov ? 'covenant-edition' : publishTier === 'exclusive' ? 'exclusive 1-of-1' : `limited ×${supply}`} product mockup?\n\n` +
          `${propTxid ? 'Reusing prop ' + short(propTxid) : 'Minting a NEW prop'} + the product${encrypt ? ' (encrypted design)' : ''}.\n` +
          (isCov ? `Buyers later pay publisher ${terms.publisherFeeSats} + holder ${terms.holderFeeSats} sats/copy (refundable ${(terms.tokenSats ?? EDITION_BOND_SATS).toLocaleString()}-sat bond each).\n` : '') +
          `\nThis spends ${total.toLocaleString()} sats from your wallet. Proceed?`),
      })
      if (terms && res.editions) for (const e of res.editions) storeEdition(e, res.productTxid, name, terms)
      else if (res.tokenOutpoints) for (const op of res.tokenOutpoints) store.add({ txId: op.txId, outputIndex: op.outputIndex, collectionId: res.productTxid, stateData: '', collectionName: name })
      renderTokens()
      setStatusHtml(`✅ Minted mockup product ${idChip(res.productTxid)} · prop ${idChip(res.propTxid)}. ${isCov ? 'Covenant edition — o' : 'O'}nboard a copy to the site wallet, then it appears on Big Red next curator run.`, 'ok')
      return
    }

    const file = combineMode ? await buildCombinedManifest(name) : await readContent($('edFile'), name)
    if (combineMode && file == null) { setStatus('Combine mode: pick at least 2 of your collections to bundle.', 'error'); return }
    const cover = croppedCover ?? await readFile($('edCover'))
    const backCover = await readFile($('edBackCover'))
    if (encrypt && !file) { setStatus('Encryption needs a file — attach one or uncheck encrypt.', 'error'); return }
    const manifestRefs = file != null && isManifest(file.mimeType, file.bytes) ? parseManifest(file.bytes) : null
    const trackCount = file?.mimeType === ALBUM_MIME ? (parseAlbum(file.bytes)?.length ?? 0) : 0
    const fileLabel = file == null ? ''
      : manifestRefs != null ? ` (an EP referencing ${manifestRefs.length} mint${manifestRefs.length === 1 ? '' : 's'} — no re-upload)`
      : trackCount > 0 ? ` (embedding a ${trackCount}-track album, ${kb(file.bytes.length)})`
      : ` (embedding a ${kb(file.bytes.length)} file)`
    if (file != null && !confirmAudioFidelity(file)) { setStatus('Mint cancelled — compress the file first, or proceed as-is when you’re ready.'); return }

    if (publishTier !== 'unlimited') {
      const exclusive = publishTier === 'exclusive'
      const supply = exclusive ? 1 : count
      setStatus('Preparing the mint…')
      const result = await createCollection(provider, k, {
        tokenName: name, supply, mintCount: supply, file, encrypt, description, cover, backCover, license,
        confirmSpend: total => confirm(
          `Mint ${exclusive ? 'an exclusive 1-of-1' : `a limited run of ${supply}`} — “${name}”${encrypt ? ' (encrypted)' : ''}${fileLabel}?\n\n` +
          `This spends ${total.toLocaleString()} sats from your wallet (network fee + ${supply} × 1-sat token${supply > 1 ? 's' : ''}).\n\nProceed?`),
      })
      for (const op of result.tokenOutpoints) {
        store.add({ txId: op.txId, outputIndex: op.outputIndex, collectionId: result.collectionId, stateData: '', collectionName: name })
      }
      renderTokens()
      setStatusHtml(`Minted ${result.tokenOutpoints.length} ${exclusive ? 'exclusive' : 'limited'} edition(s). Collection ${idChip(result.collectionId)} (TX1 ${idChip(result.tx1Id)}, TX2 ${idChip(result.tx2Id)}).`, 'ok')
      return
    }

    const terms = ownTerms()
    setStatus('Preparing the edition mint…')
    const result = await createEdition(provider, k, {
      tokenName: name, terms, mintCount: count, file, encrypt, description, cover, backCover, license,
      confirmSpend: total => confirm(
        `Mint ${count} edition${count > 1 ? 's' : ''} of “${name}”${encrypt ? ' (encrypted)' : ''}${fileLabel}?\n\n` +
        `This spends ${total.toLocaleString()} sats from your wallet — including a refundable ${(terms.tokenSats ?? EDITION_BOND_SATS).toLocaleString()}-sat bond per edition (reclaimable by burning), plus the network fee.\n\n` +
        `Buyers later pay the publisher ${terms.publisherFeeSats} + holder ${terms.holderFeeSats} sats per copy.\n\nProceed?`),
    })
    for (const e of result.editions) storeEdition(e, result.collectionId, name, terms)
    renderTokens()
    setStatusHtml(`Minted ${result.editions.length} edition(s). Collection ${idChip(result.collectionId)} (TX2 ${idChip(result.tx2Id)}).`, 'ok')
  } catch (e) {
    if ((e).message === SPEND_CANCELLED) { setStatus('Edition mint cancelled — nothing was spent.'); return }
    setStatus(`Edition mint failed: ${(e).message}`, 'error')
  }
}

async function buildCombinedManifest(epName) {
  const ids = checkedCombineIds()
  if (ids.length < 2) return undefined
  setStatus(`Reading ${ids.length} collections to build the EP…`)
  const refs = []
  for (const id of ids) {
    const info = await loadCollection(id)
    if (!info.hasContentFile || info.fileHash == null) throw new Error(`"${info.name || short(id)}" has no embedded content to reference`)
    if (info.encrypted) throw new Error(`"${info.name || short(id)}" is encrypted — EPs can only reference public content for now`)
    refs.push({ id, hash: info.fileHash, name: info.name || short(id), mimeType: 'application/octet-stream' })
  }
  const safe = (epName || 'ep').replace(/[^\w.-]+/g, '_')
  return { mimeType: MANIFEST_MIME, fileName: `${safe}.pref`, bytes: packManifest(refs) }
}
function checkedCombineIds() {
  return Array.from(document.querySelectorAll('.combine-pick:checked')).map(c => (c).value)
}
function updateCombineHint() {
  const hint = $('edCombineHint'); if (hint == null) return
  const n = checkedCombineIds().length
  hint.textContent = n < 2 ? `Select 2 or more (${n} picked).` : `${n} selected — they’ll play as one EP.`
}
function renderCombinePicker() {
  const list = $('edCombineList'); if (list == null) return
  list.innerHTML = ''
  const seen = new Set()
  const cols = store.active().filter(t => { if (seen.has(t.collectionId)) return false; seen.add(t.collectionId); return true })
  if (cols.length === 0) { list.innerHTML = '<li class="muted" style="font-size:12px">No collections in this wallet yet — mint or hold some singles first.</li>'; updateCombineHint(); return }
  for (const t of cols) {
    const li = document.createElement('li'); li.className = 'combine-row'
    const label = document.createElement('label'); label.className = 'check'
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'combine-pick'; cb.value = t.collectionId
    cb.onchange = updateCombineHint
    label.append(cb, document.createTextNode(' ' + (t.collectionName || short(t.collectionId))))
    const idSpan = document.createElement('span'); idSpan.className = 'muted'; idSpan.style.fontSize = '11px'; idSpan.textContent = short(t.collectionId)
    li.append(label, idSpan); list.append(li)
  }
  updateCombineHint()
}

async function noteToPropagate(t) {
  try { const p = await resolveSellerNote(provider, pubKeyHex, t.collectionId); if (p && noteHasContent(p)) return p } catch { }
  if (t.sellerNote || t.bonusValue) return { text: t.sellerNote ?? '', bonusKind: t.bonusKind, bonusValue: t.bonusValue }
  return undefined
}

async function pruneIfEditionSpent(t) {
  if (!t.lockHex) return false
  try {
    const spender = await provider.getSpendingTx(t.txId, t.outputIndex)
    if (spender == null) return false
    store.markSent(t.txId, t.outputIndex)
    renderTokens()
    return true
  } catch {
    return false
  }
}

async function onReplicate(t) {
  const k = requireKey(); if (k == null) return
  if (!t.lockHex) { setStatus('Missing edition script; cannot replicate.', 'error'); return }
  const name = t.collectionName ?? 'this edition'
  const bondNote = editionSupportsBurn(hexBytes(t.lockHex))
    ? 'a refundable bond for your copy (reclaim it by burning) + ' : ''
  setStatus('Preparing the replication…')
  try {
    const note = await noteToPropagate(t)
    const r = await replicateEdition(provider, k, {
      editionTxId: t.txId, editionOutputIndex: t.outputIndex, editionLockHex: t.lockHex, terms: termsFromToken(t),
      note,
      confirmSpend: total => confirm(
        `Replicate a copy of “${name}”?\n\n` +
        `This spends ${total.toLocaleString()} sats from your wallet (${bondNote}publisher ${t.publisherFeeSats ?? 0} + holder ${t.holderFeeSats ?? 0} fees + network fee).\n\nProceed?`),
    })
    store.markSent(t.txId, t.outputIndex)
    storeEdition({ txId: r.txId, outputIndex: 0, lockHex: t.lockHex },
      t.collectionId, t.collectionName ?? 'Edition', termsFromToken(t),
      t.sellerNote || t.bonusValue ? { text: t.sellerNote ?? '', bonusKind: t.bonusKind, bonusValue: t.bonusValue } : null)
    storeEdition({ txId: r.replicaOutpoint.txId, outputIndex: r.replicaOutpoint.outputIndex, lockHex: r.lockHex },
      t.collectionId, t.collectionName ?? 'Edition', termsFromToken(t), note)
    renderTokens()
    setStatus(`✅ Replicated. Tx ${short(r.txId)} — NFT returned to holder, replica minted, fees paid.`, 'ok')
  } catch (e) {
    const msg = (e).message
    if (msg === SPEND_CANCELLED) { setStatus('Replication cancelled — nothing was spent.'); return }
    if (/missing inputs|missingorspent/i.test(msg) && await pruneIfEditionSpent(t)) {
      setStatus('That edition had already been spent (moved or burned elsewhere) — removed it from your holdings.', 'ok'); return
    }
    setStatus(`Replicate failed: ${msg}`, 'error')
  }
}

async function onTransferEdition(t) {
  const k = requireKey(); if (k == null) return
  const recipient = val('sendPubKey')
  if (recipient.length !== 66 && recipient.length !== 130) {
    setStatus("Enter the recipient's public key (33- or 65-byte hex) above.", 'error'); return
  }
  if (!t.lockHex) { setStatus('Missing edition script; cannot transfer.', 'error'); return }
  setStatus('Transferring edition (owner-signed, re-creating covenant)…')
  try {
    const note = await noteToPropagate(t)
    const r = await transferEdition(provider, k, {
      editionTxId: t.txId, editionOutputIndex: t.outputIndex, editionLockHex: t.lockHex,
      newOwnerPubKey: hexBytes(recipient), note,
    })
    store.markSent(t.txId, t.outputIndex)
    renderTokens()
    setStatus(`✅ Transferred. Tx ${short(r.txId)} — covenant re-created for the new owner.`, 'ok')
  } catch (e) {
    const msg = (e).message
    if (/missing inputs|missingorspent/i.test(msg) && await pruneIfEditionSpent(t)) {
      setStatus('That edition had already been spent (moved or burned elsewhere) — removed it from your holdings.', 'ok'); return
    }
    setStatus(`Transfer failed: ${msg}`, 'error')
  }
}

let pendingListPartner = null

async function onOnboardPartner(t) {
  const k = requireKey(); if (k == null) return
  if (!t.lockHex) { setStatus('Missing edition script; cannot onboard.', 'error'); return }
  const name = t.collectionName ?? 'this collection'
  let partner
  if (pendingListPartner) {
    partner = pendingListPartner
    if (!confirm(`List “${name}” on listing wallet ${short(partner)}?\n\nThis sends one copy there; that wallet then holds and resells it, earning the reseller fee on each sale. You keep your other copies and your publisher fee.`)) return
  } else {
    partner = (prompt(
      `List “${name}” through a partner wallet.\n\n` +
      `Paste the PUBLIC KEY (66-hex) of the listing wallet — a curation site's, or your own cold listing wallet. ` +
      `You'll transfer THIS copy to it; that wallet then holds and resells the copy, collecting the reseller fee ` +
      `on every sale made through its link. (You keep your other copies.)`) ?? '').trim().toLowerCase()
    if (partner === '') return
    if (!/^0[23][0-9a-f]{64}$/.test(partner)) {
      setStatus('That isn’t a 33-byte compressed public key (66 hex, starting 02 or 03).', 'error'); return
    }
    if (!confirm(`Transfer one copy of “${name}” to ${short(partner)}? That wallet then holds and resells this copy.`)) return
  }
  setStatus('Onboarding partner (transferring a copy)…')
  try {
    const note = await noteToPropagate(t)
    const r = await transferEdition(provider, k, {
      editionTxId: t.txId, editionOutputIndex: t.outputIndex, editionLockHex: t.lockHex,
      newOwnerPubKey: hexBytes(partner), note,
    })
    store.markSent(t.txId, t.outputIndex)
    renderTokens()
    pendingListPartner = null
    const link = collectionShareUrl(t.collectionId, partner)
    setStatus(`✅ Partner onboarded. Tx ${short(r.txId)} — share their listing link.`, 'ok')
    showPartnerLinkModal(name, link, partner)
  } catch (e) {
    const msg = (e).message
    if (/missing inputs|missingorspent/i.test(msg) && await pruneIfEditionSpent(t)) {
      setStatus('That copy had already been spent (moved or burned elsewhere) — removed it from your holdings.', 'ok'); return
    }
    setStatus(`Onboarding failed: ${msg}`, 'error')
  }
}

function showPartnerLinkModal(name, link, partnerPubKey) {
  const overlay = document.createElement('div'); overlay.className = 'modal'
  overlay.innerHTML =
    '<div class="modal-box" style="max-width:520px">' +
    '<div class="modal-head"><span>🤝 Listing partner onboarded</span><button class="secondary pl-close">✕ Close</button></div>' +
    `<p class="muted" style="font-size:13px;margin:0 0 10px">A copy of “${escapeHtml(name)}” now sits in the wallet you entered — your <b>listing partner</b> (a curation site, or your own listing wallet). Share its link below: every buyer mints their own copy from it, so that wallet <b>collects the reseller fee</b> on each sale, while the <b>publisher fee</b> goes to the collection’s publisher. The copy isn’t used up — it keeps selling.</p>` +
    '<label>Partner listing link</label>' +
    `<div class="row" style="flex-wrap:nowrap;gap:6px"><input class="pl-link mono" readonly value="${escapeHtml(link)}" style="flex:1 1 auto;min-width:0" /><button class="secondary pl-copy">Copy</button><button class="secondary pl-qr">QR</button></div>` +
    `<p class="muted" style="font-size:11px;margin:10px 0 0">Partner key: <span class="mono">${escapeHtml(partnerPubKey)}</span></p>` +
    '</div>'
  const close = () => overlay.remove()
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })
  overlay.querySelector('.pl-close')?.addEventListener('click', close)
  overlay.querySelector('.pl-copy')?.addEventListener('click', () => void navigator.clipboard?.writeText(link))
  overlay.querySelector('.pl-qr')?.addEventListener('click', () => showQrModal('Partner listing link', link))
  document.body.append(overlay)
}

async function onBurn(t) {
  const k = requireKey(); if (k == null) return
  if (!t.lockHex) { setStatus('Missing edition script; cannot burn.', 'error'); return }
  if (!confirm(
    `Burn your edition of “${t.collectionName ?? 'this collection'}” and reclaim its ~${(t.tokenSats ?? EDITION_BOND_SATS).toLocaleString()}-sat bond ` +
    `(minus a small network fee) to your wallet?\n\n⚠ This DESTROYS the token permanently — it cannot be undone. Proceed?`)) return
  setStatus('Burning edition (reclaiming the bond)…')
  try {
    const r = await burnEdition(provider, k, { editionTxId: t.txId, editionOutputIndex: t.outputIndex, editionLockHex: t.lockHex })
    store.markSent(t.txId, t.outputIndex)
    renderTokens()
    setStatus(`🔥 Burned. Reclaimed ${r.reclaimSats.toLocaleString()} sats to your wallet. Tx ${short(r.txId)}.`, 'ok')
  } catch (e) {
    const msg = (e).message
    console.error(`[burn] failed for ${t.txId}:${t.outputIndex} —`, msg)
    if (/missing inputs|missingorspent/i.test(msg)) {
      const pruned = await pruneIfEditionSpent(t)
      setStatus(pruned
        ? 'This edition had already been spent (moved or burned elsewhere) — removed it from your holdings.'
        : 'Burn failed: this edition isn’t confirmed/propagated yet. Wait a few minutes, then try again.', pruned ? 'ok' : 'error')
    } else if (/raw TX fetch failed/i.test(msg)) {
      setStatus('Burn failed: this edition’s transaction isn’t on-chain yet. Wait for it to confirm (usually a few minutes), then try again.', 'error')
    } else {
      setStatus(`Burn failed: ${msg}`, 'error')
    }
  }
}

function downloadText(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function readFileText(input) {
  const f = input.files?.[0]
  return f ? f.text() : Promise.resolve(null)
}

function populateAirgapEditions() {
  const sel = document.getElementById('agEdition')
  if (sel == null) return
  const prev = sel.value
  const held = store.active().filter(t => t.kind === 'edition' && t.lockHex)
  sel.innerHTML = held.length === 0
    ? '<option value="">(no editions held)</option>'
    : held.map(t => `<option value="${t.txId}:${t.outputIndex}">${escapeHtml(t.collectionName ?? 'Edition')} · ${short(t.txId, 6)}:${t.outputIndex}</option>`).join('')
  if (held.some(t => `${t.txId}:${t.outputIndex}` === prev)) sel.value = prev
}

function syncAirgapAction() {
  const action = (document.querySelector('input[name="agAction"]:checked'))?.value
  const row = document.getElementById('agRecipientRow')
  if (row != null) row.style.display = action === 'burn' ? 'none' : ''
}

async function onAirgapExport() {
  const t = store.active().find(x => `${x.txId}:${x.outputIndex}` === val('agEdition'))
  if (t == null || !t.lockHex) { setStatus('Select an edition to export.', 'error'); return }
  const action = ((document.querySelector('input[name="agAction"]:checked'))?.value ?? 'transfer')
  const recipient = val('agRecipient')
  if (action === 'transfer' && recipient.length !== 66 && recipient.length !== 130) {
    setStatus("Enter the recipient's public key (33- or 65-byte hex) to export a transfer.", 'error'); return
  }
  setStatus('Gathering inputs for the offline signer…')
  try {
    const sourceTx = await provider.getSourceTransaction(t.txId)
    const bond = sourceTx.outputs[t.outputIndex]?.value ?? PHARLAP_OUTPUT_SATS
    const edition = { txId: t.txId, outputIndex: t.outputIndex, satoshis: bond, lockBytes: hexBytes(t.lockHex), sourceTx }
    const name = t.collectionName ?? 'edition'
    let req
    if (action === 'burn') {
      req = buildAirgapRequest('burn', edition, {
        summary: `Burn edition of “${name}” (${short(t.txId, 6)}:${t.outputIndex}); reclaim ~${bond.toLocaleString()} sats to the signer's wallet.`,
      })
    } else {
      const note = await noteToPropagate(t)
      const noteSats = note ? PHARLAP_OUTPUT_SATS : 0
      const estFee = Math.ceil((1500 * DEFAULT_FEE_PER_KB) / 1000)
      const selected = selectFunding(await getSafeUtxos(provider), noteSats + estFee + 1000)
      const funding = await Promise.all(selected.map(async u => ({ utxo: u, sourceTx: await provider.getSourceTransaction(u.txId) })))
      req = buildAirgapRequest('transfer', edition, {
        newOwnerPubKeyHex: recipient, note, funding,
        summary: `Transfer edition of “${name}” (${short(t.txId, 6)}:${t.outputIndex}) to ${short(recipient, 8)}; ${bond.toLocaleString()}-sat bond rides forward.`,
      })
    }
    downloadText(`smartnfts-${action}-${t.txId.slice(0, 8)}.airgap-request.json`, encodeAirgapRequest(req), 'application/json')
    setStatus(`✅ Exported ${action} request. Move the file to your offline machine and sign it there (step 2).`, 'ok')
  } catch (e) {
    setStatus(`Export failed: ${(e).message}`, 'error')
  }
}

let pendingSignReq = null
async function onAirgapSignFile() {
  pendingSignReq = null
  const sumEl = $('agSignSummary'); const btn = $('btnAgSign')
  const txt = await readFileText($('agSignFile'))
  if (txt == null) { sumEl.textContent = ''; btn.disabled = true; return }
  try {
    const req = decodeAirgapRequest(txt)
    pendingSignReq = req
    sumEl.textContent = `${req.action.toUpperCase()} — ${req.summary ?? '(no summary in request)'}`
    sumEl.style.color = ''
    btn.disabled = false
  } catch (e) {
    sumEl.textContent = `⚠ Not a valid request: ${(e).message}`
    sumEl.style.color = 'var(--err, #f85149)'
    btn.disabled = true
  }
}
async function onAirgapSign() {
  const k = requireKey(); if (k == null) return
  if (pendingSignReq == null) { setStatus('Import a request file first.', 'error'); return }
  setStatus('Signing offline…')
  try {
    const { txId, rawTx } = await signAirgapRequest(pendingSignReq, k)
    downloadText(`smartnfts-signed-${txId.slice(0, 8)}.txt`, rawTx)
    setStatusHtml(`✅ Signed (tx ${idChip(txId)}). Move the signed file to your online machine and broadcast it (step 3).`, 'ok')
  } catch (e) {
    setStatus(`Sign failed: ${(e).message}`, 'error')
  }
}

let cosignRaw = null
let cosignSources = []
let cosignSigned = null

async function onCosignRead() {
  cosignRaw = null; cosignSigned = null; cosignSources = []
  ;($('btnCsSign')).disabled = true
  ;($('btnCsBroadcast')).disabled = true
  const rep = $('csReport'); rep.innerHTML = ''

  let hex = val('csHex')
  if (hex.length === 0) hex = ((await readFileText($('csFile'))) ?? '').trim()
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 20) { setStatus('Paste or import an unsigned transaction first.', 'error'); return }

  setStatus('Reading the transaction and fetching its inputs…')
  try {
    const tx = Tx.parse(hex)
    const ids = [...new Set(tx.inputs.map((i) => wireToTxid(i.txid)))]
    const sources = []
    for (const id of ids) {
      try { sources.push({ txId: id, sourceTxHex: (await provider.getSourceTransaction(id)).hex() }) }
      catch { }
    }
    cosignRaw = hex; cosignSources = sources
    const a = analyseCosign(hex, sources, address)
    renderCosign(a)
    if (a.blockers.length === 0 && !isWatchOnly()) ($('btnCsSign')).disabled = false
    setStatus(a.blockers.length > 0 ? 'This transaction cannot be signed here — see below.' : 'Read it. Check the figures below before signing.',
      a.blockers.length > 0 ? 'error' : 'ok')
  } catch (e) {
    setStatus(`Could not read that transaction: ${(e).message}`, 'error')
  }
}

function renderCosign(a) {
  const sat = (n) => `${n.toLocaleString()} sat`
  const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const rows = []

  rows.push(`<div style="margin-bottom:8px"><b>Signing this would cost you ${sat(a.youPay)}</b>` +
    ` <span class="muted">(${sat(a.youSpend)} in, ${sat(a.youReceive)} back)</span></div>`)
  rows.push(`<div class="muted">fee ${sat(a.fee)} · ${a.feePerKb.toLocaleString()} sat/KB · ${a.signedSize.toLocaleString()} bytes signed</div>`)

  rows.push('<div style="margin-top:8px"><b>Inputs</b></div>')
  for (const i of a.inputs) {
    const who = i.mine ? '<b>yours</b>' : i.complete ? 'already signed by someone else' : 'not yours, not signed'
    const v = i.satoshis == null ? '<span style="color:var(--err,#f85149)">value unknown</span>' : sat(i.satoshis)
    rows.push(`<div class="muted">#${i.index + 1} ${v} — ${who}${a.toSign.includes(i.index) ? ' → <b>will be signed</b>' : ''}</div>`)
  }

  rows.push('<div style="margin-top:8px"><b>Outputs</b></div>')
  for (const o of a.outputs) {
    let what
    if (o.kind === 'yours') what = '<b>back to you</b>'
    else if (o.kind === 'address') what = `to ${esc(o.address ?? '?')}`
    else if (o.kind === 'data') what = `data · <span style="opacity:.85">${esc(o.text ?? '')}</span>`
    else what = `a script this wallet cannot name (${o.scriptSize} bytes)`
    rows.push(`<div class="muted">#${o.index + 1} ${sat(o.satoshis)} — ${what}</div>`)
  }

  for (const w of a.warnings) rows.push(`<div style="margin-top:6px;color:#d29922">⚠ ${esc(w)}</div>`)
  for (const b of a.blockers) rows.push(`<div style="margin-top:6px;color:var(--err,#f85149)"><b>Refusing:</b> ${esc(b)}</div>`)
  $('csReport').innerHTML = rows.join('')
}

async function onCosignSign() {
  const k = requireKey(); if (k == null) return
  if (cosignRaw == null) { setStatus('Read a transaction first.', 'error'); return }
  setStatus('Signing your inputs…')
  try {
    const { txId, rawTx } = await cosignTransaction(cosignRaw, cosignSources, k)
    cosignSigned = rawTx
    ;($('csHex')).value = rawTx
    ;($('btnCsBroadcast')).disabled = false
    downloadText(`cosigned-${txId.slice(0, 8)}.txt`, rawTx)
    setStatusHtml(`✅ Signed (tx ${idChip(txId)}). Broadcast it here, or send the downloaded file wherever it needs to go.`, 'ok')
  } catch (e) {
    setStatus(`Sign failed: ${(e).message}`, 'error')
  }
}

async function onCosignBroadcast() {
  if (cosignSigned == null) { setStatus('Sign the transaction first.', 'error'); return }
  setStatus('Broadcasting…')
  try {
    const txId = await provider.broadcast(cosignSigned)
    setStatusHtml(`✅ Broadcast. Tx ${idChip(txId)}.`, 'ok')
  } catch (e) {
    setStatus(`Broadcast failed: ${(e).message}`, 'error')
  }
}

async function onAirgapBroadcast() {
  let hex = val('agBcHex')
  if (hex.length === 0) hex = ((await readFileText($('agBcFile'))) ?? '').trim()
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 20) { setStatus('Import or paste the signed raw-tx hex first.', 'error'); return }
  setStatus('Broadcasting signed transaction…')
  try {
    const txId = await provider.broadcast(hex)
    ;($('agBcHex')).value = ''
    setStatusHtml(`✅ Broadcast. Tx ${idChip(txId)}. Refresh balance / check holdings to see it settle.`, 'ok')
  } catch (e) {
    setStatus(`Broadcast failed: ${(e).message}`, 'error')
  }
}

function readSendBsvForm() {
  const toAddress = val('sendBsvAddr')
  const sendMax = ($('sendBsvMax')).checked
  try { assertValidAddress(toAddress) } catch { setStatus('Enter a valid recipient BSV address.', 'error'); return null }
  const amountSats = sendMax ? 0 : Math.floor(Number(val('sendBsvAmount')))
  if (!sendMax && (!Number.isFinite(amountSats) || amountSats < 1)) {
    setStatus('Enter an amount of at least 1 sat (or tick “Send max”).', 'error'); return null
  }
  return { toAddress, amountSats, sendMax }
}

async function onSendBsv() {
  const k = requireKey(); if (k == null) return
  const form = readSendBsvForm()
  if (form == null) return
  if (!confirm(`Send ${form.sendMax ? 'your entire spendable balance' : `${form.amountSats.toLocaleString()} sats`} to\n${form.toAddress}?\n\n(Minus the network fee. Change returns to this wallet.)`)) return
  setStatus('Sending BSV…')
  try {
    const r = await sendPayment(provider, k, form)
    ;($('sendBsvAddr')).value = ''
    ;($('sendBsvAmount')).value = ''
    ;($('sendBsvMax')).checked = false
    setStatus(`✅ Sent ${r.sentSats.toLocaleString()} sats. Tx ${short(r.txId)}.`, 'ok')
    void refreshBalance()
  } catch (e) {
    setStatus(`Send failed: ${(e).message}`, 'error')
  }
}

async function onSendBsvExport() {
  const form = readSendBsvForm()
  if (form == null) return
  setStatus('Gathering funds for the offline signer…')
  try {
    const funding = await gatherPaymentFunding(provider, form)
    if (funding.length === 0) { setStatus('No spendable funds to send.', 'error'); return }
    const dry = await buildPaymentTx({ key: Signer.fromPrivateKey(crypto.getRandomValues(new Uint8Array(32))), funding, ...form })
    const req = buildAirgapPaymentRequest({
      ...form, funding: await Promise.all(funding.map(async f => ({ ...f, sourceTx: await provider.getSourceTransaction(f.utxo.txId) }))),
      summary: `Send ${dry.sentSats.toLocaleString()} sats to ${form.toAddress}${form.sendMax ? ' (entire balance, minus fee)' : ''}.`,
    })
    downloadText(`smartnfts-payment-${dry.txId.slice(0, 8)}.airgap-request.json`, encodeAirgapRequest(req), 'application/json')
    setStatus(`✅ Exported payment request (${dry.sentSats.toLocaleString()} sats). Sign it on your offline machine (step 2 in Advanced), then broadcast (step 3).`, 'ok')
  } catch (e) {
    setStatus(`Export failed: ${(e).message}`, 'error')
  }
}

async function onSend(txId, outputIndex) {
  const k = requireKey(); if (k == null) return
  const recipient = val('sendPubKey')
  if (recipient.length !== 66 && recipient.length !== 130) {
    setStatus("Enter the recipient's public key (33- or 65-byte hex).", 'error'); return
  }
  setStatus('Sending NFT…')
  try {
    const result = await createTransfer(provider, k, { tokenTxId: txId, tokenOutputIndex: outputIndex, recipientPubKeyHex: recipient })
    store.markSent(txId, outputIndex)
    renderTokens()
    setStatus(`Sent. Transfer tx ${short(result.txId)} (recipient notified at output ${result.notifyVout}).`, 'ok')
  } catch (e) {
    setStatus(`Send failed: ${(e).message}`, 'error')
  }
}

async function onSendMessage() {
  const k = requireKey(); if (k == null) return
  const to = val('msgTo')
  if (to.length !== 66 && to.length !== 130) {
    setStatus("Enter the recipient's public key (33- or 65-byte hex).", 'error'); return
  }
  const text = ($('msgText')).value
  const encrypt = ($('msgEncrypt')).checked
  const file = await readFile($('msgFile'))
  const parts = []
  if (text.trim()) parts.push({ kind: 'text', text })
  if (file) parts.push({ kind: 'file', mimeType: file.mimeType, fileName: file.fileName, bytes: file.bytes })
  if (parts.length === 0) { setStatus('Write a message or attach a file first.', 'error'); return }
  setStatus(`Sending ${encrypt ? 'encrypted' : 'public'} message…`)
  try {
    const r = await sendMessage(provider, k, { toPubKeyHex: to, parts, encrypt, senderAlias: getMyAlias() })
    ;($('msgText')).value = ''
    setStatus(`Message sent. Tx ${short(r.txId)}.`, 'ok')
  } catch (e) {
    setStatus(`Send message failed: ${(e).message}`, 'error')
  }
}

async function onPublishProfile() {
  const k = requireKey(); if (k == null) return
  const alias = getMyAlias()
  const file = await readFile($('profileAvatar'))
  let avatar
  if (file != null) {
    if (!file.mimeType.startsWith('image/')) { setStatus('Avatar must be an image.', 'error'); return }
    const small = await downscaleToAvatar(file.bytes, file.mimeType)
    if (small == null) { setStatus('Could not process that image (need a browser that encodes WebP).', 'error'); return }
    avatar = small
  }
  if (alias === '' && avatar == null) { setStatus('Set an alias (above) or choose an avatar image first.', 'error'); return }
  if (!confirm(
    `Publish your profile on-chain${avatar ? ` (a ${kb(avatar.bytes.length)} avatar)` : ''}${alias ? ` as @${alias}` : ''}?\n\n` +
    `It's posted to your own address and spends a small network fee. Proceed?`)) return
  setStatus('Publishing your profile…')
  try {
    const txId = await publishProfile(provider, k, { alias: alias || undefined, avatar })
    if (avatar != null) { setAvatar(myPubKeyLc(), bytesToDataUrl(avatar.mimeType, avatar.bytes)); renderWallet() }
    ;($('profileAvatar')).value = ''
    setStatusHtml(`✅ Profile published. Tx ${idChip(txId)} — others now resolve your @name + avatar by your key.`, 'ok')
  } catch (e) {
    setStatus(`Publish profile failed: ${(e).message}`, 'error')
  }
}

async function onCheckMessages() {
  const k = requireKey(); if (k == null) return
  setStatus('Checking for messages…')
  try {
    const msgs = await scanIncomingMessages(provider, k, markerTxIds(markerBackup))
    applyLatestAliases(msgs.map(m => ({ pk: m.senderPubKeyHex, alias: m.senderAlias })))
    renderInbox(msgs)
    resolveAvatarsThen(msgs.map(m => m.senderPubKeyHex), () => renderInbox(lastInbox))
    setStatus(`Inbox: ${msgs.length} message(s).`, 'ok')
  } catch (e) {
    setStatus(`Check messages failed: ${(e).message}`, 'error')
  }
}

function renderInbox(msgs) {
  lastInbox = msgs
  const host = $('inbox')
  if (msgs.length === 0) { host.innerHTML = '<p class="muted">No messages found.</p>'; return }
  host.innerHTML = ''
  for (const m of msgs) {
    const card = document.createElement('div')
    card.className = 'token msg'
    const textPart = m.parts.find(p => p.kind === 'text')
    const hasKey = m.parts.some(p => p.kind === 'key')
    const filePart = m.parts.find(p => p.kind === 'file')
    card.innerHTML = `
      <div class="mono">from ${nameChip(m.senderPubKeyHex, { save: true })} ${m.encrypted ? '🔒 encrypted' : '🌐 public'}</div>
      ${m.sentAt ? `<div class="muted" style="font-size:11px" title="Sender's clock (self-asserted)">🕒 ${escapeHtml(fmtTime(m.sentAt))}${m.height ? '' : ' · pending'}</div>` : (m.height ? '' : '<div class="muted" style="font-size:11px">pending</div>')}
      ${textPart && textPart.kind === 'text' ? `<div class="state">${escapeHtml(textPart.text)}</div>` : ''}
      ${hasKey ? '<div class="muted" style="font-size:12px">🔑 carries a content key</div>' : ''}
    `
    const actions = document.createElement('div')
    actions.className = 'actions'
    const reply = document.createElement('button')
    reply.textContent = '↩ Reply'
    reply.className = 'secondary'
    reply.onclick = () => onReply(m)
    actions.append(reply)
    if (filePart && filePart.kind === 'file') {
      const btn = document.createElement('button')
      btn.textContent = `View ${filePart.fileName}`
      btn.className = 'secondary'
      btn.onclick = () => showFile('Message attachment', { mimeType: filePart.mimeType, fileName: filePart.fileName, fileBytes: filePart.bytes }, true)
      actions.append(btn)
    }
    card.append(actions)
    host.append(card)
  }
}

function onReply(m) {
  ;($('msgTo')).value = m.senderPubKeyHex
  ;($('msgEncrypt')).checked = m.encrypted
  updateMsgToName()
  $('msgTo').scrollIntoView({ behavior: 'smooth', block: 'start' })
  ;($('msgText')).focus()
  const who = displayName(m.senderPubKeyHex)
  setStatus(`Replying to ${who.name}.`)
}

const nameCache = new Map()
const latestBroadcast = new Map()
async function resolveCollectionName(tx1RefHex) {
  const cached = nameCache.get(tx1RefHex)
  if (cached != null) return cached
  let name = 'Edition'
  try {
    const tx1 = await provider.getSourceTransaction(tx1RefHex)
    for (const o of tx1.outputs) {
      const t = parseTemplateScript(LockingScript.fromBinary(o.script))
      if (t && t.fields.tokenName) { name = t.fields.tokenName; break }
    }
  } catch { }
  nameCache.set(tx1RefHex, name)
  return name
}

function backupTxIdsNotHeld() {
  const held = new Set(store.list().map(t => `${t.txId}:${t.outputIndex}`))
  return markerBackup.markers.filter(m => m.carries.some(c => !held.has(`${m.txId}:${c.outputIndex}`))).map(m => m.txId)
}

function heldEditionScripts() {
  const scripts = new Map()
  for (const t of store.list()) if (t.kind === 'edition' && t.lockHex) scripts.set(t.lockHex, t.collectionId)
  return scripts
}

async function onCheckIncoming(opts = {}) {
  const localFirst = !opts.full && markerBackup.address === address && markerBackup.readToHeight > 0
  const since = localFirst ? markerBackup.readToHeight - 1 : -1
  setStatus(localFirst ? `Checking for anything new since block ${markerBackup.readToHeight.toLocaleString()}…`
    : 'Reading your wallet\'s whole history for your NFTs and editions…')
  let added = 0
  let edAdded = 0
  const errors = []
  for (const t of store.list()) if (t.collectionName && t.collectionName !== 'Edition' && !nameCache.has(t.collectionId)) nameCache.set(t.collectionId, t.collectionName)
  const extra = localFirst ? backupTxIdsNotHeld() : markerTxIds(markerBackup)

  try {
    const incoming = await scanIncoming(provider, pubKeyHex, extra, localFirst ? { sinceHeight: since } : {})
    for (const t of incoming) {
      const tx = await provider.getSourceTransaction(t.txId)
      const v = await verifyTokenLineage(tx, t.outputIndex, { getRawTransaction: id => provider.getSourceTransaction(id) })
      if (!v.valid) continue
      if (store.add({ txId: t.txId, outputIndex: t.outputIndex, collectionId: t.fields.tx1Ref, stateData: t.fields.stateData, heightHint: t.height })) added++
      else if (t.height) store.setHeightHint(t.txId, t.outputIndex, t.height)
    }
  } catch (e) { errors.push(`tokens: ${(e).message}`) }

  try {
    const editions = await scanIncomingEditions(provider, pubKeyHex,
      localFirst ? { scripts: heldEditionScripts(), sinceHeight: since } : undefined, extra)
    for (const e of editions) {
      const name = await resolveCollectionName(e.tx1RefHex)
      if (store.add({
        txId: e.txId, outputIndex: e.outputIndex, collectionId: e.tx1RefHex, stateData: '', collectionName: name,
        kind: 'edition', lockHex: e.lockHex, publisherPubKeyHashHex: hexOf(e.terms.publisherPubKeyHash),
        publisherFeeSats: e.terms.publisherFeeSats, holderFeeSats: e.terms.holderFeeSats,
        ...(e.sellerNote?.text ? { sellerNote: e.sellerNote.text } : {}),
        ...(e.sellerNote?.bonusValue ? { bonusKind: e.sellerNote.bonusKind, bonusValue: e.sellerNote.bonusValue } : {}),
        ...(e.height ? { heightHint: e.height } : {}),
      })) edAdded++
      else {
        if (store.reactivate(e.txId, e.outputIndex)) edAdded++
        store.setCollectionName(e.txId, e.outputIndex, name)
        if (e.height) store.setHeightHint(e.txId, e.outputIndex, e.height)
      }
    }
  } catch (e) { errors.push(`editions: ${(e).message}`) }

  renderTokens()
  if (errors.length > 0 && added === 0 && edAdded === 0) {
    setStatus(`Scan failed — ${errors.join('; ')}`, 'error')
  } else {
    setStatus(`Scan complete: ${added} NFT(s) + ${edAdded} edition(s) new.${errors.length ? ' (' + errors.join('; ') + ')' : ''}`, 'ok')
  }
}

const MARKERS_KEY_PREFIX = 'p2:markers:'
let markerBackup = emptyMarkerBackup('')
let markerRefreshRunning = false
let markerChecks = 0

function loadMarkerBackup(addr) {
  try {
    const raw = localStorage.getItem(MARKERS_KEY_PREFIX + addr)
    if (raw != null) { const b = parseMarkerBackup(raw); if (b.address === addr) return b }
  } catch { }
  return emptyMarkerBackup(addr)
}

function withTokenList(b) {
  return b.address === address ? { ...b, tokens: store.list().filter(t => t.status === 'active') } : b
}

function forFile(b) {
  const file = withTokenList(b)
  const cards = {}
  for (const t of file.tokens) {
    const id = t.collectionId
    if (cards[id] != null) continue
    const mime = cachedMime(id)
    if (mime === undefined || !thumbResolved(id)) continue
    cards[id] = { mime, thumb: cachedThumb(id) }
  }
  return { ...file, cards }
}

function applyCards(cards) {
  for (const [id, c] of Object.entries(cards ?? {})) {
    if (cachedMime(id) === undefined) cacheMime(id, c.mime)
    if (!thumbResolved(id) && (c.thumb == null || !cacheThumbUrl(id, c.thumb))) cacheNoThumb(id)
  }
}

function saveMarkerBackup(b) {
  const { cards: _cards, ...local } = withTokenList(b)
  try { localStorage.setItem(MARKERS_KEY_PREFIX + b.address, JSON.stringify(local)) } catch { }
}

function updateMarkerNote(text) {
  const el = document.getElementById('tokBackupNote'); if (el == null) return
  if (text != null) { el.textContent = text; return }
  const n = markerBackup.markers.length
  const proved = markerBackup.markers.filter(m => m.proof != null).length
  const upTo = markerBackup.readToHeight > 0 ? `, read to block ${markerBackup.readToHeight.toLocaleString()}` : ''
  const busy = markerRefreshRunning || markerChecks > 0 ? ' Checking for newer transactions…' : ''
  el.textContent = `${n} transaction${n === 1 ? '' : 's'} recorded (${proved} with a Merkle proof)${upTo}.${busy}`
}

async function refreshMarkerBackup() {
  if (markerRefreshRunning) return
  markerRefreshRunning = true
  const forAddress = address
  updateMarkerNote()
  let failed
  try {
    const prev = markerBackup.address === forAddress ? markerBackup : loadMarkerBackup(forAddress)
    const { backup } = await updateMarkerBackup(provider, forAddress, pubKeyHex, prev)
    const current = markerBackup.address === forAddress ? markerBackup : loadMarkerBackup(forAddress)
    const joined = mergeMarkerBackups(current, backup)
    if (address === forAddress) markerBackup = joined
    saveMarkerBackup(joined)
  } catch (e) {
    failed = `Could not update (${(e).message}); the saved record is unchanged.`
  } finally {
    markerRefreshRunning = false
    if (address === forAddress) updateMarkerNote(failed)
    else void refreshMarkerBackup()
  }
}

let restoreChoicePending = false

function showRestoreChoice(on) {
  restoreChoicePending = on
  $('restoreChoice').style.display = on ? '' : 'none'
}

function restoreTokens() {
  if (markerBackup.markers.length > 0 || markerBackup.tokens.length > 0) { void applyBackup(markerBackup, 'this browser'); return }
  showRestoreChoice(true)
}

async function applyBackup(b, from) {
  showRestoreChoice(false)
  provider.seedTransactions(heldTransactions(b))
  applyCards(b.cards)
  let n = 0
  for (const t of b.tokens) if (t.status === 'active' && store.add(t)) n++
  renderTokens()
  setStatus(`Restored ${n} token${n === 1 ? '' : 's'} from ${from}. Checking for anything newer…`)
  await checkForNewer()
}

async function rescanWalletHistory() {
  await checkForNewer({ full: true })
}

async function checkForNewer(opts = {}) {
  markerChecks++
  updateMarkerNote()
  try { await onCheckIncoming(opts) } finally { markerChecks-- }
  void refreshMarkerBackup()
}

function onTokenBackupSave() {
  if (markerBackup.address !== address) markerBackup = loadMarkerBackup(address)
  const file = forFile(markerBackup)
  downloadText(markerBackupFileName(address, getMyAlias()), JSON.stringify(file, null, 1), 'application/json')
  setStatus(`Saved a token backup: ${file.tokens.length} tokens, ${file.markers.length} transactions and ${Object.keys(file.cards ?? {}).length} collections' card data. It holds no keys.`, 'ok')
}

async function onTokenBackupRestore() {
  const text = await readFileText($('tokBackupFile'))
  if (text == null) { setStatus('Choose a token backup file first.', 'error'); return }
  try {
    const file = parseMarkerBackup(text)
    const here = markerBackup.address === address ? markerBackup : loadMarkerBackup(address)
    markerBackup = mergeMarkerBackups(here, file)
    saveMarkerBackup(markerBackup)
    await applyBackup(markerBackup, 'the backup file')
  } catch (e) {
    setStatus(`Restore failed: ${(e).message}`, 'error')
  }
}

async function onVerify(txId, outputIndex) {
  setStatus('Verifying NFT lineage…')
  try {
    const tx = await provider.getSourceTransaction(txId)
    const out = tx.outputs[outputIndex]
    if (out != null && parseEditionScript(LockingScript.fromBinary(out.script)) != null) {
      setStatus('Verifying edition against its collection…')
      const r = await verifyEditionCovenant(tx, outputIndex, { getRawTransaction: id => provider.getSourceTransaction(id) })
      if (!r.valid) { setStatus(`❌ ${r.reason}${r.collectionName ? ` — “${r.collectionName}”` : ''}`, 'error'); return }
      const econ = `fees ${r.publisherFeeSats}/${r.holderFeeSats} sats`
      let anchor = `TX1 ${short(r.collectionId ?? '')}`
      try {
        const conf = await provider.getTxConfirmation(r.collectionId ?? '')
        anchor += conf != null ? ` · anchored at block ${conf.blockHeight.toLocaleString()} (${fmtUtc(conf.time * 1000)})` : ' · pending confirmation'
      } catch { }
      setStatus(`✅ ${r.reason}${r.collectionName ? ` — “${r.collectionName}”` : ''} · ${econ} (verified against ${anchor}).`, 'ok')
      return
    }
    const deps = { getRawTransaction: (id) => provider.getSourceTransaction(id) }
    const v = await verifyTokenLineage(tx, outputIndex, deps)
    let name = ''
    try {
      const tx1 = await provider.getSourceTransaction(v.collectionId ?? '')
      for (const o of tx1.outputs) { const tmpl = parseTemplateScript(LockingScript.fromBinary(o.script)); if (tmpl) { name = tmpl.fields.tokenName; break } }
    } catch { }
    setStatus(`${v.valid ? '✅' : '❌'} ${v.reason}${name ? ` — collection "${name}"` : ''}`, v.valid ? 'ok' : 'error')
  } catch (e) {
    setStatus(`Verify failed: ${(e).message}`, 'error')
  }
}

let viewerUrl = null

const CONTENT_DB = 'pharlap2-content', CONTENT_STORE = 'content'
let contentDbPromise = null
function openContentDb() {
  if (contentDbPromise != null) return contentDbPromise
  contentDbPromise = new Promise(resolve => {
    try {
      const req = indexedDB.open(CONTENT_DB, 1)
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(CONTENT_STORE)) db.createObjectStore(CONTENT_STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
  return contentDbPromise
}
async function cachedContentGet(key) {
  const db = await openContentDb(); if (db == null) return null
  return new Promise(resolve => {
    try {
      const req = db.transaction(CONTENT_STORE, 'readonly').objectStore(CONTENT_STORE).get(key)
      req.onsuccess = () => resolve((req.result) ?? null)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}
async function cachedContentPut(key, value) {
  const db = await openContentDb(); if (db == null) return
  return new Promise(resolve => {
    try {
      const tx = db.transaction(CONTENT_STORE, 'readwrite')
      tx.objectStore(CONTENT_STORE).put(value, key)
      tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); tx.onabort = () => resolve()
    } catch { resolve() }
  })
}

async function fetchCollectionContent(collectionId, memberName) {
  const content = await fetchCollectionRaw(collectionId)
  if (content == null || memberName == null || memberName === '') return content
  const set = parseBmcSet(content.bytes)
  if (set == null) return content
  const mem = bmcMember(set, memberName)
  if (mem == null) return content
  return { mimeType: mem.mimeType, fileName: mem.file, bytes: mem.bytes, verified: content.verified, msg: `📦 BMC set member “${mem.name}”` }
}
async function fetchCollectionRaw(collectionId) {
  const hit = await cachedContentGet(collectionId)
  if (hit != null) return { mimeType: hit.mimeType, fileName: hit.fileName, bytes: Array.from(hit.bytes), verified: hit.verified, msg: hit.msg }
  const tx1 = await provider.getSourceTransaction(collectionId)
  let file = null
  let template
  for (const o of tx1.outputs) {
    const f = parseFileScript(LockingScript.fromBinary(o.script)); if (f) file = f.fields
    const t = parseTemplateScript(LockingScript.fromBinary(o.script)); if (t) template = t.fields
  }
  if (!file) {
    for (const o of tx1.outputs) {
      const leg = parseLegacyFileScript(LockingScript.fromBinary(o.script))
      if (leg == null) continue
      const bytes = leg.fields.fileBytes
      const msg = `📜 Legacy ${leg.marker} — original on-chain provenance mint (plaintext, unencrypted)`
      void cachedContentPut(collectionId, { mimeType: leg.fields.mimeType, fileName: leg.fields.fileName, bytes: new Uint8Array(bytes), verified: true, msg })
      return { mimeType: leg.fields.mimeType, fileName: leg.fields.fileName, bytes, verified: true, msg }
    }
    return null
  }
  const rules = template != null ? decodeTokenRules(template.tokenRules) : null
  const encrypted = rules?.isEncrypted ?? false
  const ciphertextOk = encrypted && template?.fileHash === hexOf(sha256Bytes(file.fileBytes))
  let bytes = file.fileBytes
  if (encrypted) {
    if (template?.wrappedKey == null || template?.keySalt == null) throw new Error('encrypted collection is missing its wrapped key')
    const K = await unwrapContentKey(template.wrappedKey, template.keySalt)
    if (K == null) throw new Error('could not unwrap the content key')
    bytes = await decryptContent(bytes, K)
  }
  if (rules?.isCompressed) bytes = await decompress(bytes)
  const verified = encrypted ? ciphertextOk : (template?.fileHash === hexOf(sha256Bytes(bytes)))
  const msg = encrypted
    ? (verified ? '🔓 Decrypted — ciphertext matches the on-chain commitment ✓' : '⚠ Decrypted, but the ciphertext hash does NOT match the collection!')
    : (verified ? '✓ Verified exact replica — SHA-256 of the content matches the on-chain commitment (timestamped on mint)' : '⚠ File loaded, but its hash does NOT match the on-chain commitment!')
  if (verified) void cachedContentPut(collectionId, { mimeType: file.mimeType, fileName: file.fileName, bytes: new Uint8Array(bytes), verified, msg })
  return { mimeType: file.mimeType, fileName: file.fileName, bytes, verified, msg }
}

async function viewBmf(collectionId, name, manifest) {
  const bmf = parseBmf(manifest.bytes)
  if (bmf == null) { setStatus('This release is a Block Media manifest, but it is unreadable.', 'error'); return }
  const distinctTx = new Set(bmf.scenes.filter(s => s.tx != null).map(s => s.tx)).size + (bmf.audio?.tx != null ? 1 : 0)
  setStatus(`Resolving ${distinctTx} on-chain component${distinctTx === 1 ? '' : 's'} for the video…`)
  const tracks = []
  let missing = 0
  let audioName = bmf.audio?.name ?? ''
  if (bmf.audio?.tx != null) {
    let d = null
    try { d = await fetchCollectionContent(bmf.audio.tx) } catch { d = null }
    if (d != null) { audioName = bmf.audio.name || d.fileName; tracks.push({ name: audioName, mimeType: d.mimeType, bytes: d.bytes }) }
    else missing++
  }
  const refKey = (s) => `${s.tx ?? ''}::${s.name ?? ''}`
  const nameForRef = new Map()
  for (const s of bmf.scenes) {
    if (s.tx == null) continue
    const key = refKey(s)
    if (nameForRef.has(key)) continue
    let d = null
    try { d = await fetchCollectionContent(s.tx, s.name) } catch { d = null }
    if (d == null) { missing++; nameForRef.set(key, ''); continue }
    const nm = s.name || d.fileName || `scene-${nameForRef.size + 1}.webp`
    tracks.push({ name: nm, mimeType: d.mimeType || 'image/webp', bytes: d.bytes })
    nameForRef.set(key, nm)
  }
  const cueLines = []
  if (audioName) cueLines.push(`# audio: ${audioName}`)
  for (const s of bmf.scenes) {
    const nm = s.tx != null ? nameForRef.get(refKey(s)) : s.name
    if (nm) cueLines.push(`[${fmtLrcTime(s.t)}]${nm}`)
  }
  tracks.push({ name: 'video.cue', mimeType: 'text/plain', bytes: Array.from(new TextEncoder().encode(cueLines.join('\n') + '\n')) })
  if (tracks.every(t => /\.(cue|lrc)$/i.test(t.name))) { setStatus('None of the video’s components could be resolved on-chain.', 'error'); return }
  let epCover = null
  try { epCover = (await loadCollection(collectionId)).cover } catch { }
  const lic = bmf.license != null ? `${bmf.license}${bmf.attribution ? ` — attribute ${bmf.attribution}` : ''}` : ''
  const msg = (missing === 0
    ? `✓ Block Media video resolved — ${nameForRef.size} scene component${nameForRef.size === 1 ? '' : 's'}${audioName ? ' + audio' : ''} fetched from chain and sequenced`
    : `⚠ Block Media video: ${missing} component${missing === 1 ? '' : 's'} unavailable on-chain (played without them)`)
    + (lic ? ` · Reuse: ${lic}` : '')
  const subtitle = `Block Media video · ${bmf.scenes.length} cues${lic ? ` · ${lic}` : ''}`
  showAlbumTracks(name, tracks, missing === 0 && manifest.verified, msg, subtitle, epCover)
  setStatus(msg, missing === 0 ? 'ok' : 'error')
}

async function onView(collectionId, collectionName) {
  setStatus('Loading the embedded file from the collection…')
  try {
    const decoded = await fetchCollectionContent(collectionId)
    if (decoded == null) { setStatus(`"${collectionName}" has no embedded file.`, 'info'); return }
    if (isBmf(decoded.mimeType, decoded.bytes)) { await viewBmf(collectionId, collectionName, decoded); return }
    if (isManifest(decoded.mimeType, decoded.bytes)) { await viewReferenceManifest(collectionId, collectionName, decoded); return }
    const bmcSet = parseBmcSet(decoded.bytes)
    if (bmcSet != null) { viewBmc(collectionName, decoded, bmcSet); setStatus(decoded.msg, decoded.verified ? 'ok' : 'error'); return }
    showFile(collectionName, { mimeType: decoded.mimeType, fileName: decoded.fileName, fileBytes: decoded.bytes }, decoded.verified, decoded.msg)
    setStatus(decoded.msg, decoded.verified ? 'ok' : 'error')
  } catch (e) {
    setStatus(`View failed: ${(e).message}`, 'error')
  }
}

async function viewReferenceManifest(collectionId, epName, manifest) {
  const refs = parseManifest(manifest.bytes)
  if (refs == null) { setStatus('This release references other works, but its manifest is unreadable.', 'error'); return }
  setStatus(`Resolving ${refs.length} referenced ${refs.length === 1 ? 'work' : 'works'}…`)
  const tracks = []
  let missing = 0
  for (const r of refs) {
    let decoded = null
    try { decoded = await fetchCollectionContent(r.id) } catch { decoded = null }
    if (decoded == null || hexOf(sha256Bytes(decoded.bytes)) !== r.hash) { missing++; continue }
    const inner = isAlbum(decoded.mimeType, decoded.bytes) ? parseAlbum(decoded.bytes) : null
    if (inner != null && inner.length > 0) for (const t of inner) tracks.push(t)
    else tracks.push({ name: r.name || decoded.fileName, mimeType: decoded.mimeType, bytes: decoded.bytes })
  }
  if (tracks.length === 0) { setStatus('None of the referenced works could be resolved on-chain.', 'error'); return }
  let epCover = null
  try { epCover = (await loadCollection(collectionId)).cover } catch { }
  const ok = missing === 0 && manifest.verified
  const msg = missing === 0
    ? `✓ ${tracks.length} track${tracks.length === 1 ? '' : 's'} resolved from referenced mints — each hash-verified against the manifest`
    : `⚠ ${tracks.length} of ${refs.length} referenced works resolved (${missing} unavailable or hash-mismatched)`
  showAlbumTracks(epName, tracks, ok, msg, `${tracks.length} track${tracks.length === 1 ? '' : 's'} · referenced`, epCover)
  setStatus(msg, missing === 0 ? 'ok' : 'error')
}

let albumUrls = []
let epTeardown = null
let epVizSpeaker = (() => { try { return localStorage.getItem('pharlap2:viz') === 'speaker' } catch { return false } })()
function revokeAlbumUrls() {
  if (epTeardown) { try { epTeardown() } catch { } epTeardown = null }
  for (const u of albumUrls) URL.revokeObjectURL(u)
  albumUrls = []
}

function renderPlayer(host, srcTracks, fallbackCover) {
  if (srcTracks.length === 0) { host.textContent = 'This release has no playable content.'; return }
  let fallbackArtUrl = null
  if (fallbackCover != null && fallbackCover.bytes.length > 0) {
    fallbackArtUrl = URL.createObjectURL(new Blob([new Uint8Array(fallbackCover.bytes)], { type: fallbackCover.mimeType || 'image/jpeg' }))
    albumUrls.push(fallbackArtUrl)
  }
  const stripExt = (n) => n.replace(/\.[^./\\]+$/, '')
  const baseName = (n) => stripExt(n).replace(/^.*[/\\]/, '').toLowerCase()

  const cueFiles = srcTracks.filter(t => /\.(cue|lrc)$/i.test(t.name))
  const availNames = srcTracks.map(s => s.name)
  const cueSceneNames = new Set()
  const sceneUrlByName = new Map()
  const sceneUrlFor = (name) => {
    const key = name.toLowerCase()
    let u = sceneUrlByName.get(key)
    if (u == null) {
      const f = srcTracks.find(s => s.name === name)
      u = URL.createObjectURL(new Blob([new Uint8Array(f.bytes)], { type: f.mimeType || 'image/webp' }))
      albumUrls.push(u); sceneUrlByName.set(key, u); cueSceneNames.add(key)
    }
    return u
  }
  const buildTimeline = (cueBytes) => {
    const resolved = resolveCue(new TextDecoder().decode(new Uint8Array(cueBytes)), availNames)
    return resolved == null ? null : { scenes: resolved.map(s => ({ t: s.t, url: sceneUrlFor(s.name) })) }
  }
  const cueTimelines = cueFiles.map(c => ({ base: baseName(c.name), tl: buildTimeline(c.bytes) })).filter(c => c.tl != null)

  const tracks = srcTracks.map(t => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(t.bytes)], { type: t.mimeType }))
    albumUrls.push(url)
    const isFlac = t.mimeType.includes('flac') || /\.flac$/i.test(t.name)
    const isMp3 = t.mimeType.includes('mpeg') || t.mimeType.includes('mp3') || /\.mp3$/i.test(t.name)
    const pics = isFlac ? parseFlacPictures(t.bytes) : isMp3 ? parseId3Pictures(t.bytes) : []
    const picUrls = pics.map(p => {
      const u = URL.createObjectURL(new Blob([new Uint8Array(p.data)], { type: p.mimeType || 'image/jpeg' }))
      albumUrls.push(u); return { type: p.pictureType, url: u }
    })
    const pick = (types) => picUrls.filter(p => types.includes(p.type)).map(p => p.url)
    const allArt = picUrls.map(p => p.url)
    const media = pick([6]), front = pick([3])
    let discUrls = media.length > 0 ? media : front.length > 0 ? front : allArt
    let coverUrls = allArt
    if (discUrls.length === 0 && fallbackArtUrl != null) discUrls = [fallbackArtUrl]
    if (coverUrls.length === 0 && fallbackArtUrl != null) coverUrls = [fallbackArtUrl]
    const lyrics = parseLyrics(isFlac ? parseFlacLyrics(t.bytes) : isMp3 ? parseId3Lyrics(t.bytes) : null)
    return { name: t.name, mimeType: t.mimeType, url, discUrls, coverUrls, lyrics, timeline: null }
  })
  const probe = document.createElement('audio')
  const GOOD_EXT = /\.(mp3|m4a|aac|mp4|opus|ogg|oga|wav|wave|aif|aiff|flac|weba)$/i
  const isAudioFile = (t) => t.mimeType.startsWith('audio/') || GOOD_EXT.test(t.name)
  const canPlayInBrowser = (t) =>
    (t.mimeType !== '' && t.mimeType !== 'application/octet-stream') ? probe.canPlayType(t.mimeType) !== '' : GOOD_EXT.test(t.name)
  const audioTracks = tracks.filter(t => isAudioFile(t) && canPlayInBrowser(t))
  for (const at of audioTracks) {
    const m = cueTimelines.find(c => c.base === baseName(at.name)) ?? (cueTimelines.length === 1 ? cueTimelines[0] : undefined)
    at.timeline = m?.tl ?? null
  }
  const isCueOrScene = (t) => /\.(cue|lrc)$/i.test(t.name) || cueSceneNames.has(t.name.toLowerCase())
  const otherTracks = tracks.filter(t => !(isAudioFile(t) && canPlayInBrowser(t)) && !isCueOrScene(t))

  const stage = document.createElement('div')
  stage.className = 'ep-stage'
  stage.innerHTML =
    '<div class="ep-orbs"><div class="ep-orb"></div><div class="ep-orb"></div><div class="ep-orb"></div></div>' +
    '<div class="ep-player">' +
      '<button class="ep-art-toggle" type="button" aria-label="Toggle cover view" title="Cover / player view" hidden>🖼️</button>' +
      '<button class="ep-lyrics-toggle" type="button" aria-label="Toggle lyrics" title="Lyrics" hidden>📝</button>' +
      '<button class="ep-video-toggle" type="button" aria-label="Toggle music video" title="Music video" hidden>🎬</button>' +
      '<button class="ep-viz-toggle" type="button" aria-label="Visualization mode" title="Visualization: spinning disc — tap for speaker (no spin)">💿</button>' +
      '<div class="ep-disc-container"><div class="ep-disc"></div><img class="ep-art" alt="cover art" />' +
        '<div class="ep-visualizer-container"><canvas class="ep-visualizer" width="280" height="280"></canvas></div>' +
        '<img class="ep-scene" alt="" />' +
        '<div class="ep-lyrics"><div class="ep-lyrics-scroll"></div></div></div>' +
      '<ul class="ep-song-list"></ul>' +
      '<div class="ep-now-playing"></div>' +
      '<div class="ep-progress-container"><div class="ep-progress-bar"></div></div>' +
      '<div class="ep-time-display"><span class="ep-cur">0:00</span><span class="ep-dur">0:00</span></div>' +
      '<div class="ep-controls">' +
        '<button class="ep-control-btn ep-prev" aria-label="Previous"><svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>' +
        '<button class="ep-control-btn ep-play-btn" aria-label="Play / pause"><svg viewBox="0 0 24 24" class="ep-play-icon"><path d="M8 5v14l11-7z"/></svg></button>' +
        '<button class="ep-control-btn ep-next" aria-label="Next"><svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>' +
      '</div>' +
      '<div class="ep-volume-container"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"/></svg>' +
        '<input type="range" class="ep-volume-slider" min="0" max="1" step="0.01" value="0.7" aria-label="Volume"></div>' +
    '</div>'
  host.append(stage)

  const q = (sel) => stage.querySelector(sel)
  const songList = q('.ep-song-list')
  const disc = q('.ep-disc')
  const discContainer = q('.ep-disc-container')
  const vizToggle = q('.ep-viz-toggle')
  const nowPlaying = q('.ep-now-playing')
  const progressBar = q('.ep-progress-bar')
  const progressContainer = q('.ep-progress-container')
  const curEl = q('.ep-cur'), durEl = q('.ep-dur')
  const playIcon = q('.ep-play-icon')
  const canvas = q('.ep-visualizer')
  const cctx = canvas.getContext('2d')
  const orbs = Array.from(stage.querySelectorAll('.ep-orb'))
  const volume = q('.ep-volume-slider')

  const audio = new Audio()
  audio.preload = 'metadata'
  audio.volume = parseFloat(volume.value)
  let audioCtx = null
  let analyser = null
  let dataArray = null
  let rafId = 0, isPlaying = false, current = 0, tornDown = false
  let speakerScale = 1

  const art = q('.ep-art')
  const player = q('.ep-player')
  const artToggle = q('.ep-art-toggle')
  let artTimer = 0
  let curDisc = [], curCover = []
  function runArtSlideshow(urls) {
    window.clearInterval(artTimer)
    if (urls.length === 0) { art.style.display = 'none'; art.style.opacity = '0'; return }
    let i = 0
    art.style.display = 'block'; art.src = urls[0]; art.style.opacity = '1'
    if (urls.length > 1) {
      artTimer = window.setInterval(() => {
        i = (i + 1) % urls.length
        art.style.opacity = '0'
        window.setTimeout(() => { art.src = urls[i]; art.style.opacity = '1' }, 400)
      }, 6000)
    }
  }
  function showArt(disc, cover) {
    curDisc = disc; curCover = cover
    const hasAny = disc.length > 0 || cover.length > 0
    player.classList.toggle('has-art', hasAny)
    if (!hasAny) { player.classList.remove('art-view'); runArtSlideshow([]); return }
    const inCover = player.classList.contains('art-view')
    runArtSlideshow(inCover ? (cover.length > 0 ? cover : disc) : (disc.length > 0 ? disc : cover))
  }
  artToggle.onclick = () => {
    const inCover = player.classList.toggle('art-view')
    artToggle.textContent = inCover ? '💿' : '🖼️'
    runArtSlideshow(inCover ? (curCover.length > 0 ? curCover : curDisc) : (curDisc.length > 0 ? curDisc : curCover))
  }

  const applyViz = () => {
    player.classList.toggle('viz-speaker', epVizSpeaker)
    vizToggle.textContent = epVizSpeaker ? '🔊' : '💿'
    vizToggle.title = epVizSpeaker ? 'Visualization: speaker — tap for spinning disc' : 'Visualization: spinning disc — tap for speaker (no spin)'
    if (!epVizSpeaker) { discContainer.style.transform = ''; speakerScale = 1 }
  }
  vizToggle.onclick = () => {
    epVizSpeaker = !epVizSpeaker
    try { localStorage.setItem('pharlap2:viz', epVizSpeaker ? 'speaker' : 'disc') } catch { }
    applyViz()
  }
  applyViz()

  const lyricsToggle = q('.ep-lyrics-toggle')
  const lyricsScroll = q('.ep-lyrics-scroll')
  let lyrics = null
  let lyricEls = []
  let lastLyric = -1
  function loadLyrics(parsed) {
    lyrics = parsed; lastLyric = -1; lyricEls = []; lyricsScroll.innerHTML = ''; lyricsScroll.scrollTop = 0
    if (parsed == null) { lyricsToggle.hidden = true; player.classList.remove('lyrics-view'); return }
    lyricsScroll.classList.toggle('ep-ly-synced', parsed.synced)
    for (const ln of parsed.lines) {
      const p = document.createElement('p')
      p.className = 'ep-ly-line'
      p.textContent = ln.text !== '' ? ln.text : '♪'
      lyricsScroll.append(p); lyricEls.push(p)
    }
    lyricsToggle.hidden = false
  }
  function syncLyrics() {
    if (lyrics == null || !lyrics.synced || lyricEls.length === 0) return
    const ct = audio.currentTime
    let idx = -1
    for (let i = 0; i < lyrics.lines.length; i++) { if (lyrics.lines[i].t <= ct) idx = i; else break }
    if (idx === lastLyric) return
    if (lastLyric >= 0 && lyricEls[lastLyric] != null) lyricEls[lastLyric].classList.remove('active')
    lastLyric = idx
    if (idx < 0) return
    const el = lyricEls[idx]
    el.classList.add('active')
    if (player.classList.contains('lyrics-view')) lyricsScroll.scrollTop = el.offsetTop - lyricsScroll.clientHeight / 2 + el.clientHeight / 2
  }
  lyricsToggle.onclick = () => {
    const on = player.classList.toggle('lyrics-view')
    lyricsToggle.textContent = on ? '✖️' : '📝'
    if (on && lastLyric >= 0 && lyricEls[lastLyric] != null) lyricsScroll.scrollTop = lyricEls[lastLyric].offsetTop - lyricsScroll.clientHeight / 2
  }

  const videoToggle = q('.ep-video-toggle')
  const scene = q('.ep-scene')
  scene.onload = () => {
    if (scene.naturalWidth > 0 && scene.naturalHeight > 0) player.style.setProperty('--ep-vid-ar', (scene.naturalWidth / scene.naturalHeight).toFixed(4))
  }
  let timeline = null
  let lastScene = -1
  function loadTimeline(tl) {
    timeline = tl; lastScene = -1; scene.removeAttribute('src'); player.style.removeProperty('--ep-vid-ar')
    if (tl == null) { videoToggle.hidden = true; player.classList.remove('video-view'); return }
    videoToggle.hidden = false
  }
  function syncScene() {
    if (timeline == null || timeline.scenes.length === 0) return
    const ct = audio.currentTime
    let idx = 0
    for (let i = 0; i < timeline.scenes.length; i++) { if (timeline.scenes[i].t <= ct) idx = i; else break }
    if (idx === lastScene) return
    lastScene = idx
    scene.src = timeline.scenes[idx].url
  }
  videoToggle.onclick = () => {
    const on = player.classList.toggle('video-view')
    videoToggle.textContent = on ? '✖️' : '🎬'
    if (on) { lastScene = -1; syncScene() }
  }

  let dlBox = null
  const dlAdded = new Set()
  const addDownload = (t, note) => {
    if (dlAdded.has(t.url)) return
    dlAdded.add(t.url)
    if (dlBox == null) {
      dlBox = document.createElement('div'); dlBox.className = 'ep-downloads'
      const lbl = document.createElement('div'); lbl.className = 'ep-dl-label'; lbl.textContent = 'Downloads'
      dlBox.append(lbl); host.append(dlBox)
    }
    const a = document.createElement('a')
    a.href = t.url; a.download = t.name; a.className = 'viewer-dl'
    a.textContent = `Download ${t.name}${note ? ` — ${note}` : ''}`
    dlBox.append(a)
  }

  const fmt = (s) => Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00'

  function initAudioContext() {
    if (audioCtx) return
    try {
      const AC = window.AudioContext || (window).webkitAudioContext
      audioCtx = new AC()
      analyser = audioCtx.createAnalyser(); analyser.fftSize = 256
      audioCtx.createMediaElementSource(audio).connect(analyser)
      analyser.connect(audioCtx.destination)
      dataArray = new Uint8Array(analyser.frequencyBinCount)
    } catch { }
  }
  const updatePlayIcon = () => { playIcon.innerHTML = isPlaying ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' : '<path d="M8 5v14l11-7z"/>' }
  function updateProgress() {
    if (audio.duration) progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`
    curEl.textContent = fmt(audio.currentTime)
    syncLyrics()
    syncScene()
  }
  function play(i) {
    if (audioTracks.length === 0) return
    current = ((i % audioTracks.length) + audioTracks.length) % audioTracks.length
    Array.from(songList.children).forEach((li, k) => li.classList.toggle('active', k === current))
    initAudioContext(); void audioCtx?.resume()
    audio.src = audioTracks[current].url
    showArt(audioTracks[current].discUrls, audioTracks[current].coverUrls)
    loadLyrics(audioTracks[current].lyrics)
    loadTimeline(audioTracks[current].timeline)
    nowPlaying.innerHTML = `Now playing: <span>${escapeHtml(stripExt(audioTracks[current].name))}</span>`
    void audio.play().catch(() => { nowPlaying.textContent = 'Tap a track to play' })
  }

  audioTracks.forEach((t, i) => {
    const li = document.createElement('li'); li.textContent = stripExt(t.name)
    li.onclick = () => play(i)
    songList.append(li)
  })
  audio.addEventListener('timeupdate', updateProgress)
  audio.addEventListener('loadedmetadata', () => { durEl.textContent = fmt(audio.duration) })
  audio.addEventListener('play', () => { isPlaying = true; disc.classList.add('playing'); player.classList.add('playing'); updatePlayIcon() })
  audio.addEventListener('pause', () => { isPlaying = false; disc.classList.remove('playing'); player.classList.remove('playing'); updatePlayIcon() })
  audio.addEventListener('ended', () => play(current + 1))
  audio.addEventListener('error', () => {
    if (tornDown || !audio.src) return
    const t = audioTracks[current]
    if (t == null) return
    nowPlaying.innerHTML = `<span>Can’t play “${escapeHtml(stripExt(t.name))}” in this browser — download it below.</span>`
    addDownload(t, 'unsupported format')
  })

  q('.ep-prev').onclick = () => play(current - 1)
  q('.ep-next').onclick = () => play(current + 1)
  q('.ep-play-btn').onclick = () => {
    if (!audio.src) { play(0); return }
    if (isPlaying) audio.pause(); else { void audioCtx?.resume(); void audio.play() }
  }
  progressContainer.onclick = (e) => {
    if (!audio.duration) return
    const r = progressContainer.getBoundingClientRect()
    audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration
  }
  volume.oninput = () => { audio.volume = parseFloat(volume.value) }

  function frame() {
    rafId = requestAnimationFrame(frame)
    let bassNow = 0
    if (analyser != null && isPlaying && dataArray != null) {
      analyser.getByteFrequencyData(dataArray)
      let bass = 0, mids = 0, highs = 0
      for (let i = 0; i < 10; i++) bass += dataArray[i]
      for (let i = 10; i < 40; i++) mids += dataArray[i]
      for (let i = 40; i < 80; i++) highs += dataArray[i]
      bass /= 10 * 255; mids /= 30 * 255; highs /= 40 * 255
      bassNow = bass
      const t = Date.now()
      orbs[0].style.transform = `translate(${Math.sin(t / 1000) * 30 * bass}px, ${Math.cos(t / 1200) * 30 * bass}px) scale(${1 + bass * 0.5})`
      orbs[0].style.opacity = `${0.4 + bass * 0.4}`
      orbs[1].style.transform = `translate(${Math.cos(t / 1100) * 40 * mids}px, ${Math.sin(t / 900) * 40 * mids}px) scale(${1 + mids * 0.4})`
      orbs[1].style.opacity = `${0.4 + mids * 0.4}`
      orbs[2].style.transform = `translate(calc(-50% + ${Math.sin(t / 800) * 50 * highs}px), calc(-50% + ${Math.cos(t / 1000) * 50 * highs}px)) scale(${1 + highs * 0.3})`
      orbs[2].style.opacity = `${0.4 + highs * 0.5}`
    }
    if (player.classList.contains('viz-speaker') && !player.classList.contains('art-view') && !player.classList.contains('video-view')) {
      speakerScale += ((1 + bassNow * 0.3) - speakerScale) * 0.35
      discContainer.style.transform = `scale(${speakerScale.toFixed(3)})`
    } else if (speakerScale !== 1) {
      speakerScale = 1; discContainer.style.transform = ''
    }
    cctx.clearRect(0, 0, canvas.width, canvas.height)
    if (analyser != null && isPlaying && dataArray != null) {
      const cx = canvas.width / 2, cy = canvas.height / 2, radius = 95, bars = 64
      for (let i = 0; i < bars; i++) {
        const h = (dataArray[i] / 255) * 42
        const a = (i / bars) * Math.PI * 2 - Math.PI / 2
        const x1 = cx + Math.cos(a) * radius, y1 = cy + Math.sin(a) * radius
        const x2 = cx + Math.cos(a) * (radius + h), y2 = cy + Math.sin(a) * (radius + h)
        const g = cctx.createLinearGradient(x1, y1, x2, y2)
        g.addColorStop(0, 'rgba(255,0,110,0.85)'); g.addColorStop(0.5, 'rgba(131,56,236,0.85)'); g.addColorStop(1, 'rgba(58,134,255,0.85)')
        cctx.beginPath(); cctx.moveTo(x1, y1); cctx.lineTo(x2, y2)
        cctx.strokeStyle = g; cctx.lineWidth = 3; cctx.lineCap = 'round'; cctx.stroke()
      }
    }
  }
  frame()

  if (audioTracks.length > 0) {
    (songList.children[0]).classList.add('active')
    nowPlaying.textContent = 'Tap a track to play'
    showArt(audioTracks[0].discUrls, audioTracks[0].coverUrls)
    loadLyrics(audioTracks[0].lyrics)
    loadTimeline(audioTracks[0].timeline)
  } else {
    nowPlaying.textContent = otherTracks.some(isAudioFile) ? 'No in-browser-playable audio — see downloads below.' : 'This release has no playable audio.'
  }

  for (const t of otherTracks) addDownload(t, isAudioFile(t) ? 'can’t play in this browser' : undefined)

  epTeardown = () => {
    tornDown = true
    cancelAnimationFrame(rafId)
    window.clearInterval(artTimer)
    try { audio.pause() } catch { }
    audio.src = ''
    try { void audioCtx?.close() } catch { }
  }
}

function showFile(title, file, verified, note) {
  const content = $('viewerContent')
  revokeAlbumUrls()
  if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null }
  viewerUrl = URL.createObjectURL(new Blob([new Uint8Array(file.fileBytes)], { type: file.mimeType }))
  $('viewerTitle').textContent =
    `${title} — ${file.fileName} · ${file.mimeType} · ${file.fileBytes.length} bytes`
  const banner = $('viewerProvenance')
  if (note) {
    banner.textContent = note
    banner.className = `viewer-banner ${verified ? 'ok' : 'error'}`
    banner.style.display = 'block'
  } else {
    banner.style.display = 'none'
  }
  content.innerHTML = ''
  const albumTracks = isAlbum(file.mimeType, file.fileBytes) ? parseAlbum(file.fileBytes) : null
  if (albumTracks != null) {
    renderPlayer(content, albumTracks)
  } else if (file.mimeType.startsWith('audio/')) {
    renderPlayer(content, [{ name: file.fileName, mimeType: file.mimeType, bytes: file.fileBytes }])
  } else if (file.mimeType.startsWith('image/')) {
    const img = document.createElement('img')
    img.src = viewerUrl
    img.className = 'viewer-img'
    content.append(img)
  } else if (file.mimeType.startsWith('text/') || file.mimeType === 'application/json') {
    const pre = document.createElement('pre')
    pre.className = 'viewer-pre'
    pre.textContent = new TextDecoder().decode(new Uint8Array(file.fileBytes))
    content.append(pre)
  } else {
    const a = document.createElement('a')
    a.href = viewerUrl
    a.download = file.fileName
    a.textContent = `Download ${file.fileName}`
    a.className = 'viewer-dl'
    content.append(a)
  }
  $('viewer').style.display = 'flex'
}

function viewBmc(title, content, set) {
  const el = $('viewerContent')
  revokeAlbumUrls()
  if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null }
  $('viewerTitle').textContent =
    `${title} — 📦 BMC set · ${set.members.length} member${set.members.length === 1 ? '' : 's'} · ${kb(content.bytes.length)}`
  const banner = $('viewerProvenance')
  banner.textContent = content.msg
  banner.className = `viewer-banner ${content.verified ? 'ok' : 'error'}`
  banner.style.display = 'block'
  el.innerHTML = ''

  const grid = document.createElement('div')
  grid.style.cssText = 'display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-bottom:14px'
  for (const m of set.members) {
    const mime = (m.mimeType || 'application/octet-stream').toLowerCase()
    const url = URL.createObjectURL(new Blob([new Uint8Array(m.bytes)], { type: mime }))
    albumUrls.push(url)
    const card = document.createElement('div')
    card.style.cssText = 'border:1px solid var(--line);border-radius:8px;padding:10px;background:#0d1117'
    const label = document.createElement('div')
    label.style.cssText = 'font-size:12px;font-weight:600;opacity:0.75;margin-bottom:8px;word-break:break-word'
    label.textContent = `${m.name} · ${mime} · ${kb(m.bytes.length)}`
    card.append(label)
    if (mime.startsWith('image/')) {
      const img = document.createElement('img'); img.src = url; img.className = 'viewer-img'; img.loading = 'lazy'; card.append(img)
    } else if (mime.startsWith('audio/')) {
      const au = document.createElement('audio'); au.src = url; au.controls = true; au.style.width = '100%'; card.append(au)
    } else if (mime.startsWith('video/')) {
      const v = document.createElement('video'); v.src = url; v.className = 'viewer-img'; v.controls = true; v.loop = true; v.playsInline = true; card.append(v)
    } else if (mime.startsWith('text/') || mime === 'application/json') {
      const pre = document.createElement('pre'); pre.className = 'viewer-pre'; pre.textContent = new TextDecoder().decode(new Uint8Array(m.bytes)); card.append(pre)
    }
    const dl = document.createElement('a')
    dl.href = url; dl.download = m.file; dl.textContent = `⬇ ${m.file}`; dl.className = 'viewer-dl'
    dl.style.cssText = 'display:inline-block;margin-top:8px;font-size:12px'
    card.append(dl)
    grid.append(card)
  }
  el.append(grid)

  const setUrl = URL.createObjectURL(new Blob([new Uint8Array(content.bytes)], { type: 'application/octet-stream' }))
  albumUrls.push(setUrl)
  const setDl = document.createElement('a')
  setDl.href = setUrl; setDl.download = content.fileName || `${set.name}.bmc`
  setDl.textContent = `⬇ Download the whole set (${content.fileName || `${set.name}.bmc`})`
  setDl.className = 'viewer-dl'
  el.append(setDl)

  $('viewer').style.display = 'flex'
}

function showAlbumTracks(title, tracks, verified, note, subtitle, fallbackCover) {
  const content = $('viewerContent')
  revokeAlbumUrls()
  if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null }
  $('viewerTitle').textContent = `${title} — ${subtitle}`
  const banner = $('viewerProvenance')
  if (note) { banner.textContent = note; banner.className = `viewer-banner ${verified ? 'ok' : 'error'}`; banner.style.display = 'block' }
  else banner.style.display = 'none'
  content.innerHTML = ''
  renderPlayer(content, tracks, fallbackCover)
  $('viewer').style.display = 'flex'
}

function closeViewer() {
  $('viewer').style.display = 'none'
  if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null }
  revokeAlbumUrls()
  $('viewerContent').innerHTML = ''
}

const CATS = [
  { key: 'image', label: 'Images', icon: '🖼️' },
  { key: 'audio', label: 'Audio', icon: '🎵' },
  { key: 'video', label: 'Video', icon: '🎬' },
  { key: 'document', label: 'Documents', icon: '📄' },
  { key: 'text', label: 'Text', icon: '📝' },
  { key: 'archive', label: 'Archives', icon: '🗜️' },
  { key: 'other', label: 'Other', icon: '🎴' },
]
function mimeCategory(mime) {
  if (mime == null || mime === '') return 'other'
  const m = mime.toLowerCase()
  if (m === ALBUM_MIME) return 'audio'
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('audio/')) return 'audio'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('text/')) return 'text'
  if (m === 'application/pdf' || m.includes('msword') || m.includes('officedocument') || m.includes('ms-excel') ||
      m.includes('ms-powerpoint') || m.includes('opendocument') || m === 'application/rtf' || m === 'application/epub+zip') return 'document'
  if (m === 'application/json' || m === 'application/xml' || m.endsWith('+xml')) return 'text'
  if (m === 'application/zip' || m === 'application/gzip' || m === 'application/x-tar' || m.includes('compressed') ||
      m.includes('7z') || m.includes('rar') || m === 'application/x-bzip2') return 'archive'
  return 'other'
}

function renderTokens(skipWarm = false) {
  const host = $('tokens')
  const active = [...store.active()].sort((a, b) => {
    const ha = a.heightHint ?? Infinity
    const hb = b.heightHint ?? Infinity
    if (ha !== hb) return hb - ha
    return (b.addedAt ?? '').localeCompare(a.addedAt ?? '')
  })
  if (active.length === 0) { host.innerHTML = '<p class="muted">No NFTs yet. Publish a collection or Check Incoming.</p>'; return }
  const myHash = myPubKeyHash()
  const groups = new Map()
  for (const t of active) {
    const g = groups.get(t.collectionId)
    if (g != null) g.push(t); else groups.set(t.collectionId, [t])
  }
  if (nftSort === 'publisher') { renderTokensByPublisher(host, active, groups, myHash); return }
  const buckets = new Map()
  let anyPending = false
  for (const [collectionId, copies] of groups) {
    const mime = cachedMime(collectionId)
    const cat = mime === undefined ? (skipWarm ? 'other' : (anyPending = true, 'pending')) : mimeCategory(mime)
    const arr = buckets.get(cat); if (arr != null) arr.push([collectionId, copies]); else buckets.set(cat, [[collectionId, copies]])
  }

  host.innerHTML = `<p class="muted" style="font-size:12px;margin:0 0 8px">${active.length} held — newest first</p>`
  const single = CATS.filter(c => buckets.get(c.key)?.length).length <= 1 && !anyPending
  for (const c of CATS) {
    const items = buckets.get(c.key)
    if (items == null || items.length === 0) continue
    if (single) host.append(sectionBody(items, myHash))
    else host.append(sectionEl(`${c.icon} ${c.label}`, items, myHash))
  }
  const pending = buckets.get('pending')
  if (pending?.length) host.append(sectionEl('⏳ Identifying type…', pending, myHash))

  if (anyPending) void warmAndRerender([...groups.keys()])
  if (!isWatchOnly()) resolvePublisherIdentitiesThen(active, () => renderTokens(true))
}

function renderTokensByPublisher(host, active, groups, myHash) {
  const buckets = new Map()
  for (const [collectionId, copies] of groups) {
    const t0 = copies[0]
    const k = t0.publisherPubKeyHashHex == null ? 'none'
      : t0.publisherPubKeyHashHex === myHash ? 'you'
      : t0.publisherPubKeyHex ?? 'pending'
    const arr = buckets.get(k); if (arr != null) arr.push([collectionId, copies]); else buckets.set(k, [[collectionId, copies]])
  }
  const isPub = (k) => k !== 'you' && k !== 'pending' && k !== 'none'
  const order = [...buckets.keys()].sort((a, b) => {
    const rank = (k) => (k === 'you' ? 0 : isPub(k) ? 1 : k === 'pending' ? 2 : 3)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return isPub(a) ? displayName(a).name.localeCompare(displayName(b).name) : 0
  })

  host.innerHTML = `<p class="muted" style="font-size:12px;margin:0 0 8px">${active.length} held — by publisher</p>`
  for (const k of order) {
    const items = buckets.get(k)
    const label = k === 'you' ? '📤 Published by you'
      : k === 'pending' ? '⏳ Resolving publisher…'
      : k === 'none' ? '🪙 No publisher'
      : nameChip(k)
    host.append(sectionEl(label, items, myHash))
  }
  if (!isWatchOnly()) resolvePublisherIdentitiesThen(active, () => renderTokens(true))
}

function card(collectionId, copies, myHash) {
  return copies.length === 1 ? singleCard(copies[0], myHash) : groupCard(collectionId, copies, myHash)
}

function sectionBody(items, myHash) {
  const wrap = document.createElement('div')
  if (nftView === 'grid') {
    wrap.className = 'token-grid'
    for (const [cid, copies] of items) wrap.append(tileEl(cid, copies, myHash))
  } else {
    for (const [cid, copies] of items) wrap.append(card(cid, copies, myHash))
  }
  return wrap
}

function sectionEl(label, items, myHash) {
  const sec = document.createElement('div')
  sec.className = 'token-section'
  const head = document.createElement('div')
  head.className = 'token-section-head'
  head.innerHTML = `<span class="chev">▾</span> <span class="token-section-label">${label}</span> <span class="count">${items.length}</span>`
  const bodyEl = sectionBody(items, myHash)
  bodyEl.classList.add('token-section-body')
  head.onclick = e => {
    if ((e.target).closest('.copy-id, button') != null) return
    bodyEl.hidden = !bodyEl.hidden
    head.querySelector('.chev').textContent = bodyEl.hidden ? '▸' : '▾'
  }
  sec.append(head, bodyEl)
  return sec
}

function tileEl(collectionId, copies, myHash) {
  const t0 = copies[0]
  const tile = document.createElement('button')
  tile.type = 'button'
  tile.className = 'token-tile'
  const thumb = document.createElement('div')
  thumb.className = 'token-tile-thumb'
  thumb.innerHTML = '<div class="token-thumb-ph">🎴</div>'
  void fillCardThumb(thumb, collectionId)
  const cap = document.createElement('div')
  cap.className = 'token-tile-cap'
  cap.innerHTML = `<span class="token-tile-name">${escapeHtml(t0.collectionName ?? 'Collection')}</span>` +
    `${copies.length > 1 ? `<span class="count">×${copies.length}</span>` : (t0.kind === 'edition' ? '<span class="count">edition</span>' : '')}`
  tile.append(thumb, cap)
  tile.onclick = () => openTokenDetail(collectionId, copies, myHash)
  return tile
}

function openTokenDetail(collectionId, copies, myHash) {
  const body = $('tokenModalBody')
  body.innerHTML = ''
  body.append(copies.length === 1 ? singleCard(copies[0], myHash) : groupCard(collectionId, copies, myHash, true))
  $('tokenModal').style.display = 'flex'
}

function closeTokenModal() {
  $('tokenModal').style.display = 'none'
  $('tokenModalBody').innerHTML = ''
}

function setNftView(v) {
  if (nftView === v) return
  nftView = v
  try { localStorage.setItem('p2:nftview', v) } catch { }
  updateViewToggle()
  renderTokens()
}

function setNftSort(s) {
  if (nftSort === s) return
  nftSort = s
  try { localStorage.setItem('p2:nftsort', s) } catch { }
  updateSortToggle()
  renderTokens()
}

function updateSortToggle() {
  $('btnSortRecent').classList.toggle('active', nftSort === 'recent')
  $('btnSortPublisher').classList.toggle('active', nftSort === 'publisher')
}

function updateViewToggle() {
  $('btnViewList').classList.toggle('active', nftView === 'list')
  $('btnViewGrid').classList.toggle('active', nftView === 'grid')
}

async function warmAndRerender(collectionIds) {
  await Promise.all(collectionIds.map(ensureCollectionMeta))
  renderTokens(true)
}

function tokenThumbEl(collectionId) {
  const thumb = document.createElement('div')
  thumb.className = 'token-thumb'
  thumb.innerHTML = '<div class="token-thumb-ph">🎴</div>'
  void fillCardThumb(thumb, collectionId)
  return thumb
}

function tokenExtrasHtml(t) {
  const stateText = t.stateData && t.stateData !== '00' ? safeUtf8(t.stateData) : ''
  const latest = latestBroadcast.get(t.collectionId)
  return `${stateText ? `<div class="state">state: ${escapeHtml(stateText)}</div>` : ''}` +
    `${t.sellerNote ? `<div class="state" style="color:var(--accent2)">📝 ${escapeHtml(t.sellerNote)}</div>` : ''}` +
    `${t.bonusValue ? (t.bonusKind === 'link'
      ? `<div class="state">🎁 <a href="${escapeHtml(t.bonusValue)}" target="_blank" rel="noopener" class="bonus-claim">Claim your bonus ↗</a></div>`
      : `<div class="state">🎁 Bonus code: <span class="mono">${escapeHtml(t.bonusValue)}</span></div>`) : ''}` +
    `${latest ? `<div class="state" style="color:var(--accent)">📣 ${escapeHtml(latest.text)}</div>` : ''}`
}

async function onPublishPreview(t) {
  const k = requireKey(); if (k == null) return
  const name = t.collectionName ?? 'this collection'
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/mpeg,.mp3'
  input.onchange = async () => {
    const clip = await readFile(input)
    if (!clip) return
    const kb = Math.round(clip.bytes.length / 1024)
    if (clip.bytes.length > MAX_PREVIEW_BYTES) {
      setStatus(`Preview too large (${kb} KB; max ${Math.round(MAX_PREVIEW_BYTES / 1024)} KB). Use a shorter or lower-bitrate mp3.`, 'error'); return
    }
    if (!confirm(`Publish a ${kb} KB preview clip for “${name}”?\n\nIt's posted on-chain (a small one-off fee) so anyone can listen before buying. Replaces any previous preview for this collection.`)) return
    setStatus('Publishing preview clip…')
    try {
      const txId = await publishPreview(provider, k, t.collectionId, { mimeType: clip.mimeType || 'audio/mpeg', bytes: clip.bytes })
      setStatusHtml(`🎧 Preview published ✓ — <a href="https://whatsonchain.com/tx/${txId}" target="_blank" rel="noopener">${txId.slice(0, 16)}…</a>`, 'ok')
      toast('Preview clip published ✓')
      console.info(`[preview] published ${txId} for ${t.collectionId}`)
    } catch (e) {
      setStatus(`Preview publish failed: ${(e).message}`, 'error')
    }
  }
  input.click()
}

function tokenActions(t, myHash) {
  const isEdition = t.kind === 'edition'
  const iAmPublisher = t.publisherPubKeyHashHex != null && t.publisherPubKeyHashHex === myHash
  const ro = isWatchOnly()
  const verify = document.createElement('button')
  verify.textContent = 'Verify'; verify.className = 'secondary'
  verify.onclick = () => void onVerify(t.txId, t.outputIndex)
  const actions = document.createElement('div')
  actions.className = 'actions'
  if (isEdition) {
    const view = document.createElement('button')
    view.textContent = 'OPEN'; view.className = 'secondary'
    view.onclick = () => void onView(t.collectionId, t.collectionName ?? 'Edition')
    const sales = document.createElement('button')
    sales.textContent = 'Sales page'; sales.className = 'secondary'
    sales.onclick = () => onOpenSalesPage(t)
    if (!ro) {
      const replicate = document.createElement('button')
      replicate.textContent = 'Replicate'
      replicate.onclick = () => void onReplicate(t)
      const xfer = document.createElement('button')
      xfer.textContent = 'Transfer'; xfer.className = 'secondary'
      xfer.onclick = () => void onTransferEdition(t)
      actions.append(replicate, xfer)
    }
    actions.append(view, sales, verify)
    if (!ro && t.lockHex != null && editionSupportsBurn(hexBytes(t.lockHex))) {
      const burn = document.createElement('button')
      burn.textContent = '🔥 Burn'; burn.className = 'secondary'
      burn.onclick = () => void onBurn(t)
      actions.append(burn)
    }
    if (!ro) {
      const gift = document.createElement('button')
      gift.textContent = '🎁 Gift'; gift.className = 'secondary'
      gift.onclick = () => void onGiftCopies(t)
      const links = document.createElement('button')
      links.textContent = '📥 Gift links'; links.className = 'secondary'
      links.onclick = () => void onViewGiftLinks(t)
      const reclaim = document.createElement('button')
      reclaim.textContent = '♻ Reclaim gifts'; reclaim.className = 'secondary'
      reclaim.onclick = () => void onReclaimGifts(t)
      const partner = document.createElement('button')
      partner.textContent = '🤝 Onboard partner'; partner.className = 'secondary'
      partner.onclick = () => void onOnboardPartner(t)
      actions.append(gift, links, reclaim, partner)
    }
    if (iAmPublisher) {
      if (!ro) {
        const bc = document.createElement('button')
        bc.textContent = '📣 Broadcast'; bc.className = 'secondary'
        bc.onclick = () => void onBroadcast(t)
        const prev = document.createElement('button')
        prev.textContent = '🎧 Preview clip'; prev.className = 'secondary'
        prev.onclick = () => void onPublishPreview(t)
        actions.append(bc, prev)
      }
      const buyers = document.createElement('button')
      buyers.textContent = '👥 Buyers'; buyers.className = 'secondary'
      buyers.onclick = () => void onViewBuyers(t)
      actions.append(buyers)
    }
  } else {
    const view = document.createElement('button')
    view.textContent = 'OPEN'; view.className = 'secondary'
    view.onclick = () => void onView(t.collectionId, t.collectionName ?? 'Collection')
    if (!ro) {
      const send = document.createElement('button')
      send.textContent = 'Send'
      send.onclick = () => void onSend(t.txId, t.outputIndex)
      actions.append(send)
    }
    actions.append(verify, view)
  }
  return actions
}

function singleCard(t, myHash) {
  const card = document.createElement('div')
  card.className = 'token'
  const body = document.createElement('div')
  body.className = 'token-body'
  const isEdition = t.kind === 'edition'
  body.innerHTML = `
    <div class="token-name">${escapeHtml(t.collectionName ?? 'Collection')}${isEdition ? ' <span class="badge">edition</span>' : ''}</div>
    <div class="mono token-ids">collection <span class="copy-id" data-copy="${t.collectionId}" title="${t.collectionId} — click to copy">${short(t.collectionId)}</span> · utxo <span class="copy-id" data-copy="${t.txId}" title="${t.txId} — click to copy">${short(t.txId)}</span>:${t.outputIndex}</div>
    ${tokenExtrasHtml(t)}`
  const pubRow = publisherRowEl(t, myHash); if (pubRow != null) body.append(pubRow)
  body.append(tokenActions(t, myHash))
  card.append(tokenThumbEl(t.collectionId), body)
  return card
}

function groupCard(collectionId, copies, myHash, startOpen = false) {
  const t0 = copies[0]
  const isEdition = t0.kind === 'edition'
  const card = document.createElement('div')
  card.className = 'token token-group'
  if (startOpen) card.classList.add('open')
  const head = document.createElement('div')
  head.className = 'token-group-head'
  const headBody = document.createElement('div')
  headBody.className = 'token-body'
  headBody.innerHTML = `
    <div class="token-name">${escapeHtml(t0.collectionName ?? 'Collection')}${isEdition ? ' <span class="badge">edition</span>' : ''} <span class="count">×${copies.length}</span></div>
    <div class="mono token-ids">collection <span class="copy-id" data-copy="${collectionId}" title="${collectionId} — click to copy">${short(collectionId)}</span> · ${copies.length} copies held</div>`
  const pubRow = publisherRowEl(t0, myHash); if (pubRow != null) headBody.append(pubRow)
  const chev = document.createElement('span')
  chev.className = 'chev'; chev.textContent = startOpen ? '▾' : '▸'
  head.append(tokenThumbEl(collectionId), headBody, chev)

  const items = document.createElement('div')
  items.className = 'token-group-items'; items.hidden = !startOpen
  for (const t of copies) {
    const row = document.createElement('div')
    row.className = 'token-copy'
    row.innerHTML = `<div class="mono token-ids">utxo <span class="copy-id" data-copy="${t.txId}" title="${t.txId} — click to copy">${short(t.txId)}</span>:${t.outputIndex}</div>${tokenExtrasHtml(t)}`
    row.append(tokenActions(t, myHash))
    items.append(row)
  }
  head.onclick = e => {
    if ((e.target).closest('.copy-id') != null) return
    items.hidden = !items.hidden
    chev.textContent = items.hidden ? '▸' : '▾'
    card.classList.toggle('open', !items.hidden)
  }
  card.append(head, items)
  return card
}

const metaInFlight = new Map()

async function fillCardThumb(thumbEl, collectionId) {
  const cached = cachedThumb(collectionId)
  const url = cached != null ? cached : (await ensureCollectionMeta(collectionId), cachedThumb(collectionId))
  if (url == null) return
  const img = document.createElement('img')
  img.className = 'token-thumb-img'
  img.loading = 'lazy'
  img.src = url
  thumbEl.innerHTML = ''
  thumbEl.append(img)
}

async function ensureCollectionMeta(collectionId) {
  if (thumbResolved(collectionId) && cachedMime(collectionId) !== undefined) return
  let p = metaInFlight.get(collectionId)
  if (p == null) { p = fetchCollectionMeta(collectionId); metaInFlight.set(collectionId, p) }
  try { await p } finally { metaInFlight.delete(collectionId) }
}

async function fetchCollectionMeta(collectionId) {
  try {
    const tx1 = await provider.getSourceTransaction(collectionId)
    let coverBytes
    let coverMime = 'application/octet-stream'
    let file = null
    let template
    for (const o of tx1.outputs) {
      const s = parseStorefrontScript(LockingScript.fromBinary(o.script))
      if (s?.fields.coverBytes?.length) { coverBytes = s.fields.coverBytes; coverMime = s.fields.coverMimeType ?? coverMime }
      const f = parseFileScript(LockingScript.fromBinary(o.script)); if (f) file = f.fields
      const t = parseTemplateScript(LockingScript.fromBinary(o.script)); if (t) template = t.fields
    }
    cacheMime(collectionId, file?.mimeType ?? null)
    if (coverBytes?.length) { if (await makeThumb(collectionId, coverBytes, coverMime) != null) return }
    const rules = template != null ? decodeTokenRules(template.tokenRules) : null
    if (file != null && !(rules?.isEncrypted) && file.mimeType.startsWith('image/')) {
      let bytes = file.fileBytes
      if (rules?.isCompressed) { try { bytes = await decompress(bytes) } catch { } }
      if (await makeThumb(collectionId, bytes, file.mimeType) != null) return
    }
    cacheNoThumb(collectionId)
  } catch {
  }
}

function safeUtf8(hex) {
  try { return utf8Of(hexBytes(hex)) } catch { return hex }
}

function onCopyClick(e) {
  const el = (e.target)?.closest('[data-copy]')
  if (el == null) return
  const value = el.dataset.copy ?? ''
  if (value === '') return
  void navigator.clipboard?.writeText(value)
  toast('Copied to clipboard')
}

let toastTimer
function toast(message) {
  let el = document.getElementById('toast')
  if (el == null) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el) }
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el?.classList.remove('show'), 1400)
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

let contacts = {}
let contactsAt = {}
let seenAliases = {}
let pinned = {}

function persist(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } }

function loadAliases() {
  try { contacts = JSON.parse(localStorage.getItem('p2:contacts') ?? '{}') } catch { contacts = {} }
  try { contactsAt = JSON.parse(localStorage.getItem('p2:contactsAt') ?? '{}') } catch { contactsAt = {} }
  try { seenAliases = JSON.parse(localStorage.getItem('p2:aliases') ?? '{}') } catch { seenAliases = {} }
  try { pinned = JSON.parse(localStorage.getItem('p2:pinned') ?? '{}') } catch { pinned = {} }
  try { avatars = JSON.parse(localStorage.getItem('p2:avatars') ?? '{}') } catch { avatars = {} }
}
function getMyAlias() { try { return (localStorage.getItem('p2:myalias') ?? '').trim() } catch { return '' } }
function setMyAlias(a) {
  try { localStorage.setItem('p2:myalias', a); localStorage.setItem('p2:myaliasAt', String(nowMs())) } catch { }
  markConfigDirty()
}

const nowMs = () => { try { return Date.now() } catch { return 0 } }
function touchContact(k) { contactsAt[k.toLowerCase()] = nowMs(); persist('p2:contactsAt', contactsAt); markConfigDirty() }
function markConfigDirty() {
  try { localStorage.setItem('p2:cfgDirty', String((parseInt(localStorage.getItem('p2:cfgDirty') ?? '0', 10) || 0) + 1)) } catch { }
  updateCfgBackupNote()
}

function rememberAlias(pubKeyHex, alias) {
  if (alias === '') return
  const k = pubKeyHex.toLowerCase()
  if (contacts[k] != null) {
    if (!pinned[k] && contacts[k] !== alias) { contacts[k] = alias; persist('p2:contacts', contacts); touchContact(k) }
    return
  }
  if (seenAliases[k] === alias) return
  seenAliases[k] = alias
  persist('p2:aliases', seenAliases)
}

function applyLatestAliases(items) {
  const latest = new Map()
  for (const it of items) {
    const k = it.pk.toLowerCase()
    if (it.alias != null && it.alias !== '' && !latest.has(k)) latest.set(k, it.alias)
  }
  for (const [pk, alias] of latest) rememberAlias(pk, alias)
}

function saveContact(pubKeyHex, alias, customLabel = false) {
  const k = pubKeyHex.toLowerCase()
  contacts[k] = alias
  if (customLabel) pinned[k] = 1; else delete pinned[k]
  delete seenAliases[k]
  persist('p2:contacts', contacts); persist('p2:pinned', pinned); persist('p2:aliases', seenAliases)
  touchContact(k)
}

function removeContact(pubKeyHex) {
  const k = pubKeyHex.toLowerCase()
  delete contacts[k]; delete pinned[k]
  persist('p2:contacts', contacts); persist('p2:pinned', pinned)
  touchContact(k)
}

function ignoreSeen(pubKeyHex) {
  delete seenAliases[pubKeyHex.toLowerCase()]
  try { localStorage.setItem('p2:aliases', JSON.stringify(seenAliases)) } catch { }
}

function refreshNameSurfaces() {
  renderInbox(lastInbox)
  if (lastUpdatesFeed != null) renderUpdatesFeed(lastUpdatesFeed)
  renderTokens()
  updateMsgToName()
}

function displayName(pubKeyHex) {
  const k = pubKeyHex.toLowerCase()
  if (k === myPubKeyLc()) { const a = getMyAlias(); return a ? { name: '@' + a, verified: true, isMe: true, alias: a } : { name: short(pubKeyHex), verified: true, isMe: true } }
  if (contacts[k] != null) return { name: '@' + contacts[k], verified: true, isMe: false, alias: contacts[k] }
  if (seenAliases[k] != null) return { name: '@' + seenAliases[k], verified: false, isMe: false, alias: seenAliases[k] }
  return { name: short(pubKeyHex), verified: true, isMe: false }
}
function myPubKeyLc() { try { return pubKeyHex.toLowerCase() } catch { return '' } }

function keyHue(pubKeyHex) {
  const h = sha256Bytes(hexBytes(pubKeyHex.toLowerCase()))
  return ((h[0] << 8) | h[1]) % 360
}

function identiconSvg(pubKeyHex, px = 18) {
  const h = sha256Bytes(hexBytes(pubKeyHex.toLowerCase()))
  const hue = keyHue(pubKeyHex)
  const fg = `hsl(${hue},62%,58%)`
  const bg = `hsl(${hue},22%,20%)`
  const N = 5
  let cells = ''
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < 3; x++) {
      if ((h[2 + y * 3 + x] & 1) === 0) continue
      cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`
      if (x < 2) cells += `<rect x="${N - 1 - x}" y="${y}" width="1" height="1"/>`
    }
  }
  return `<svg class="identicon" width="${px}" height="${px}" viewBox="0 0 ${N} ${N}" aria-hidden="true">` +
    `<rect width="${N}" height="${N}" fill="${bg}"/><g fill="${fg}">${cells}</g></svg>`
}

const NO_AVATAR = '-'
let avatars = {}

function cachedAvatar(pubKeyHex) {
  const a = avatars[pubKeyHex.toLowerCase()]
  return a != null && a !== NO_AVATAR ? a : null
}
function setAvatar(pubKeyHex, value) {
  avatars[pubKeyHex.toLowerCase()] = value
  try { localStorage.setItem('p2:avatars', JSON.stringify(avatars)) } catch { }
}

function avatarHtml(pubKeyHex, px = 18) {
  const a = cachedAvatar(pubKeyHex)
  if (a == null) return identiconSvg(pubKeyHex, px)
  return `<img class="avatar identicon" src="${a}" width="${px}" height="${px}" alt="" style="border:1.5px solid hsl(${keyHue(pubKeyHex)},62%,58%)" />`
}

function nameChip(pubKeyHex, opts = {}) {
  const info = displayName(pubKeyHex)
  const ico = avatarHtml(pubKeyHex)
  const chip = `<span class="copy-id" data-copy="${pubKeyHex}" title="${pubKeyHex} — click to copy">${escapeHtml(info.name)}</span>`
  if (info.verified) return ico + chip
  const warn = ` <span class="unverified" title="Self-claimed name — verify the key on hover before trusting it">⚠ unverified</span>`
  const save = opts.save ? ` <button class="alias-save" data-pk="${pubKeyHex}" data-alias="${escapeHtml(info.alias ?? '')}">save</button>` : ''
  return ico + chip + warn + save
}

function bytesToDataUrl(mime, bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.slice(i, i + 0x8000))
  return `data:${mime || 'image/webp'};base64,${btoa(bin)}`
}

const avatarInFlight = new Map()
const profileChecked = new Set()
async function ensureAvatar(pubKeyHex) {
  const k = pubKeyHex.toLowerCase()
  if (profileChecked.has(k)) return false
  profileChecked.add(k)
  let p = avatarInFlight.get(k)
  if (p == null) { p = fetchProfileInto(k); avatarInFlight.set(k, p) }
  try { return await p } finally { avatarInFlight.delete(k) }
}
async function fetchProfileInto(k) {
  try {
    const prof = await resolveProfile(provider, k)
    const newAvatar = prof?.avatarBytes != null && prof.avatarBytes.length > 0
      ? bytesToDataUrl(prof.avatarMimeType ?? 'image/webp', prof.avatarBytes) : NO_AVATAR
    const avatarChanged = avatars[k] !== newAvatar && newAvatar !== NO_AVATAR
    setAvatar(k, newAvatar)
    let aliasChanged = false
    if (prof?.alias != null && prof.alias !== '' && contacts[k] == null && seenAliases[k] == null) {
      seenAliases[k] = prof.alias; persist('p2:aliases', seenAliases); aliasChanged = true
    }
    return avatarChanged || aliasChanged
  } catch { return false }
}
function resolveAvatarsThen(pubKeys, rerender) {
  const todo = [...new Set(pubKeys.map(p => p.toLowerCase()))].filter(k => !profileChecked.has(k))
  if (todo.length === 0) return
  void Promise.all(todo.map(ensureAvatar)).then(changed => { if (changed.some(Boolean)) rerender() })
}

const publisherKeyInFlight = new Map()

function myPubKeyHash() { return hexOf(hash160Bytes(hexBytes(pubKeyHex))) }

async function recoverPublisherKey(collectionId, publisherHashHex) {
  try {
    const tx1 = await provider.getSourceTransaction(collectionId)
    for (const input of tx1.inputs) {
      for (const c of Script.fromBinary(input.script).chunks) {
        const d = c.data
        if (d != null && (d.length === 33 || d.length === 65) && hexOf(hash160Bytes(d)) === publisherHashHex) {
          const hex = hexOf(d)
          store.setPublisherPubKey(collectionId, hex)
          return hex
        }
      }
    }
  } catch { }
  return null
}

function resolvePublisherKey(t) {
  if (t.publisherPubKeyHex != null) return Promise.resolve(t.publisherPubKeyHex)
  if (t.publisherPubKeyHashHex == null) return Promise.resolve(null)
  let p = publisherKeyInFlight.get(t.collectionId)
  if (p == null) { p = recoverPublisherKey(t.collectionId, t.publisherPubKeyHashHex); publisherKeyInFlight.set(t.collectionId, p) }
  return p
}

function resolvePublisherIdentitiesThen(tokens, rerender) {
  const mine = myPubKeyHash()
  const seen = new Set()
  const todo = tokens.filter(t =>
    t.publisherPubKeyHex == null && t.publisherPubKeyHashHex != null && t.publisherPubKeyHashHex !== mine &&
    !seen.has(t.collectionId) && (seen.add(t.collectionId), true))
  const known = tokens.map(t => t.publisherPubKeyHex).filter((v) => v != null)
  if (known.length) resolveAvatarsThen(known, rerender)
  if (todo.length === 0) return
  void Promise.all(todo.map(resolvePublisherKey)).then(keys => {
    let wrote = false
    keys.forEach((k, i) => { if (k != null) { store.setPublisherPubKey(todo[i].collectionId, k); wrote = true } })
    if (!wrote) return
    const got = keys.filter((v) => v != null)
    resolveAvatarsThen(got, rerender)
    rerender()
  })
}

function fillWildcards(text, recipientKey, ctx) {
  const mine = getMyAlias()
  const recip = displayName(recipientKey).alias
  const buyer = ctx.recipientRole === 'buyer' ? (recip ?? 'there') : (mine || 'there')
  const publisher = ctx.recipientRole === 'publisher' ? (recip ?? 'the publisher') : (mine || 'the publisher')
  return text.split('%buyer%').join(buyer).split('%publisher%').join(publisher).split('%product%').join(ctx.product ?? '')
}

function openCompose(recipients, opts) {
  if (recipients.length === 0) return
  const multi = recipients.length > 1
  const overlay = document.createElement('div')
  overlay.className = 'modal'
  overlay.innerHTML =
    '<div class="modal-box compose-box">' +
    `<div class="modal-head"><span>✉ Message ${escapeHtml(opts.who)}</span><button class="secondary compose-close">✕ Close</button></div>` +
    `<div class="compose-to${multi ? ' compose-many' : ''}">${recipients.map(r => nameChip(r)).join(multi ? ' ' : '')}</div>` +
    '<textarea class="compose-text" rows="4" placeholder="Write a message…"></textarea>' +
    `<p class="compose-hint muted" style="font-size:11px">Personalize with <code>%buyer%</code> · <code>%publisher%</code>${opts.product != null ? ' · <code>%product%</code>' : ''}</p>` +
    '<div class="compose-preview muted" style="font-size:11px"></div>' +
    '<label class="compose-row"><span>📎 Attach a file</span> <input type="file" class="compose-file" /></label>' +
    '<label class="compose-row"><span><input type="checkbox" class="compose-encrypt" checked /> Encrypt</span> <span class="muted" style="font-size:11px">only they can read it</span></label>' +
    `<div class="row" style="margin-top:10px"><button class="compose-send">${multi ? `Send to ${recipients.length}` : 'Send'}</button></div>` +
    '<p class="compose-status muted" style="font-size:12px;margin-top:8px"></p>' +
    '</div>'
  const close = () => overlay.remove()
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })
  overlay.querySelector('.compose-close')?.addEventListener('click', close)
  const textEl = overlay.querySelector('.compose-text')
  const fileEl = overlay.querySelector('.compose-file')
  const encEl = overlay.querySelector('.compose-encrypt')
  const sendBtn = overlay.querySelector('.compose-send')
  const statusEl = overlay.querySelector('.compose-status')
  const previewEl = overlay.querySelector('.compose-preview')
  const updatePreview = () => {
    const filled = fillWildcards(textEl.value, recipients[0], opts)
    previewEl.textContent = filled !== textEl.value ? `Preview → ${displayName(recipients[0]).name}: ${filled}` : ''
  }
  textEl.addEventListener('input', updatePreview)
  sendBtn.onclick = () => void (async () => {
    const k = requireKey(); if (k == null) return
    const text = textEl.value
    const file = await readFile(fileEl)
    if (!text.trim() && file == null) { statusEl.textContent = 'Write a message or attach a file first.'; return }
    if (multi && !confirm(
      `Send this message to ${recipients.length} recipients?\n\n` +
      `That's ${recipients.length} separate encrypted transactions — one network fee each` +
      `${file != null ? ' (the file is sent to each)' : ''}. Proceed?`)) return
    sendBtn.disabled = true
    let ok = 0, failed = 0
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]
      statusEl.textContent = multi ? `Sending ${i + 1}/${recipients.length}…` : 'Sending…'
      const parts = []
      const filled = fillWildcards(text, r, opts)
      if (filled.trim()) parts.push({ kind: 'text', text: filled })
      if (file) parts.push({ kind: 'file', mimeType: file.mimeType, fileName: file.fileName, bytes: file.bytes })
      if (parts.length === 0) continue
      try { await sendMessage(provider, k, { toPubKeyHex: r, parts, encrypt: encEl.checked, senderAlias: getMyAlias() }); ok++ }
      catch { failed++ }
    }
    statusEl.textContent = failed === 0
      ? `✅ Sent${multi ? ` to ${ok}` : ''}.`
      : `Sent ${ok}, ${failed} failed${multi ? ' — close and retry the rest' : ''}.`
    if (failed === 0) setTimeout(close, multi ? 1600 : 1200)
    else sendBtn.disabled = false
  })()
  document.body.append(overlay)
  textEl.focus()
}

function composeTo(pubKeyHex, who, ctx) { openCompose([pubKeyHex], { who, ...ctx }) }

function onMessagePublisher(pubKeyHex, product) {
  composeTo(pubKeyHex, 'the publisher', { product, recipientRole: 'publisher' })
}

function publisherRowEl(t, myHash) {
  if (t.publisherPubKeyHashHex == null) return null
  const row = document.createElement('div')
  row.className = 'token-publisher'
  if (t.publisherPubKeyHashHex === myHash) { row.innerHTML = '<span class="muted">📤 published by you</span>'; return row }
  const pk = t.publisherPubKeyHex
  if (pk == null) { row.innerHTML = '<span class="muted">by publisher…</span>'; return row }
  row.innerHTML = `<span class="muted">by</span> ${nameChip(pk)} `
  const msg = document.createElement('button')
  msg.className = 'link-btn'; msg.textContent = '✉ Message'
  msg.onclick = e => { e.stopPropagation(); onMessagePublisher(pk, t.collectionName) }
  row.append(msg)
  return row
}

function onAliasSaveClick(e) {
  const btn = (e.target)?.closest('.alias-save')
  if (btn == null) return
  const pk = btn.dataset.pk ?? ''
  const alias = btn.dataset.alias ?? ''
  if (pk === '') return
  saveContact(pk, alias)
  toast(`Saved @${alias}`)
  renderInbox(lastInbox)
  if (lastUpdatesFeed != null) renderUpdatesFeed(lastUpdatesFeed)
  updateMsgToName()
}

function updateMsgToName() {
  const to = val('msgTo')
  const el = $('msgToName')
  if (to.length !== 66 && to.length !== 130) { el.innerHTML = ''; return }
  const info = displayName(to)
  el.innerHTML = info.isMe ? '↪ that’s your own key' : (info.alias != null ? `→ ${nameChip(to, { save: true })}` : '')
}

function cfgDirtyCount() { try { return parseInt(localStorage.getItem('p2:cfgDirty') ?? '0', 10) || 0 } catch { return 0 } }
function lastBackupAt() { try { return parseInt(localStorage.getItem('p2:cfgBackupAt') ?? '0', 10) || 0 } catch { return 0 } }

function updateCfgBackupNote() {
  const el = document.getElementById('cfgBackupNote'); if (el == null) return
  const n = cfgDirtyCount(); const at = lastBackupAt()
  el.textContent = at === 0
    ? (Object.keys(contacts).length ? 'Not backed up yet.' : 'Nothing to back up yet.')
    : n > 0 ? `⚠ ${n} change${n > 1 ? 's' : ''} since last backup (${fmtTime(at)}).`
    : `✓ Backed up ${fmtTime(at)}.`
}

async function onConfigBackup() {
  const myKey = requireKey(); if (myKey == null) return
  const btn = $('btnCfgBackup')
  btn.disabled = true; setStatus('Backing up your config (encrypted to your key)…')
  try {
    let prefs = {}
    try { for (const k of ['p2:nftview', 'p2:nftsort', 'p2:refBy', 'p2:affRefCode']) { const v = localStorage.getItem(k); if (v != null) prefs[k] = v } } catch { prefs = {} }
    const aliasAt = (() => { try { return parseInt(localStorage.getItem('p2:myaliasAt') ?? '0', 10) || 0 } catch { return 0 } })()
    const txId = await publishConfigBackup(provider, myKey,
      { alias: getMyAlias() || undefined, aliasAt, contacts, contactsAt, prefs }, nowMs())
    try { localStorage.setItem('p2:cfgBackupAt', String(nowMs())); localStorage.setItem('p2:cfgDirty', '0') } catch { }
    updateCfgBackupNote()
    setStatusHtml(`☁ Config backed up (encrypted). Tx ${idChip(txId)}.`, 'ok')
  } catch (e) {
    setStatus(`Backup failed: ${(e).message}`, 'error')
  } finally { btn.disabled = false }
}

async function restoreConfigFromChain(quiet = false) {
  const myKey = requireKey(); if (myKey == null) return 0
  const blob = await resolveConfigBackup(provider, myKey)
  if (blob == null) { if (!quiet) setStatus('No config backup found for this key.'); return 0 }
  const aliasAt = (() => { try { return parseInt(localStorage.getItem('p2:myaliasAt') ?? '0', 10) || 0 } catch { return 0 } })()
  const merged = mergeConfig({ alias: getMyAlias() || undefined, aliasAt, contacts, contactsAt }, blob)
  contacts = merged.contacts; contactsAt = merged.contactsAt
  persist('p2:contacts', contacts); persist('p2:contactsAt', contactsAt)
  if (merged.alias != null && merged.alias !== getMyAlias()) {
    try { localStorage.setItem('p2:myalias', merged.alias); if (merged.aliasAt != null) localStorage.setItem('p2:myaliasAt', String(merged.aliasAt)) } catch { }
    const ai = document.getElementById('myAlias')
    if (ai != null) ai.value = merged.alias ? '@' + merged.alias : ''
  }
  if (blob.prefs != null) { try { for (const [k, v] of Object.entries(blob.prefs)) localStorage.setItem(k, v) } catch { } }
  return merged.changed
}

async function onConfigRestore() {
  const btn = $('btnCfgRestore')
  btn.disabled = true; setStatus('Looking for your config backup…')
  try {
    const changed = await restoreConfigFromChain()
    if (changed >= 0) { renderContacts(); updateCfgBackupNote(); refreshNameSurfaces() }
    if (changed > 0) setStatus(`⤓ Restored — ${changed} contact${changed > 1 ? 's' : ''} added/updated from your backup.`, 'ok')
    else setStatus('Config restore: nothing new to merge (already up to date).', 'ok')
  } catch (e) {
    setStatus(`Restore failed: ${(e).message}`, 'error')
  } finally { btn.disabled = false }
}

function openContactsModal() {
  renderContacts()
  updateCfgBackupNote()
  resolveAvatarsThen([...Object.keys(contacts), ...Object.keys(seenAliases)], renderContacts)
  $('contactsModal').style.display = 'flex'
}
function closeContactsModal() { $('contactsModal').style.display = 'none' }

function renderContacts() {
  const host = $('contactsBody')
  host.innerHTML = ''
  const byName = (a, b) => a[1].localeCompare(b[1])
  const saved = Object.entries(contacts).sort(byName)
  const seen = Object.entries(seenAliases).sort(byName)
  host.append(contactsSection(`Saved (${saved.length})`, saved, 'saved', 'No saved contacts yet — save senders from your inbox, or add one above.'))
  host.append(contactsSection(`Seen, not saved (${seen.length})`, seen, 'seen', 'No unsaved names seen yet.'))
}

function contactsSection(title, rows, kind, empty) {
  const sec = document.createElement('div')
  sec.className = 'token-section'
  const head = document.createElement('div')
  head.className = 'token-section-head'; head.style.cursor = 'default'
  head.innerHTML = `<span class="token-section-label">${title}</span>`
  sec.append(head)
  if (rows.length === 0) {
    const p = document.createElement('p'); p.className = 'muted'; p.style.fontSize = '12px'; p.textContent = empty
    sec.append(p); return sec
  }
  for (const [pk, alias] of rows) sec.append(contactRow(pk, alias, kind))
  return sec
}

function contactRow(pk, alias, kind) {
  const row = document.createElement('div')
  row.className = 'contact-row'
  row.innerHTML = `${avatarHtml(pk, 24)} <span class="contact-name">@${escapeHtml(alias)}</span> <span class="copy-id" data-copy="${pk}" title="${pk} — click to copy">${short(pk)}</span>`
  const acts = document.createElement('span')
  acts.className = 'contact-acts'
  const mkBtn = (label, fn) => {
    const b = document.createElement('button'); b.textContent = label; b.className = 'secondary'; b.onclick = fn; return b
  }
  if (kind === 'saved') {
    acts.append(
      mkBtn('Rename', () => {
        const n = prompt('New name for this contact:', alias)
        if (n == null) return
        const nm = n.replace(/^@+/, '').trim()
        if (nm) { saveContact(pk, nm, true); renderContacts(); refreshNameSurfaces() }
      }),
      mkBtn('Remove', () => { removeContact(pk); renderContacts(); refreshNameSurfaces() }),
    )
  } else {
    acts.append(
      mkBtn('Save', () => { saveContact(pk, alias); renderContacts(); refreshNameSurfaces() }),
      mkBtn('Ignore', () => { ignoreSeen(pk); renderContacts() }),
    )
  }
  row.append(acts)
  return row
}

function onAddContact() {
  const pk = val('contactPk').toLowerCase()
  const name = val('contactName').replace(/^@+/, '').trim()
  if (pk.length !== 66 && pk.length !== 130) { toast('Enter a valid pubkey (66 or 130 hex chars)'); return }
  if (!/^[0-9a-f]+$/.test(pk)) { toast('Pubkey must be hex'); return }
  if (name === '') { toast('Enter a name for this contact'); return }
  saveContact(pk, name, true)
  ;($('contactPk')).value = ''
  ;($('contactName')).value = ''
  renderContacts(); refreshNameSurfaces()
  toast(`Saved @${name}`)
}

let cvObjectUrl = null
let cvBackObjectUrl = null
let cvPreviewObjectUrl = null
let currentCollection = null
let cvNote = null
let cvNoteRefreshId = null
const NFTSALE_ORIGIN = 'https://nft.sale'
let cvGiftWif = null

function setCvStatus(msg, kind = 'info') {
  const el = $('cvStatus')
  el.textContent = msg
  el.className = `cv-status ${kind === 'info' ? '' : kind}`.trim()
}

function cvGetButtons() {
  return (['cvGet', 'cvGetTop'].map(id => document.getElementById(id)).filter(Boolean))
}
function setCvGetLabel(text) { for (const b of cvGetButtons()) b.textContent = text }
function setCvGetDisabled(disabled) { for (const b of cvGetButtons()) b.disabled = disabled }

function reflectCvOwnership(info) {
  const buyable = info.fees != null
  const another = document.getElementById('cvBuyAnother')
  if (cvGiftWif) { setCvGetDisabled(!buyable); if (another) another.style.display = 'none'; return }
  const owns = store.active().some(t => t.collectionId === info.tx1Ref)
  if (owns && buyable) {
    for (const b of cvGetButtons()) { b.disabled = true; b.textContent = '✓ You own a copy'; b.classList.add('owned') }
    if (another) another.style.display = ''
  } else {
    for (const b of cvGetButtons()) { b.disabled = !buyable; b.textContent = 'Get a copy'; b.classList.remove('owned') }
    if (another) another.style.display = 'none'
  }
}

function parseHashRoute() {
  const raw = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  if (!raw) return null
  const params = new URLSearchParams(raw)
  const aff = params.get('aff')
  if (aff != null && aff !== '') incomingAff = aff
  const c = params.get('c')
  if (!c) return null
  return { c, h: params.get('h'), g: params.get('g'), src: params.get('src') }
}

async function loadCollection(tx1Ref, holderPubKeyHint, opts = {}) {
  let template
  let publisherPubKeyHex = null
  let storefront = null
  let hasContentFile = false
  let contentMime = null
  for (let i = 0; i < (opts.light ? 1 : 6); i++) {
    let hex
    try { hex = await provider.getOutputScriptHexCapped(tx1Ref, i, 8 * 1024 * 1024) }
    catch { hex = null }
    if (hex == null) { if (template != null) break; continue }
    if (hex === 'oversized') { hasContentFile = true; continue }
    const script = LockingScript.fromHex(hex)
    const t = parseTemplateScript(script)
    if (t) { template = t.fields; publisherPubKeyHex = t.publisherPubKeyHex }
    const s = parseStorefrontScript(script)
    if (s) storefront = s.fields
    const ff = parseFileScript(script)
    if (ff) { hasContentFile = true; contentMime = ff.fields.mimeType }
    if (template != null && storefront != null) break
  }
  if (!template) throw new Error('not a SMART NFTs collection (no template output in TX1)')
  if (opts.light) hasContentFile = template.fileHash != null
  const rules = decodeTokenRules(template.tokenRules)
  let fees = null
  if (template.covenantScript) {
    try {
      const ed = parseEditionScript(LockingScript.fromHex(template.covenantScript))
      if (ed) fees = { publisher: ed.terms.publisherFeeSats, holder: ed.terms.holderFeeSats }
    } catch { }
  }
  let bondSats = 0
  if (holderPubKeyHint !== undefined && template.covenantScript) {
    const sellerPub = holderPubKeyHint ?? publisherPubKeyHex
    if (sellerPub != null) {
      try {
        const tip = await resolveHolderEdition(provider, { tx1RefHex: tx1Ref, holderPubKeyHex: sellerPub, templateCovenantHex: template.covenantScript })
        if (tip) bondSats = tip.tokenSats ?? 0
      } catch { }
    }
  }
  const cover = storefront?.coverBytes
    ? { mimeType: storefront.coverMimeType ?? 'application/octet-stream', bytes: storefront.coverBytes }
    : null
  const backCover = storefront?.backCoverBytes && (storefront.backCoverMimeType ?? '').toLowerCase().startsWith('image/')
    ? { mimeType: storefront.backCoverMimeType ?? 'image/jpeg', bytes: storefront.backCoverBytes }
    : null
  return {
    tx1Ref, name: template.tokenName, description: storefront?.description ?? '',
    cover, backCover, encrypted: rules.isEncrypted, replicable: rules.isReplicable, hasContentFile, contentMime,
    fileHash: template.fileHash ?? null,
    license: template.license ?? null, licenseRef: template.licenseRef ?? null,
    publisherPubKeyHex, fees, covenantHex: template.covenantScript, bondSats,
  }
}

function renderCollectionView(info, opts) {
  $('cvTitle').textContent = info.name || 'Untitled collection'
  const coverHost = $('cvCover')
  coverHost.innerHTML = ''
  if (cvObjectUrl) { URL.revokeObjectURL(cvObjectUrl); cvObjectUrl = null }
  if (cvBackObjectUrl) { URL.revokeObjectURL(cvBackObjectUrl); cvBackObjectUrl = null }
  if (cvPreviewObjectUrl) { URL.revokeObjectURL(cvPreviewObjectUrl); cvPreviewObjectUrl = null }
  if (info.cover) {
    cvObjectUrl = URL.createObjectURL(new Blob([new Uint8Array(info.cover.bytes)], { type: info.cover.mimeType }))
    const img = document.createElement('img'); img.src = cvObjectUrl; img.className = 'cv-cover-img'
    coverHost.append(img)
    if (info.backCover) {
      cvBackObjectUrl = URL.createObjectURL(new Blob([new Uint8Array(info.backCover.bytes)], { type: info.backCover.mimeType }))
      let showingBack = false
      const flip = document.createElement('button'); flip.type = 'button'; flip.className = 'cv-flip'
      flip.textContent = '⇄ Back'; flip.title = 'Flip the cover'
      flip.onclick = () => {
        showingBack = !showingBack
        img.src = showingBack ? cvBackObjectUrl : cvObjectUrl
        flip.textContent = showingBack ? '⇄ Front' : '⇄ Back'
      }
      coverHost.append(flip)
    }
  } else if (opts?.coverUrl) {
    const img = document.createElement('img'); img.className = 'cv-cover-img'; img.src = opts.coverUrl
    img.onerror = () => { img.remove(); if (coverHost.childElementCount === 0) coverHost.innerHTML = '<div class="cv-cover-ph">🎴</div>' }
    coverHost.append(img)
  } else {
    coverHost.innerHTML = '<div class="cv-cover-ph">🎴</div>'
  }
  const prevHost = $('cvPreview')
  prevHost.innerHTML = ''
  const contentIsAudio = info.contentMime != null ? mimeCategory(info.contentMime) === 'audio'
    : info.contentCategory != null ? info.contentCategory === 'audio'
    : info.hasContentFile
  const pubForPreview = info.publisherPubKeyHex
  if (pubForPreview != null && contentIsAudio) {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'secondary'
    btn.textContent = '🎧 Preview'
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = '⏳ Loading preview…'
      try {
        const clip = await resolvePreview(provider, pubForPreview, info.tx1Ref)
        if (!clip) { btn.textContent = '🔇 No preview yet'; return }
        if (cvPreviewObjectUrl) URL.revokeObjectURL(cvPreviewObjectUrl)
        cvPreviewObjectUrl = URL.createObjectURL(new Blob([new Uint8Array(clip.bytes)], { type: clip.mimeType || 'audio/mpeg' }))
        const audio = document.createElement('audio'); audio.controls = true; audio.autoplay = true; audio.src = cvPreviewObjectUrl
        audio.style.width = '100%'
        audio.setAttribute('controlsList', 'nodownload')
        const ext = /mp4|m4a|aac/i.test(clip.mimeType || '') ? 'm4a' : 'mp3'
        const base = (info.name || 'preview').replace(/[\/\\:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'preview'
        const dl = document.createElement('a'); dl.href = cvPreviewObjectUrl; dl.download = `${base}.${ext}`
        dl.textContent = '⬇ Download'; dl.title = 'Download the preview clip'
        dl.style.cssText = 'display:inline-block;margin-top:6px;font-size:12px;color:var(--muted);text-decoration:none'
        prevHost.replaceChildren(audio, dl)
      } catch (e) {
        btn.disabled = false; btn.textContent = '🎧 Preview'
        setCvStatus(`Preview failed: ${(e).message}`, 'error')
      }
    }
    prevHost.append(btn)
  }
  const badges = []
  if (info.replicable) badges.push('<span class="badge">♾ Unlimited editions</span>')
  if (info.encrypted) badges.push('<span class="badge" style="background:#9e6a03;color:#1a1206">🔒 Holders only</span>')
  else if (info.hasContentFile) badges.push('<span class="badge" style="background:#21262d;color:var(--fg)">📎 Embedded file</span>')
  if (info.license) {
    const ref = info.licenseRef ? ` title="Full terms: ${escapeHtml(info.licenseRef)}"` : ' title="Immutable licence — fixed at mint, travels with the coin"'
    badges.push(`<span class="badge" style="background:#1f6feb;color:#fff"${ref}>📜 ${escapeHtml(info.license)}</span>`)
  }
  $('cvBadges').innerHTML = badges.join('')
  $('cvPublisher').innerHTML = info.publisherPubKeyHex ? `by ${nameChip(info.publisherPubKeyHex)}` : ''
  if (info.publisherPubKeyHex != null) {
    const pub = info.publisherPubKeyHex
    resolveAvatarsThen([pub], () => { $('cvPublisher').innerHTML = `by ${nameChip(pub)}` })
  }
  $('cvDesc').textContent = info.description || '(no description provided)'
  const bond = info.bondSats || 0
  const bondBit = bond > 1 ? ` + ${fmtPrice(bond)} refundable bond` : ''
  const bondTail = bond > 1 ? `; the ${fmtPrice(bond)} bond is reclaimable by burning your copy` : ''
  if (info.fees) {
    const total = info.fees.publisher + info.fees.holder + bond
    $('cvPrice').innerHTML = `Get your own copy — <b title="${total.toLocaleString()} sats">${fmtPrice(total)}</b> <span class="muted">(publisher ${info.fees.publisher} + holder ${info.fees.holder}${bondBit}, plus a small network fee${bondTail})</span>`
  } else {
    $('cvPrice').innerHTML = '<span class="muted">This collection is not a replicable edition.</span>'
  }
  reflectCvOwnership(info)
  const holdsIt = store.active().some(t => t.collectionId === info.tx1Ref)
  showViewButton(info, holdsIt)
  $('collectionView').style.display = 'flex'
}

function showViewButton(info, show) {
  const vb = $('cvView')
  if (show && info.hasContentFile) {
    vb.textContent = info.encrypted ? '🔓 View content' : 'View content'
    vb.style.display = ''
  } else {
    vb.style.display = 'none'
  }
}

function cacheHostFrom(srcHost) {
  let host = (srcHost || '').trim().toLowerCase()
  if (!host && document.referrer) {
    try { const r = new URL(document.referrer); if (r.origin !== location.origin) host = r.hostname.toLowerCase() } catch { }
  }
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null
}

async function fetchListingCache(host, collectionId) {
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 4000)
    const resp = await fetch(`https://${host}/listings.json`, { signal: ctl.signal, mode: 'cors' })
    clearTimeout(timer)
    if (!resp.ok) return null
    const data = await resp.json()
    const it = (data.listings ?? []).find(l => String(l.collectionId).toLowerCase() === collectionId.toLowerCase())
    if (!it || typeof it.cover !== 'string') return null
    return {
      title: String(it.title ?? ''), description: String(it.description ?? ''),
      category: (typeof it.category === 'string' ? it.category : 'other'),
      coverUrl: `https://${host}/${it.cover}`,
    }
  } catch { return null }
}

async function openCollectionView(tx1Ref, holderPubKey, giftWif = null, srcHost = null) {
  cvGiftWif = giftWif
  $('collectionView').style.display = 'flex'
  hideFundPrompt()
  $('cvTitle').textContent = 'Loading…'
  $('cvCover').innerHTML = ''
  $('cvBadges').innerHTML = ''
  $('cvPublisher').textContent = ''
  $('cvDesc').textContent = ''
  $('cvPrice').innerHTML = ''

  const host = cacheHostFrom(srcHost)
  const cache = host ? await fetchListingCache(host, tx1Ref) : null
  if (cache) {
    $('cvTitle').textContent = cache.title || 'Loading…'
    $('cvDesc').textContent = cache.description || ''
    const skImg = document.createElement('img'); skImg.className = 'cv-cover-img'; skImg.src = cache.coverUrl
    skImg.onerror = () => skImg.remove()
    $('cvCover').replaceChildren(skImg)
    $('cvPrice').innerHTML = '<span class="muted">Loading purchase details…</span>'
    setCvStatus('')
  } else {
    setCvStatus('Loading collection from the chain…')
  }

  try {
    let info
    try {
      info = cache ? await loadCollection(tx1Ref, holderPubKey, { light: true }) : await loadCollection(tx1Ref, holderPubKey)
    } catch (lightErr) {
      if (!cache) throw lightErr
      info = await loadCollection(tx1Ref, holderPubKey)
    }
    if (cache) info = { ...info, name: info.name || cache.title, description: info.description || cache.description, contentCategory: cache.category }
    currentCollection = { info, holderPubKey }
    renderCollectionView(info, cache ? { coverUrl: cache.coverUrl } : undefined)
    if (info.cover != null) void registerOgAssets(info)
    if (cvGiftWif) {
      setCvGetLabel('🎁 Get your free copy')
      $('cvPrice').innerHTML = '🎁 <b>A free gift from the publisher</b> <span class="muted">— claim your copy, no payment and no funds needed.</span>'
    }
    setCvStatus('')
    void loadSellerNote(info, holderPubKey ?? info.publisherPubKeyHex)
  } catch (e) {
    currentCollection = null
    $('cvTitle').textContent = 'Collection not found'
    setCvStatus(`Could not load this collection: ${(e).message}`, 'error')
  }
}

function onOpenSalesPage(t) {
  history.replaceState(null, '', `${location.pathname}#c=${t.collectionId}&h=${pubKeyHex}`)
  void openCollectionView(t.collectionId, pubKeyHex)
}

function closeCollectionView() {
  $('collectionView').style.display = 'none'
  if (cvObjectUrl) { URL.revokeObjectURL(cvObjectUrl); cvObjectUrl = null }
  if (cvBackObjectUrl) { URL.revokeObjectURL(cvBackObjectUrl); cvBackObjectUrl = null }
  if (cvPreviewObjectUrl) { URL.revokeObjectURL(cvPreviewObjectUrl); cvPreviewObjectUrl = null }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search)
}

async function currentShareLink() {
  if (!currentCollection) return null
  const { info, holderPubKey } = currentCollection
  const h = holderPubKey ?? pubKeyHex
  return (await shortShareBase(info.tx1Ref, h)) ?? collectionShareUrl(info.tx1Ref, h)
}

async function shareCollectionLink() {
  const link = await currentShareLink()
  if (!link) return
  void navigator.clipboard?.writeText(link)
  setCvStatus('Share link copied to clipboard.')
}

function showQrModal(title, text) {
  const overlay = document.createElement('div')
  overlay.className = 'modal'
  overlay.innerHTML =
    '<div class="modal-box qr-modal-box">' +
    `<div class="modal-head"><span>${escapeHtml(title)}</span><button class="secondary qr-close">✕ Close</button></div>` +
    `<div class="qr-holder">${qrSvg(text)}</div>` +
    `<div class="qr-cap mono">${escapeHtml(text)}</div></div>`
  const close = () => overlay.remove()
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })
  overlay.querySelector('.qr-close')?.addEventListener('click', close)
  document.body.append(overlay)
}

function hideBonus() { const h = $('cvBonus'); h.style.display = 'none'; h.innerHTML = '' }
function showBonus(note, claimable) {
  const host = $('cvBonus')
  host.innerHTML = ''
  if (!note?.bonusValue) { host.style.display = 'none'; return }
  if (!claimable) {
    host.textContent = '🎁 Includes a bonus — claim it after you buy.'
  } else if (note.bonusKind === 'link') {
    const a = document.createElement('a')
    a.href = note.bonusValue; a.target = '_blank'; a.rel = 'noopener'
    a.textContent = '🎁 Claim your bonus ↗'; a.className = 'bonus-claim'
    host.append(a)
  } else {
    host.append(document.createTextNode('🎁 Bonus code: '))
    const code = document.createElement('span'); code.className = 'mono'; code.textContent = note.bonusValue
    const copy = document.createElement('button'); copy.className = 'secondary'; copy.textContent = 'Copy'; copy.style.marginLeft = '8px'
    copy.onclick = () => void navigator.clipboard?.writeText(note.bonusValue)
    host.append(code, copy)
  }
  host.style.display = 'block'
}

async function loadSellerNote(info, sellerPub) {
  cvNote = null
  const noteBox = $('cvNote')
  noteBox.style.display = 'none'
  hideBonus()
  const isMine = sellerPub != null && sellerPub === pubKeyHex
  const holdsIt = store.active().some(t => t.collectionId === info.tx1Ref)
  $('cvNoteEdit').style.display = isMine ? 'block' : 'none'
  ;($('cvNoteText')).value = ''
  ;($('cvNoteHeading')).value = ''
  ;($('cvNoteTags')).value = ''
  ;($('cvBonusValue')).value = ''
  ;($('cvBonusKind')).value = 'none'
  $('cvNoteStatus').textContent = ''
  ;($('cvNoteRefresh')).style.display = 'none'; cvNoteRefreshId = null
  if (sellerPub == null) return
  let current = null
  try {
    const note = await resolveSellerNote(provider, sellerPub, info.tx1Ref)
    if (note) current = note
  } catch { }
  if (current == null && info.covenantHex) {
    try {
      const tip = await resolveHolderEdition(provider, { tx1RefHex: info.tx1Ref, holderPubKeyHex: sellerPub, templateCovenantHex: info.covenantHex })
      if (tip) current = readNoteFromTx(await provider.getSourceTransaction(tip.txId), info.tx1Ref)
    } catch { }
  }
  if (current == null && isMine) {
    const held = store.active().find(t => t.collectionId === info.tx1Ref && (t.sellerNote || t.bonusValue))
    if (held) {
      current = { text: held.sellerNote ?? '', bonusKind: held.bonusKind, bonusValue: held.bonusValue }
      $('cvNoteStatus').textContent = 'This is what you received when you bought — Publish to pass it on.'
    }
  }
  if (current && (current.text || current.bonusValue || current.heading || (current.tags && current.tags.length > 0))) {
    cvNote = current
    paintCvNote(current)
    showBonus(current, holdsIt)
    if (isMine) {
      ;($('cvNoteText')).value = current.text
      ;($('cvNoteHeading')).value = current.heading ?? ''
      ;($('cvNoteTags')).value = (current.tags ?? []).map(t => '#' + t).join(' ')
      if (current.bonusKind && current.bonusValue) {
        ;($('cvBonusKind')).value = current.bonusKind
        ;($('cvBonusValue')).value = current.bonusValue
      }
    }
  }
}

function paintCvNote(note) {
  const box = $('cvNote')
  const parts = []
  if (note.heading) parts.push(`<b>${escapeHtml(note.heading)}</b>`)
  if (note.text) parts.push(`📝 ${escapeHtml(note.text)}`)
  if (note.tags && note.tags.length > 0) parts.push(`<span class="cv-note-tags">${note.tags.map(t => '#' + escapeHtml(t)).join(' ')}</span>`)
  box.innerHTML = parts.join('<br>')
  box.style.display = parts.length > 0 ? 'block' : 'none'
}

function parseTagsInput(s) {
  return s.split(/[\s,]+/).map(t => t.replace(/^#+/, '').trim().toLowerCase()).filter(Boolean)
}

async function onSaveSellerNote() {
  const k = requireKey(); if (k == null) return
  if (!currentCollection) return
  const text = ($('cvNoteText')).value.trim()
  const heading = ($('cvNoteHeading')).value.trim()
  const tags = parseTagsInput(($('cvNoteTags')).value)
  const bonusKindRaw = ($('cvBonusKind')).value
  const bonusValue = ($('cvBonusValue')).value.trim()
  const bonusKind = (bonusKindRaw === 'link' || bonusKindRaw === 'code') ? bonusKindRaw : undefined
  if (!text && !bonusValue && !heading && tags.length === 0) { $('cvNoteStatus').textContent = 'Add a heading, description, tags, or a bonus first.'; return }
  if (bonusValue && !bonusKind) { $('cvNoteStatus').textContent = 'Pick a bonus type (link or code).'; return }
  const note = { text, heading: heading || undefined, tags: tags.length > 0 ? tags : undefined, bonusKind, bonusValue: bonusValue || undefined }
  $('cvNoteStatus').textContent = 'Publishing your note…'
  try {
    const txId = await publishSellerNote(provider, k, currentCollection.info.tx1Ref, note)
    cvNote = note
    paintCvNote(note)
    showBonus(note, true)
    cvNoteRefreshId = currentCollection.info.tx1Ref
    ;($('cvNoteRefresh')).style.display = ''
    $('cvNoteStatus').innerHTML = `Published (${idChip(txId)}). Now hit “Refresh nft.sale” to update the listing.`
  } catch (e) {
    $('cvNoteStatus').textContent = `Failed: ${(e).message}`
  }
}

async function onRefreshNote() {
  if (!cvNoteRefreshId) return
  const btn = $('cvNoteRefresh')
  btn.disabled = true
  $('cvNoteStatus').textContent = 'Asking nft.sale to refresh…'
  try {
    const res = await fetch(`${NFTSALE_ORIGIN}/refresh.php?collection-id=${cvNoteRefreshId}`)
    const first = (await res.text()).trim().split('\n')[0]
    $('cvNoteStatus').textContent = res.ok ? `✓ ${first || 'queued'} — updates on the next curator run.` : `Refresh failed: ${first || res.status}`
  } catch (e) {
    $('cvNoteStatus').textContent = `Refresh request failed (is nft.sale reachable?): ${(e).message}`
  } finally { btn.disabled = false }
}

function showFundPrompt(needed, have) {
  $('cvFundNeed').textContent = `${needed} sats`
  $('cvFundHave').textContent = `${have} sats`
  $('cvFundAddr').textContent = address
  $('cvFundQr').innerHTML = `<div class="qr-holder qr-fund">${qrSvg(bsvPaymentUri(address, needed))}</div>`
  $('cvFund').style.display = 'block'
  setCvStatus('Not enough funds yet — send a little BSV to your wallet, then click “I’ve funded”.', 'error')
  $('cvFund').scrollIntoView({ behavior: 'smooth', block: 'center' })
}
function hideFundPrompt() { $('cvFund').style.display = 'none' }

let buying = false
async function onGetCopy() {
  if (buying || !currentCollection) return
  const k = requireKey(); if (k == null) return
  const { info, holderPubKey } = currentCollection
  if (!info.fees || !info.covenantHex) { setCvStatus('This collection is not a buyable edition.', 'error'); return }
  const sellerPub = holderPubKey ?? info.publisherPubKeyHex
  if (!sellerPub) { setCvStatus('No seller could be determined for this link.', 'error'); return }

  buying = true
  setCvGetDisabled(true)
  try {
    setCvStatus('Finding the seller’s current edition…')
    let tip = await resolveHolderEdition(provider, { tx1RefHex: info.tx1Ref, holderPubKeyHex: sellerPub, templateCovenantHex: info.covenantHex })
    if (!tip) { setCvStatus('This seller has no edition available right now — try another link or ask them to mint one.', 'error'); return }

    if (cvGiftWif) {
      if (!confirm('Add this NFT gift to your wallet now?\n\nIt will be claimed to the wallet on THIS browser and device — make sure this is where you want to keep it.\n\nOr you can cancel and instead claim it later, on a different browser or device, from the same link.')) {
        setCvStatus('No problem — your gift is still waiting. Claim it any time from this link.')
        return
      }
      if (needsSeedBackup()) {
        await new Promise(resolve => showSeedModal(words ?? '', {
          gated: true,
          intro: 'First, secure your new wallet — this seed phrase is the ONLY key to the NFT gift you’re about to claim. Write it down before we add it to your wallet.',
          onDone: () => resolve(),
        }))
      }
      let giftNote = cvNote
      if (!giftNote) { try { giftNote = readNoteFromTx(await provider.getSourceTransaction(tip.txId), info.tx1Ref) } catch { } }
      setCvStatus('🎁 Claiming your free copy…')
      const claimed = await claimGiftEdition(provider, k, {
        giftWif: cvGiftWif, editionTxId: tip.txId, editionOutputIndex: tip.outputIndex, editionLockHex: tip.lockHex, note: giftNote ?? undefined,
      })
      storeEdition({ txId: claimed.replicaOutpoint.txId, outputIndex: claimed.replicaOutpoint.outputIndex, lockHex: claimed.lockHex },
        info.tx1Ref, info.name, tip.terms, giftNote)
      renderTokens()
      rememberGifter()
      showViewButton(info, true)
      cvGiftWif = null
      setCvStatus('✅ Added to your wallet — opening your gift…', 'ok')
      void onView(info.tx1Ref, info.name)
      return
    }

    const publisherCut = tip.terms.publisherFeeSats
    const resellerCut = tip.terms.holderFeeSats
    const price = publisherCut + resellerCut
    const bond = tip.tokenSats
    const priceDetail = `publisher ${publisherCut.toLocaleString()} + holder ${resellerCut.toLocaleString()}`
    let approved = false
    const confirmBuy = (totalSats) => {
      if (approved) return true
      const showBond = bond > 1
      const networkFee = Math.max(0, totalSats - price - (showBond ? bond : 0))
      approved = confirm(
        `Buy a copy of “${info.name}”?\n\n` +
        `Seller's price:   ${price.toLocaleString()} sats  (${priceDetail})\n` +
        (showBond ? `Refundable bond:  ${bond.toLocaleString()} sats  (held in your copy — reclaim by burning)\n` : '') +
        `Network fee:      ${networkFee.toLocaleString()} sats\n` +
        `———————\n` +
        `Total to pay:     ${totalSats.toLocaleString()} sats\n\n` +
        `Instant, on-chain purchase.`)
      return approved
    }

    const needed = price + tip.tokenSats + 1200
    const have = (await getSafeUtxos(provider)).reduce((s, u) => s + u.satoshis, 0)
    if (have < needed) { showFundPrompt(needed, have); return }
    hideFundPrompt()

    let echoNote = cvNote
    if (!echoNote) {
      try { echoNote = readNoteFromTx(await provider.getSourceTransaction(tip.txId), info.tx1Ref) } catch { }
    }

    setCvStatus('Buying your copy — replicating the edition…')
    let bought = null
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        bought = await replicateEdition(provider, k, { editionTxId: tip.txId, editionOutputIndex: tip.outputIndex, editionLockHex: tip.lockHex, terms: tip.terms, note: echoNote ?? undefined, confirmSpend: confirmBuy })
        break
      } catch (e) {
        if ((e).message === SPEND_CANCELLED) throw e
        if (attempt === 2) throw e
        setCvStatus('Another buyer was first — finding the seller’s new edition…')
        const again = await resolveHolderEdition(provider, { tx1RefHex: info.tx1Ref, holderPubKeyHex: sellerPub, templateCovenantHex: info.covenantHex })
        if (!again) throw new Error('the seller’s edition is no longer available')
        tip = again
      }
    }
    if (!bought) return
    storeEdition({ txId: bought.replicaOutpoint.txId, outputIndex: bought.replicaOutpoint.outputIndex, lockHex: bought.lockHex },
      info.tx1Ref, info.name, tip.terms, echoNote)
    renderTokens()
    showViewButton(info, true)
    showBonus(echoNote, true)
    setCvStatus(
      `✅ You own a copy of “${info.name}”! Tx ${short(bought.txId)} — it’s now in your wallet.` +
      (echoNote?.text ? `\n📝 Seller’s note: ${echoNote.text}` : '') +
      (echoNote?.bonusValue ? '\n🎁 Bonus included — claim it below / on the NFT card.' : ''),
    )
    if (info.hasContentFile) void onView(info.tx1Ref, info.name)
  } catch (e) {
    const msg = (e).message
    if (msg === SPEND_CANCELLED) { setCvStatus('Purchase cancelled — nothing was spent.'); return }
    setCvStatus(`Could not complete the purchase: ${msg}`, 'error')
  } finally {
    buying = false
    reflectCvOwnership(info)
  }
}

async function onBroadcast(t) {
  const k = requireKey(); if (k == null) return
  const text = prompt(`Announce to all holders of “${t.collectionName ?? 'this collection'}”.\n\nPublic, one transaction, reaches every current holder. Message:`)
  if (text == null) return
  const trimmed = text.trim()
  if (!trimmed) { setStatus('Announcement was empty.', 'error'); return }
  setStatus('Publishing announcement to holders…')
  try {
    const txId = await publishBroadcast(provider, k, t.collectionId, trimmed, getMyAlias())
    latestBroadcast.set(t.collectionId, { text: trimmed, txId, height: 0 })
    renderTokens()
    setStatusHtml(`📣 Announcement published (${idChip(txId)}). Holders see it when they check Updates.`, 'ok')
  } catch (e) {
    setStatus(`Broadcast failed: ${(e).message}`, 'error')
  }
}

async function onGiftCopies(t) {
  const k = requireKey(); if (k == null) return
  let claimCost = 0, publisherCut = 0
  try {
    const ed = parseEditionScript(LockingScript.fromHex(t.lockHex ?? ''))
    if (ed) {
      claimCost = ed.terms.publisherFeeSats + ed.terms.holderFeeSats
      publisherCut = ed.terms.publisherFeeSats
    }
  } catch { }
  const bond = t.tokenSats ?? EDITION_BOND_SATS
  const MINER = 700
  const fundEach = bond + claimCost + MINER + 800
  const iAmPublisher = t.publisherPubKeyHashHex != null && t.publisherPubKeyHashHex === myPubKeyHash()
  const netEach = bond + MINER + (iAmPublisher ? 0 : publisherCut)
  const roleLine = iAmPublisher
    ? `You're the publisher: your price + fees return on each claim, so a claimed gift nets ≈ ${netEach.toLocaleString()} sats (the ${bond.toLocaleString()}-sat bond moves to the recipient, + miner fee).`
    : `As a reseller: your share returns, but the publisher's ${publisherCut.toLocaleString()}-sat cut and the ${bond.toLocaleString()}-sat bond don't — so a claimed gift nets ≈ ${netEach.toLocaleString()} sats (think of it as marketing spend).`
  const countStr = prompt(
    `Create free-gift links for “${t.collectionName ?? 'this collection'}”.\n\n` +
    `How many?  Each voucher is pre-funded with ~${fundEach.toLocaleString()} sats now; unclaimed links are fully recoverable via “♻ Reclaim gifts”.\n\n${roleLine}`, '10')
  if (countStr == null) return
  const count = Math.max(1, Math.min(500, parseInt(countStr, 10) || 0))
  const total = count * fundEach
  if (!confirm(
    `Fund ${count} gift link(s):\n` +
    `• ~${total.toLocaleString()} sats locked now (recoverable if unclaimed)\n` +
    `• net ≈ ${(count * netEach).toLocaleString()} sats once all ${count} are claimed\n\nProceed?`)) return
  setStatus(`Creating ${count} funded gift link(s)…`)
  try {
    const { nextIndex } = await scanGiftVouchers(provider, k, t.collectionId)
    const { fundingTxId, voucherWifs } = await createGiftVouchers(provider, k, { tx1RefHex: t.collectionId, startIndex: nextIndex, count, fundEachSats: fundEach })
    const giftBase = await shortShareBase(t.collectionId, pubKeyHex)
    const links = voucherWifs.map(wif => giftBase ? `${giftBase}#g=${wif}` : collectionShareUrl(t.collectionId, pubKeyHex, wif))
    setStatus(`✅ ${count} gift link(s) funded (tx ${short(fundingTxId)}). Recover them anytime with "Gift links".`, 'ok')
    showGiftLinksModal(t.collectionName ?? 'Free gift', links)
  } catch (e) {
    setStatus(`Gift creation failed: ${(e).message}`, 'error')
  }
}

async function onViewGiftLinks(t) {
  const k = requireKey(); if (k == null) return
  setStatus('Recovering your gift links from chain…')
  try {
    const scan = await scanGiftVouchers(provider, k, t.collectionId)
    const giftBase = await shortShareBase(t.collectionId, pubKeyHex)
    const links = scan.live.map(v => giftBase ? `${giftBase}#g=${v.wif}` : collectionShareUrl(t.collectionId, pubKeyHex, v.wif))
    if (links.length === 0) {
      setStatus(scan.claimedCount > 0
        ? `No unclaimed gift links left — all ${scan.claimedCount} have been claimed.`
        : 'No gift links found for this collection yet.', 'info')
      return
    }
    showGiftLinksModal(t.collectionName ?? 'Gift links', links)
    setStatus(`Recovered ${links.length} unclaimed gift link(s)${scan.claimedCount > 0 ? ` (${scan.claimedCount} already claimed)` : ''}.`, 'ok')
  } catch (e) {
    setStatus(`Recover gift links failed: ${(e).message}`, 'error')
  }
}

async function onReclaimGifts(t) {
  const k = requireKey(); if (k == null) return
  setStatus('Scanning for unclaimed gift links…')
  let scan
  try { scan = await scanGiftVouchers(provider, k, t.collectionId) }
  catch (e) { setStatus(`Scan failed: ${(e).message}`, 'error'); return }
  if (scan.live.length === 0) {
    setStatus(scan.claimedCount > 0 ? `Nothing to reclaim — all ${scan.claimedCount} gift links were claimed.` : 'No unclaimed gift links to reclaim.', 'ok')
    return
  }
  if (!confirm(
    `Reclaim ${scan.live.length} UNCLAIMED gift link${scan.live.length > 1 ? 's' : ''} for “${t.collectionName ?? 'this collection'}”?\n\n` +
    `This INVALIDATES those links and returns their pre-funded sats to your wallet (minus the network fee). ` +
    `Already-claimed gifts are unaffected.`)) return
  setStatus('Reclaiming unclaimed gifts…')
  try {
    const r = await sweepGiftVouchers(provider, k, scan.live)
    if (r == null) { setStatus('Nothing to reclaim — the links may have just been claimed.', 'ok'); return }
    setStatus(`♻ Reclaimed ${r.swept} unclaimed gift${r.swept > 1 ? 's' : ''} — ${r.reclaimedSats.toLocaleString()} sats back to your wallet. Tx ${short(r.txId)}.`, 'ok')
    void refreshBalance()
  } catch (e) {
    setStatus(`Reclaim failed: ${(e).message}`, 'error')
  }
}

function showGiftLinksModal(title, links) {
  const overlay = document.createElement('div')
  overlay.className = 'modal'
  const rows = links.map((l, i) =>
    `<div class="gift-row"><span class="mono gift-link">${escapeHtml(l)}</span>` +
    `<button class="secondary gift-qr" data-i="${i}">QR</button></div>`).join('')
  overlay.innerHTML =
    '<div class="modal-box gift-modal-box">' +
    `<div class="modal-head"><span>🎁 ${escapeHtml(title)} — ${links.length} gift link${links.length > 1 ? 's' : ''}</span>` +
    '<button class="secondary gift-close">✕ Close</button></div>' +
    '<div class="row" style="margin-bottom:10px"><button class="gift-copyall">Copy all</button>' +
    '<button class="secondary gift-download">Download .txt</button></div>' +
    `<div class="gift-list">${rows}</div>` +
    '<p class="muted" style="font-size:11px;margin-top:10px">Each link is single-use and pre-funded. Hand them out (email, DM, in person); the recipient claims a free copy and can resell it — your publisher fee returns on every resale.</p>' +
    '</div>'
  const close = () => overlay.remove()
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })
  overlay.querySelector('.gift-close')?.addEventListener('click', close)
  overlay.querySelector('.gift-copyall')?.addEventListener('click', () => void navigator.clipboard?.writeText(links.join('\n')))
  overlay.querySelector('.gift-download')?.addEventListener('click', () => {
    const blob = new Blob([links.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'smart-nfts-gift-links.txt'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  overlay.querySelectorAll('.gift-qr').forEach(b => b.addEventListener('click', () => {
    showQrModal('Scan to claim a free copy', links[parseInt((b).dataset.i ?? '0', 10)])
  }))
  document.body.append(overlay)
}

async function onViewBuyers(t) {
  if (t.publisherPubKeyHashHex == null) return
  const title = t.collectionName ?? 'Collection'
  const overlay = document.createElement('div')
  overlay.className = 'modal'
  overlay.innerHTML =
    '<div class="modal-box gift-modal-box">' +
    `<div class="modal-head"><span>👥 Buyers of ${escapeHtml(title)}</span>` +
    '<span class="row" style="gap:6px"><button class="secondary buyers-refresh">🔄 Refresh</button>' +
    '<button class="secondary buyers-close">✕ Close</button></span></div>' +
    '<p class="buyers-status muted" style="font-size:12px">Scanning your sales…</p>' +
    '<div class="buyers-toolbar" hidden><label class="buyers-selall"><input type="checkbox" class="buyers-all" /> Select all</label>' +
    '<button class="buyers-msg-sel" disabled>✉ Message selected (0)</button></div>' +
    '<div class="buyers-list"></div>' +
    '<p class="muted" style="font-size:11px;margin-top:10px">Buyers at point of sale (when they replicated a copy). Onward transfers aren’t visible to you, so this isn’t a current-owner list.</p>' +
    '</div>'
  const close = () => overlay.remove()
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })
  overlay.querySelector('.buyers-close')?.addEventListener('click', close)
  document.body.append(overlay)

  const statusEl = overlay.querySelector('.buyers-status')
  const listEl = overlay.querySelector('.buyers-list')
  const refreshBtn = overlay.querySelector('.buyers-refresh')
  const toolbarEl = overlay.querySelector('.buyers-toolbar')
  const allEl = overlay.querySelector('.buyers-all')
  const msgSelBtn = overlay.querySelector('.buyers-msg-sel')
  const selected = new Set()
  let lastBuyers = []
  const updateSelUI = () => {
    msgSelBtn.disabled = selected.size === 0
    msgSelBtn.textContent = `✉ Message selected (${selected.size})`
    allEl.checked = lastBuyers.length > 0 && lastBuyers.every(b => selected.has(b.pubKeyHex))
  }
  const render = (res) => {
    lastBuyers = res.buyers
    if (res.buyers.length === 0) {
      statusEl.textContent = `No buyers yet — no one has replicated a copy (scanned ${res.scanned} tx${res.scanned === 1 ? '' : 's'}).`
      toolbarEl.hidden = true
      return
    }
    statusEl.textContent = `${res.buyers.length} buyer${res.buyers.length > 1 ? 's' : ''}${res.capped ? ` · most recent ${res.scanned} txs` : ''}`
    toolbarEl.hidden = false
    listEl.innerHTML = ''
    for (const b of res.buyers) {
      const row = document.createElement('div'); row.className = 'buyer-row'
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'buyer-sel'; cb.checked = selected.has(b.pubKeyHex)
      cb.onchange = () => { if (cb.checked) selected.add(b.pubKeyHex); else selected.delete(b.pubKeyHex); updateSelUI() }
      const who = document.createElement('div'); who.className = 'buyer-who'
      who.innerHTML = `${nameChip(b.pubKeyHex)}${b.count > 1 ? ` <span class="muted">×${b.count}</span>` : ''}`
      const msg = document.createElement('button'); msg.className = 'secondary'; msg.textContent = '✉ Message'
      msg.onclick = () => composeTo(b.pubKeyHex, 'this buyer', { product: title, recipientRole: 'buyer' })
      row.append(cb, who, msg)
      listEl.append(row)
    }
    updateSelUI()
  }
  allEl.onchange = () => {
    if (allEl.checked) lastBuyers.forEach(b => selected.add(b.pubKeyHex)); else selected.clear()
    listEl.querySelectorAll('.buyer-sel').forEach((cb, i) => { (cb).checked = selected.has(lastBuyers[i].pubKeyHex) })
    updateSelUI()
  }
  msgSelBtn.onclick = () => { if (selected.size) openCompose([...selected], { who: `${selected.size} buyers`, product: title, recipientRole: 'buyer' }) }
  const scan = async () => {
    refreshBtn.disabled = true; listEl.innerHTML = ''; statusEl.textContent = 'Scanning your sales…'
    try {
      const res = await scanCollectionBuyers(provider, {
        collectionId: t.collectionId,
        publisherPubKeyHashHex: t.publisherPubKeyHashHex,
        onProgress: (done, total) => { statusEl.textContent = `Scanning your sales… ${done}/${total}` },
      })
      render(res)
      if (res.buyers.length) resolveAvatarsThen(res.buyers.map(b => b.pubKeyHex), () => { if (document.body.contains(overlay)) render(res) })
    } catch (e) {
      statusEl.textContent = `Scan failed: ${(e).message}`
    } finally {
      refreshBtn.disabled = false
    }
  }
  refreshBtn.onclick = () => void scan()
  await scan()
}

let salesCache = null
let salesHeight = 0
const salesNames = new Map()
const BLOCKS_PER_DAY = 144

const fmtBsv = (sats) => (sats / 1e8).toFixed(8).replace(/\.?0+$/, '') || '0'
const giftsDone = new WeakSet()

function p2pkhInputPubKeyHash(input) {
  try {
    const chunks = Script.fromBinary(input.script).chunks
    if (chunks == null || chunks.length < 2) return null
    const pub = chunks[chunks.length - 1].data
    if (pub == null || (pub.length !== 33 && pub.length !== 65)) return null
    return hexOf(hash160Bytes(pub)).toLowerCase()
  } catch { return null }
}

async function renderSalesTab(force = false) {
  const statsEl = $('salesStats'); const statusEl = $('salesStatus'); const bodyEl = $('salesBody')
  const refreshBtn = $('btnSalesRefresh')
  if (salesCache != null && !force) { paintSales(salesCache, salesHeight); return }
  refreshBtn.disabled = true; statsEl.innerHTML = ''; bodyEl.innerHTML = ''; statusEl.textContent = 'Scanning your sales…'
  try {
    const height = await provider.getChainHeight().catch(() => 0)
    const res = await scanMySales(provider, { myPubKeyHex: pubKeyHex, myHash: myPubKeyHash(),
      onProgress: (d, t) => { statusEl.textContent = `Scanning your sales… ${d}/${t}` } })
    salesCache = res; salesHeight = height
    const cids = [...new Set(res.sales.map(s => s.collectionId))]
    await Promise.all(cids.map(async c => { if (!salesNames.has(c)) { try { salesNames.set(c, await resolveCollectionName(c)) } catch { salesNames.set(c, short(c)) } } }))
    paintSales(res, height)
    void fillGiftStats(res, height)
    const keys = res.sales.map(s => s.buyerPubKeyHex)
    if (keys.length) resolveAvatarsThen(keys, () => { if (salesCache === res) paintSales(res, height) })
  } catch (e) { statusEl.textContent = `Scan failed: ${(e).message}` } finally { refreshBtn.disabled = false }
}

function statTile(label, value, sub) {
  return `<div class="stat-tile"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-val">${value}</div><div class="stat-sub muted">${escapeHtml(sub)}</div></div>`
}

function paintSales(res, height) {
  const statsEl = $('salesStats'); const statusEl = $('salesStatus'); const bodyEl = $('salesBody')
  const monthFloor = height > 0 ? height - 30 * BLOCKS_PER_DAY : 0
  const inMonth = (h) => height === 0 || h === 0 || h >= monthFloor
  const S = res.sales
  const earnOf = (x) => x.publisherFeeSats + x.holderFeeSats
  const earned = S.reduce((s, x) => s + earnOf(x), 0)
  const earnedMonth = S.filter(x => inMonth(x.height)).reduce((s, x) => s + earnOf(x), 0)
  const salesMonth = S.filter(x => inMonth(x.height)).length
  const uniqueBuyers = new Set(S.map(x => x.buyerPubKeyHex.toLowerCase())).size
  const top = res.asCreator[0] ?? res.asReseller[0]
  const noHeight = height === 0
  const monthLbl = noHeight ? 'period n/a' : 'this month'

  const giftsKnown = giftsDone.has(res)
  const giftCount = giftsKnown ? S.filter(s => s.isGift).length : 0
  const giftEarned = giftsKnown ? S.filter(s => s.isGift).reduce((s, x) => s + earnOf(x), 0) : 0
  const netEarned = earned - giftEarned
  const giftVal = !giftsKnown ? '<span class="muted">…</span>' : key == null ? '—' : String(giftCount)
  const netVal = key == null ? '—'
    : !giftsKnown ? '<span class="muted">…</span>'
    : `${netEarned.toLocaleString()} <span class="stat-unit">sat</span>`
  const netSub = !giftsKnown ? 'gifts excluded — checking…'
    : giftCount === 0 ? 'no gift claims — same as earned'
    : `${fmtBsv(netEarned)} BSV · excl. ${giftCount} gift claim${giftCount === 1 ? '' : 's'} (−${giftEarned.toLocaleString()} sat)`
  statsEl.innerHTML = '<div class="stat-grid">' +
    statTile('Sales', String(S.length), `${salesMonth} ${monthLbl}`) +
    statTile('Earned', `${earned.toLocaleString()} <span class="stat-unit">sat</span>`, `${fmtBsv(earned)} BSV · ${earnedMonth.toLocaleString()} sat ${monthLbl}`) +
    statTile('Net revenue', netVal, netSub) +
    statTile('Unique buyers', String(uniqueBuyers), top != null ? `top: ${escapeHtml(salesNames.get(top.collectionId) ?? short(top.collectionId))}` : 'across your sales') +
    statTile('Gifts', giftVal, 'claimed via gift links') +
    '</div>'
  statusEl.textContent = `${S.length} sale${S.length === 1 ? '' : 's'}${res.capped ? ` · most recent ${res.scanned} txs` : ''}${noHeight ? ' · block height unavailable, periods approximate' : ''}`
  bodyEl.innerHTML = ''
  bodyEl.append(salesUnified(S, salesNames))
}

function salesUnified(sales, names) {
  const sec = document.createElement('div'); sec.className = 'token-section'
  const head = document.createElement('div'); head.className = 'token-section-head'; head.style.cursor = 'default'
  head.innerHTML = '<span class="token-section-label">🧾 Your sales — each purchase once, with what you earned</span>' + ` <span class="count">${sales.length}</span>`
  sec.append(head)
  if (sales.length === 0) {
    const p = document.createElement('p'); p.className = 'muted'; p.style.fontSize = '12px'; p.textContent = 'No sales yet.'; sec.append(p); return sec
  }
  const byCol = new Map()
  for (const s of sales) { const a = byCol.get(s.collectionId) ?? []; a.push(s); byCol.set(s.collectionId, a) }
  const groups = [...byCol.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [cid, list] of groups) {
    const name = names.get(cid) ?? short(cid)
    const groupEarned = list.reduce((s, x) => s + x.publisherFeeSats + x.holderFeeSats, 0)
    const buyerKeys = new Map()
    for (const s of list) if (!buyerKeys.has(s.buyerPubKeyHex.toLowerCase())) buyerKeys.set(s.buyerPubKeyHex.toLowerCase(), s.buyerPubKeyHex)
    const uniq = [...buyerKeys.values()]
    const card = document.createElement('div'); card.className = 'sales-group'
    const giftN = list.filter(s => s.isGift).length
    const gh = document.createElement('button'); gh.type = 'button'; gh.className = 'sales-group-head'
    gh.innerHTML = `<span class="chev">▸</span> <span class="sales-group-name">${escapeHtml(name)}</span>` +
      `<span class="sales-group-meta">${list.length} sale${list.length === 1 ? '' : 's'} · ${uniq.length} buyer${uniq.length === 1 ? '' : 's'} · ${groupEarned.toLocaleString()} sat${giftN > 0 ? ` · <span class="gift-badge">🎁 ${giftN} gifted</span>` : ''}</span>`
    const body = document.createElement('div'); body.className = 'buyers-list'; body.hidden = true
    const msgAll = document.createElement('button'); msgAll.className = 'secondary'; msgAll.style.margin = '6px 0'
    msgAll.textContent = `✉ Message all ${uniq.length}`
    msgAll.onclick = () => openCompose(uniq, { who: `${uniq.length} buyer${uniq.length === 1 ? '' : 's'}`, product: name, recipientRole: 'buyer' })
    body.append(msgAll)
    for (const s of [...list].sort((a, b) => (b.time || b.height || 0) - (a.time || a.height || 0))) {
      const row = document.createElement('div'); row.className = 'buyer-row'
      const who = document.createElement('div'); who.className = 'buyer-who'
      const date = s.time ? new Date(s.time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : (s.height ? '' : 'pending')
      const amt = s.publisherFeeSats + s.holderFeeSats
      const kind = s.publisherFeeSats > 0 && s.holderFeeSats > 0 ? 'both fees' : s.publisherFeeSats > 0 ? 'publisher fee' : 'holder fee'
      who.innerHTML = `${nameChip(s.buyerPubKeyHex)} <span class="sale-tag muted">${date ? escapeHtml(date) + ' · ' : ''}${kind} · +${amt.toLocaleString()} sat</span>${s.isGift ? ' <span class="gift-badge">🎁 gift</span>' : ''}`
      const msg = document.createElement('button'); msg.className = 'secondary'; msg.textContent = '✉ Message'
      msg.onclick = () => composeTo(s.buyerPubKeyHex, 'this buyer', { product: name, recipientRole: 'buyer' })
      row.append(who, msg); body.append(row)
    }
    gh.onclick = () => { body.hidden = !body.hidden; gh.querySelector('.chev').textContent = body.hidden ? '▸' : '▾' }
    card.append(gh, body); sec.append(card)
  }
  return sec
}

async function fillGiftStats(res, height) {
  if (key != null) {
    const byCid = new Map()
    for (const s of res.sales) if (s.publisherFeeSats > 0) { const a = byCid.get(s.collectionId) ?? []; a.push(s); byCid.set(s.collectionId, a) }
    for (const [cid, list] of byCid) {
      let hashes
      try { hashes = await scanVoucherHashes(provider, key, cid) } catch { continue }
      if (hashes.size === 0) continue
      await Promise.all(list.map(async s => {
        try {
          const tx = await provider.getSourceTransaction(s.txId)
          for (let i = 1; i < tx.inputs.length; i++) {
            const pkh = p2pkhInputPubKeyHash(tx.inputs[i])
            if (pkh != null && hashes.has(pkh)) { s.isGift = true; break }
          }
        } catch { }
      }))
    }
  }
  if (salesCache !== res) return
  giftsDone.add(res)
  paintSales(res, height)
}

let discAnchor = null

function discRooms() {
  const seen = new Set(); const rooms = []
  for (const t of store.active()) {
    if (t.kind !== 'edition' || seen.has(t.collectionId)) continue
    seen.add(t.collectionId); rooms.push(t)
  }
  return rooms
}

function renderDiscRooms() {
  const host = $('discRooms'); const thread = $('discThread')
  discAnchor = null; thread.hidden = true; thread.innerHTML = ''; host.hidden = false
  const rooms = discRooms()
  if (rooms.length === 0) { host.innerHTML = '<p class="muted">No discussions yet — hold or publish an edition to join its lineage corridor.</p>'; return }
  host.innerHTML = ''
  for (const t of rooms) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'disc-room'
    row.innerHTML = `<span class="disc-room-name">${escapeHtml(t.collectionName ?? 'Collection')}</span><span class="disc-room-meta">enter ▸</span>`
    row.onclick = () => void openDiscRoom(t)
    host.append(row)
  }
}

async function openDiscRoom(t) {
  discAnchor = t
  const host = $('discRooms'); const thread = $('discThread')
  host.hidden = true; thread.hidden = false
  thread.innerHTML =
    `<div class="disc-head"><button class="secondary disc-back">← Rooms</button><h3>${escapeHtml(t.collectionName ?? 'Collection')}</h3><button class="secondary disc-reload">🔄</button></div>` +
    '<div class="disc-compose"><textarea class="disc-text" rows="3" placeholder="Post to your line…"></textarea>' +
    '<div class="disc-compose-row"><label class="muted" style="font-size:12px">Post to <select class="disc-target"></select></label>' +
    '<button class="disc-send">Post</button><span class="disc-status muted" style="font-size:12px"></span></div></div>' +
    '<div class="disc-feed"><p class="muted">Loading corridor…</p></div>'
  thread.querySelector('.disc-back').addEventListener('click', () => renderDiscRooms())
  thread.querySelector('.disc-reload').addEventListener('click', () => void loadDiscThread(t))
  await loadDiscThread(t)
}

async function loadDiscThread(t) {
  const thread = $('discThread')
  const feedEl = thread.querySelector('.disc-feed')
  const targetEl = thread.querySelector('.disc-target')
  const sendBtn = thread.querySelector('.disc-send')
  const textEl = thread.querySelector('.disc-text')
  const statusEl = thread.querySelector('.disc-status')
  sendBtn.disabled = false
  feedEl.innerHTML = '<p class="muted">Loading corridor…</p>'
  const iAmPublisher = t.publisherPubKeyHashHex === myPubKeyHash()
  let result
  try { result = await readCorridor(provider, t.txId, t.outputIndex, t.collectionId, { rootDownstream: iAmPublisher }) }
  catch (e) { feedEl.innerHTML = `<p class="muted">Couldn’t load this corridor: ${escapeHtml((e).message)}</p>`; return }
  const opts = []
  const selfNode = result.nodes.find(n => n.isSelf)
  if (selfNode) opts.push({ node: selfNode, label: 'your line' })
  for (const n of result.nodes) {
    if (n.isRoot) { if (iAmPublisher) opts.push({ node: n, label: '📣 everyone (collection)' }); continue }
    if (!n.isSelf) opts.push({ node: n, label: `⬆ reply to ${displayName(n.ownerPubKeyHex).name}` })
  }
  targetEl.innerHTML = opts.map((o, i) => `<option value="${i}">${escapeHtml(o.label)}</option>`).join('')
  sendBtn.onclick = () => void (async () => {
    const k = requireKey(); if (k == null) return
    const text = textEl.value.trim()
    if (text === '') { statusEl.textContent = 'Write something first.'; return }
    const target = opts[parseInt(targetEl.value || '0', 10)]?.node
    if (target == null) { statusEl.textContent = 'No post target available.'; return }
    const targetIdx = result.nodes.indexOf(target)
    const downBreadcrumbs = result.nodes.slice(0, targetIdx < 0 ? 0 : targetIdx).map(n => n.downHash160)
    sendBtn.disabled = true; statusEl.textContent = 'Posting…'
    try {
      await postToNodeFeed(provider, k, { feedHash160: target.feedHash160, ref: target.ref, text, senderAlias: getMyAlias(), downBreadcrumbs })
      textEl.value = ''; statusEl.textContent = '✅ Posted.'
      setTimeout(() => { if (discAnchor === t) void loadDiscThread(t) }, 900)
    } catch (e) { statusEl.textContent = `Post failed: ${(e).message}`; sendBtn.disabled = false }
  })()
  const ctx = { nodes: result.nodes, publisherHash: t.publisherPubKeyHashHex?.toLowerCase() }
  renderDiscFeed(feedEl, result.posts, ctx)
  if (result.posts.length) resolveAvatarsThen(result.posts.map(p => p.authorPubKeyHex), () => { if (discAnchor === t) renderDiscFeed(feedEl, result.posts, ctx) })
}

function discIdentityBadge(authorPubKeyHex, ctx) {
  const a = authorPubKeyHex.toLowerCase()
  try {
    if (ctx.publisherHash != null && hexOf(hash160Bytes(hexBytes(authorPubKeyHex))) === ctx.publisherHash) {
      return '<span class="disc-badge creator" title="Verified creator — this key controls the collection’s covenant">👑 creator</span>'
    }
  } catch { }
  const owned = ctx.nodes.find(n => n.ownerPubKeyHex !== '' && n.ownerPubKeyHex.toLowerCase() === a)
  if (owned != null) return owned.isGenesis
    ? '<span class="disc-badge senior" title="Original holder — owns a genesis copy">🌱 original holder</span>'
    : '<span class="disc-badge senior" title="Verified holder in this lineage">✓ holder</span>'
  return ''
}

function renderDiscFeed(feedEl, posts, ctx) {
  if (posts.length === 0) { feedEl.innerHTML = '<p class="muted">No posts yet — be the first to post to your line.</p>'; return }
  feedEl.innerHTML = ''
  for (const p of posts) {
    const pos = p.node.isDownstream ? '<span class="disc-badge down">⬇ downline</span>'
      : p.node.isRoot ? '<span class="disc-badge root">📣 everyone</span>'
      : p.node.isSelf ? '<span class="disc-badge self">your line</span>'
      : '<span class="disc-badge up">⬆ upline</span>'
    const el = document.createElement('div'); el.className = 'disc-post'
    el.innerHTML =
      `<div class="disc-post-head">${nameChip(p.authorPubKeyHex)} ${discIdentityBadge(p.authorPubKeyHex, ctx)} ${pos}${p.sentAt ? ` · 🕒 ${escapeHtml(fmtTime(p.sentAt))}` : ''}</div>` +
      `<div class="disc-post-text">${escapeHtml(p.text)}</div>`
    feedEl.append(el)
  }
}

async function onCheckUpdates() {
  const host = $('updatesFeed')
  const held = [...new Set(store.active().map(t => t.collectionId))]
  if (held.length === 0) {
    host.innerHTML = '<p class="muted">No collections held yet — buy or mint an edition to receive publisher updates.</p>'
    return
  }
  host.innerHTML = '<p class="muted">Checking for updates…</p>'
  const feed = []
  for (const collectionId of held) {
    try {
      const info = await loadCollection(collectionId)
      if (!info.publisherPubKeyHex) continue
      const list = await resolveBroadcasts(provider, info.publisherPubKeyHex, collectionId)
      if (list.length > 0) latestBroadcast.set(collectionId, list[0])
      for (const b of list) feed.push({ ...b, name: info.name, publisherPubKeyHex: info.publisherPubKeyHex })
    } catch { }
  }
  feed.sort((a, b) => (b.height || 1e12) - (a.height || 1e12))
  applyLatestAliases(feed.map(b => ({ pk: b.publisherPubKeyHex, alias: b.senderAlias })))
  renderTokens()
  renderUpdatesFeed(feed)
  resolveAvatarsThen(feed.map(b => b.publisherPubKeyHex), () => { if (lastUpdatesFeed != null) renderUpdatesFeed(lastUpdatesFeed) })
}

function renderUpdatesFeed(feed) {
  lastUpdatesFeed = feed
  const host = $('updatesFeed')
  if (feed.length === 0) {
    host.innerHTML = '<p class="muted">No announcements yet from the publishers of your collections.</p>'
    return
  }
  host.innerHTML = feed.map(b =>
    `<div class="token msg"><div class="token-name">📣 ${escapeHtml(b.name || 'Collection')}</div>` +
    `<div class="mono" style="font-size:12px">by ${nameChip(b.publisherPubKeyHex, { save: true })}</div>` +
    `<div class="state" style="color:var(--accent);white-space:pre-wrap">${escapeHtml(b.text)}</div>` +
    `<div class="mono">${short(b.txId)}</div></div>`,
  ).join('')
}

function activateTab(name) {
  const navBtn = document.querySelector(`.tab[data-tab="${name}"]`)
  if (isWatchOnly() && navBtn?.hasAttribute('data-needs-key')) name = 'wallet'
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === name))
  document.querySelectorAll('.tabpanel').forEach(p => p.classList.toggle('is-active', p.id === `tab-${name}`))
  try { localStorage.setItem('p2:activeTab', name) } catch { }
  if (name === 'discussions' && discAnchor == null) renderDiscRooms()
  if (name === 'sales') void renderSalesTab()
}

function initTabs() {
  const tabs = Array.from(document.querySelectorAll('.tab'))
  tabs.forEach(t => { t.onclick = () => activateTab(t.dataset.tab) })
  document.querySelectorAll('[data-goto]').forEach(el => {
    el.onclick = () => activateTab(el.dataset.goto)
  })
  let saved = null
  try { saved = localStorage.getItem('p2:activeTab') } catch { }
  if (saved && tabs.some(t => t.dataset.tab === saved)) activateTab(saved)
}

async function init() {
  store = new PharLapStore()
  const ver = $('appVersion'); if (ver != null) ver.textContent = `Smart NFTs · v${__APP_VERSION__} · ${__BUILD_ID__} · ${__BUILD_DATE__}`
  await importPharLap1Watch()
  const watch = localStorage.getItem(WATCH_KEY)
  let loaded = null
  if (watch == null) loaded = await loadWallet()
  loadAliases()
  if (watch != null) { try { useWatchKey(watch) } catch { localStorage.removeItem(WATCH_KEY); loaded = await loadWallet(); loadAliases() } }
  if (loaded != null) useKey(loaded.key, loaded.words)
  void refreshMarkerBackup()
  try { if (localStorage.getItem('p2:nftview') === 'grid') nftView = 'grid' } catch { }
  try { if (localStorage.getItem('p2:nftsort') === 'publisher') nftSort = 'publisher' } catch { }
  updateViewToggle()
  updateSortToggle()
  renderTokens()
  initTabs()
  document.addEventListener('click', onCopyClick)
  document.addEventListener('click', onAliasSaveClick)
  ;($('myAlias')).value = getMyAlias() ? '@' + getMyAlias() : ''
  $('btnSaveAlias').onclick = () => {
    const a = val('myAlias').replace(/^@+/, '').trim()
    setMyAlias(a)
    ;($('myAlias')).value = a ? '@' + a : ''
    toast(a ? `Your alias is now @${a}` : 'Alias cleared')
  }
  $('btnViewList').onclick = () => setNftView('list')
  $('btnViewGrid').onclick = () => setNftView('grid')
  $('btnSortRecent').onclick = () => setNftSort('recent')
  $('btnSortPublisher').onclick = () => setNftSort('publisher')
  $('btnDiscRefresh').onclick = () => { if (discAnchor != null) void loadDiscThread(discAnchor); else renderDiscRooms() }
  $('btnSales').onclick = () => activateTab('sales')
  $('btnSalesRefresh').onclick = () => void renderSalesTab(true)
  $('tokenModalClose').onclick = () => closeTokenModal()
  $('tokenModal').addEventListener('click', e => { if (e.target === $('tokenModal')) closeTokenModal() })
  $('tokenModalBody').addEventListener('click', e => {
    if ((e.target).closest('button') != null) $('tokenModal').style.display = 'none'
  }, true)

  $('btnRefresh').onclick = () => void refreshBalance()
  $('btnBuyBsv').onclick = () => onBuyBsv()
  $('btnSaveAff').onclick = () => onSaveAff()
  renderAffField()
  wireScanButtons()
  $('btnMint').onclick = () => void onMint()
  $('btnMintEdition').onclick = () => void onMintEdition()
  $('btnTierUnlimited').onclick = () => setPublishTier('unlimited')
  $('btnTierLimited').onclick = () => setPublishTier('limited')
  $('btnTierExclusive').onclick = () => setPublishTier('exclusive')
  {
    const lic = $('edLicense')
    const custom = $('edLicenseCustom')
    if (lic != null && custom != null) lic.onchange = () => { custom.hidden = lic.value !== '__custom' }
  }
  ;($('edCombine')).onchange = () => {
    const on = ($('edCombine')).checked
    $('edCombineWrap').hidden = !on
    ;($('edFile')).disabled = on
    const enc = $('edEncrypt')
    enc.disabled = on; if (on) enc.checked = false
    if (on) renderCombinePicker()
  }
  ;($('edCover')).onchange = () => void onCoverSelected()
  $('edCoverCam').onclick = () => void onTakePhoto()
  $('btnFeeFixed').onclick = () => setFeeMode('fixed')
  $('btnFeePct').onclick = () => setFeeMode('pct')
  ;($('edPrice')).addEventListener('input', updateFeePctPreview)
  ;($('edResellerPct')).addEventListener('input', updateFeePctPreview)
  ;($('edBond')).addEventListener('input', updateFeePctPreview)
  $('btnIncoming').onclick = () => void onCheckIncoming()
  $('btnTokBackupSave').onclick = () => onTokenBackupSave()
  $('btnTokBackupRestore').onclick = () => void onTokenBackupRestore()
  $('btnTokRescan').onclick = () => void rescanWalletHistory()
  $('btnRestoreFromFile').onclick = () => ($('tokBackupFile')).click()
  $('btnRestoreFromHistory').onclick = () => { showRestoreChoice(false); void rescanWalletHistory() }
  ;($('tokBackupFile')).addEventListener('change', () => { if (restoreChoicePending) void onTokenBackupRestore() })
  $('btnSendMessage').onclick = () => void onSendMessage()
  $('btnCheckMessages').onclick = () => void onCheckMessages()
  $('msgTo').addEventListener('input', updateMsgToName)
  $('btnContacts').onclick = () => openContactsModal()
  $('btnPublishProfile').onclick = () => void onPublishProfile()
  $('contactsClose').onclick = () => closeContactsModal()
  $('contactsModal').addEventListener('click', e => { if (e.target === $('contactsModal')) closeContactsModal() })
  $('contactAdd').onclick = () => onAddContact()
  $('btnCfgBackup').onclick = () => void onConfigBackup()
  $('btnCfgRestore').onclick = () => void onConfigRestore()
  $('btnCheckUpdates').onclick = () => void onCheckUpdates()
  $('btnNewWallet').onclick = async () => {
    if (!confirm('Replace the current wallet with a new one? Back up the current wallet first (its seed phrase / WIF is above) — it will be replaced.')) return
    const { mnemonic, key } = newSeedWallet()
    await switchWallet(key, false, mnemonic)
    setStatus('New wallet created — back up your seed phrase!', 'ok')
    localStorage.removeItem(BACKED_UP_KEY); showSeedModal(mnemonic)
  }
  $('btnRestore').onclick = async () => {
    let k
    try { k = Signer.fromWif(val('restoreWif')) } catch { setStatus('Invalid WIF.', 'error'); return }
    ;($('restoreWif')).value = ''
    await switchWallet(k, true)
  }
  $('btnRestoreSeed').onclick = async () => {
    let k
    const phrase = val('restoreSeed').trim().replace(/\s+/g, ' ')
    try { k = keyFromMnemonic(phrase) } catch { setStatus('Invalid seed phrase — check the words and order.', 'error'); return }
    ;($('restoreSeed')).value = ''
    await switchWallet(k, true, phrase)
    markBackedUp()
  }
  $('btnWatchLoad').onclick = async () => {
    const pk = val('watchPubKey')
    try { compressedPubKeyHex(pk) } catch { setStatus('Enter a valid public key (33- or 65-byte hex) from your offline wallet.', 'error'); return }
    try { await switchToWatch(pk) } catch (e) { setStatus(`Watch-only not loaded: ${(e).message}. Nothing was changed.`, 'error'); return }
    ;($('watchPubKey')).value = ''
    setStatus('Watch-only wallet loaded. Signing actions are disabled here — sign on your offline machine.', 'ok')
  }
  $('btnWatchExit').onclick = async () => {
    if (!confirm('Leave watch-only mode? This creates a fresh local wallet on this device (your watched wallet is unaffected — re-load it any time with its public key).')) return
    const { mnemonic, key } = newSeedWallet()
    await switchWallet(key, false, mnemonic)
    setStatus('Exited watch-only — a fresh local wallet was created. Back up its seed phrase.', 'ok')
    localStorage.removeItem(BACKED_UP_KEY); showSeedModal(mnemonic)
  }
  $('btnSendBsv').onclick = () => void onSendBsv()
  $('btnSendBsvExport').onclick = () => void onSendBsvExport()
  $('sendBsvMax').addEventListener('change', () => {
    const max = ($('sendBsvMax')).checked
    const amt = $('sendBsvAmount')
    amt.disabled = max
    if (max) amt.value = ''
  })
  $('advAirgap').addEventListener('toggle', () => { if (($('advAirgap')).open) populateAirgapEditions() })
  document.querySelectorAll('input[name="agAction"]').forEach(r => r.addEventListener('change', syncAirgapAction))
  $('btnAgExport').onclick = () => void onAirgapExport()
  $('agSignFile').addEventListener('change', () => void onAirgapSignFile())
  $('btnAgSign').onclick = () => void onAirgapSign()
  $('btnAgBroadcast').onclick = () => void onAirgapBroadcast()
  $('btnCsRead').onclick = () => void onCosignRead()
  $('btnCsSign').onclick = () => void onCosignSign()
  $('btnCsBroadcast').onclick = () => void onCosignBroadcast()
  $('btnSeedShow').onclick = () => toggleSeed()
  $('btnSeedCopy').onclick = () => { if (key != null && words != null) void navigator.clipboard?.writeText(words) }
  $('btnCopyPub').onclick = () => void navigator.clipboard?.writeText(pubKeyHex)
  $('btnCopyAddr').onclick = () => void navigator.clipboard?.writeText(address)
  $('btnQrAddr').onclick = () => showQrModal('Receive address — BSV only', address)
  $('btnQrPub').onclick = () => showQrModal('Public key — scan to share', pubKeyHex)
  $('btnWifShow').onclick = () => {
    const el = $('wif')
    if (el.type === 'text') { hideWif(); return }
    el.value = key != null ? key.toWif() : ''
    el.type = 'text'
    $('btnWifShow').textContent = '🙈 Hide'
  }
  $('btnWifCopy').onclick = () => {
    if (key == null) return
    void navigator.clipboard?.writeText(key.toWif())
    const b = $('btnWifCopy'); const prev = b.textContent
    b.textContent = 'Copied ✓'
    setTimeout(() => { b.textContent = prev }, 1200)
  }
  $('viewerClose').onclick = () => closeViewer()
  $('viewer').onclick = (e) => { if (e.target === $('viewer')) closeViewer() }

  $('cvWallet').onclick = () => closeCollectionView()
  $('cvShare').onclick = () => void shareCollectionLink()
  $('cvQr').onclick = () => void (async () => { const l = await currentShareLink(); if (l) showQrModal('Scan to open this sales page', l) })()
  $('cvGet').onclick = () => void onGetCopy()
  $('cvGetTop').onclick = () => {
    document.querySelector('.cv-buy')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    void onGetCopy()
  }
  $('cvBuyAnother').onclick = () => {
    if (!currentCollection) return
    if (confirm(`You already own a copy of “${currentCollection.info.name}”.\n\nBuy ANOTHER copy?`)) void onGetCopy()
  }
  $('cvView').onclick = () => { if (currentCollection) void onView(currentCollection.info.tx1Ref, currentCollection.info.name) }
  $('cvNoteSave').onclick = () => void onSaveSellerNote()
  $('cvNoteRefresh').onclick = () => void onRefreshNote()
  $('cvFundCopy').onclick = () => void navigator.clipboard?.writeText(address)
  $('cvFundDone').onclick = () => void onGetCopy()
  window.addEventListener('hashchange', () => {
    const r = parseHashRoute()
    if (r) void openCollectionView(r.c, r.h, r.g, r.src)
    else closeCollectionView()
  })

  const listParam = new URLSearchParams(location.hash.replace(/^#/, '')).get('list')
  if (listParam && /^0[23][0-9a-f]{64}$/.test(listParam.toLowerCase())) {
    pendingListPartner = listParam.toLowerCase()
    activateTab('tokens')
    setStatus(`📤 Listing to ${short(pendingListPartner)} — tap “🤝 Onboard partner” on a collection below to send it a copy for resale.`)
    history.replaceState(null, '', location.pathname + location.search)
  }

  const route = parseHashRoute()
  if (route) void openCollectionView(route.c, route.h, route.g, route.src)

  void refreshBalance()

  if (loaded?.then === 'recover') await switchWallet(loaded.key, true, loaded.words ?? undefined)
  if (loaded?.then === 'fresh') {
    await switchWallet(loaded.key, false, loaded.words ?? undefined)
    localStorage.removeItem(BACKED_UP_KEY); showSeedModal(loaded.words ?? '')
  }
  if (loaded?.then === 'import') {
    await switchWallet(loaded.key, false, loaded.words ?? undefined)
    copyPharLap1Items(true)
    localStorage.setItem(IMPORTED_KEY, loaded.key.address())
    loadAliases(); renderTokens(); renderContacts(); refreshNameSurfaces()
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void init())
else void init()
