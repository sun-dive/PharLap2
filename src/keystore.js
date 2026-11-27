const DB = 'pharlap2-keys'
const STORE = 'keys'
export const WALLET = 'wallet'

export const UNREADABLE = 'unreadable'

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('IndexedDB would not open'))
    r.onblocked = () => reject(new Error('IndexedDB is blocked'))
  })
}

async function idb(mode, fn) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      const failed = () => reject(tx.error ?? req.error ?? new Error('the browser did not keep it'))
      if (mode === 'readwrite') { tx.oncomplete = () => resolve(req.result); tx.onabort = failed; tx.onerror = failed }
      else { req.onsuccess = () => resolve(req.result); req.onerror = failed }
    })
  } finally { db.close() }
}

export async function loadSecret(id = WALLET) {
  if ((await idb('readonly', s => s.count(id))) === 0) return null
  const r = await idb('readonly', s => s.get(id))
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv }, r.key, r.ct)
    const s = JSON.parse(new TextDecoder().decode(plain))
    if (typeof s.wif !== 'string' || s.wif === '' || (s.words !== null && typeof s.words !== 'string')) return UNREADABLE
    return { wif: s.wif, words: s.words }
  } catch { return UNREADABLE }
}

export async function saveSecret(secret, id = WALLET) {
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

export async function forgetSecret() {
  await idb('readwrite', s => s.delete(WALLET))
}

export async function keepStorage() {
  try {
    if (navigator.storage?.persist == null) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch { return null }
}
