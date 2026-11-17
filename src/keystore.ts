/**
 * The wallet's secret at rest: the WIF and, for a seed wallet, its words, kept SEALED (AES-GCM) under a
 * non-extractable AES key made in this browser, both in one IndexedDB record. The key can be used only by code
 * running in this site's pages, and no script can read it out as bytes; a copy of the record taken anywhere
 * else is locked bytes.
 *
 * ⚠ What the seal cannot stop: a script running in the page opens it, as the page does. secp256k1 has no
 *   WebCrypto form, so the signing key is plain in memory while the wallet is open. And a copy of the browser's
 *   profile files holds the AES key beside the sealed bytes, so it opens them; Safari alone keeps the AES key
 *   under one of its own, in the Keychain.
 */

const DB = 'pharlap2-keys'
const STORE = 'keys'
/** The open wallet's record. Others are named by the caller (a wallet set aside, kept and never deleted). */
export const WALLET = 'wallet'

export interface Secret {
  wif: string
  /** The BIP-39 words, or null for a wallet imported from a WIF. */
  words: string | null
}

/** A record is saved here but the browser will not open it. ⛔ Nothing may then be written over it unasked. */
export const UNREADABLE = 'unreadable'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('IndexedDB would not open'))
    r.onblocked = () => reject(new Error('IndexedDB is blocked'))
  })
}

/**
 * One request in its own transaction. ⚠ A WRITE IS DONE WHEN ITS TRANSACTION COMMITS, not when its request
 * succeeds: a transaction can still abort after that and keep nothing. Safari does exactly this with a key it
 * cannot store. So reads resolve on the request, writes on `complete`, and an abort is an error.
 */
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      const failed = (): void => reject(tx.error ?? req.error ?? new Error('the browser did not keep it'))
      if (mode === 'readwrite') { tx.oncomplete = () => resolve(req.result); tx.onabort = failed; tx.onerror = failed }
      else { req.onsuccess = () => resolve(req.result); req.onerror = failed }
    })
  } finally { db.close() }
}

/**
 * The sealed secret, null when none is saved, or UNREADABLE when one is saved and will not open: Safari reads a
 * record back as null, with no error, when it cannot use the Keychain key it stored it under. Throws when this
 * browser has no usable IndexedDB.
 */
export async function loadSecret(id = WALLET): Promise<Secret | null | typeof UNREADABLE> {
  if ((await idb('readonly', s => s.count(id))) === 0) return null
  const r = await idb<any>('readonly', s => s.get(id))
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv }, r.key, r.ct)
    const s = JSON.parse(new TextDecoder().decode(plain))
    if (typeof s.wif !== 'string' || s.wif === '' || (s.words !== null && typeof s.words !== 'string')) return UNREADABLE
    return { wif: s.wif, words: s.words }
  } catch { return UNREADABLE }
}

/**
 * Seal and save, replacing what was there. Done only once it reads back and opens to the same secret; otherwise
 * throws, and the caller keeps its own copy.
 */
export async function saveSecret(secret: Secret, id = WALLET): Promise<void> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify({ wif: secret.wif, words: secret.words }))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))
  plain.fill(0)
  await idb('readwrite', s => s.put({ v: 1, key, iv, ct, saved: Date.now() }, id))
  const back = await loadSecret(id)
  if (back == null || back === UNREADABLE || back.wif !== secret.wif || back.words !== secret.words) {
    throw new Error('the browser did not keep the sealed key')
  }
}

/** Remove the open wallet's sealed secret. Done once the delete commits. */
export async function forgetSecret(): Promise<void> {
  await idb('readwrite', s => s.delete(WALLET))
}

/**
 * Ask the browser to keep this site's storage rather than evict it when the disk runs short. It covers all of the
 * site's storage, localStorage too. Chromium grants it quietly to a site in use, Firefox asks once, Safari decides
 * by its own rules. True when kept, false when refused, null where the browser cannot say.
 */
export async function keepStorage(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist == null) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch { return null }
}
