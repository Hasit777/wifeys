// ─── Local key storage (IndexedDB) ─────────────────────────────────────────
// Stores this device's own signing + key-agreement CryptoKeyPairs. Modern
// browsers can store CryptoKey objects directly via structured clone, so no
// export/import round-trip is needed just to persist them locally.
//
// This is local-only, per-device storage — nothing here is synced. If you
// clear site data or switch devices, these keys are gone and a fresh pair
// gets generated next time (by design, per the "keep it simple" choice —
// no key backup/recovery).

const DB_NAME = 'wifeys-keys'
const STORE = 'keypairs'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getStoredKeyBundle(uid) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(uid)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function setStoredKeyBundle(uid, bundle) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(bundle, uid)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
