// ─── End-to-end encryption primitives ──────────────────────────────────────
// Two long-term keypairs per device:
//   - X25519 (key agreement)  → derives one static shared AES-GCM key with
//     your partner. Static because there are exactly 2 fixed users here —
//     no need for a Signal-style ratchet.
//   - ECDSA P-384 (signing)   → every encrypted payload is signed so the
//     recipient can verify it genuinely came from the sender and wasn't
//     tampered with in Firestore.
//
// Nothing here ever sends a private key anywhere. Only the two *public*
// keys get uploaded (to the `publicKeys` Firestore collection) so each
// device can derive the shared secret locally.

// ===========================
// Signing Key Pair (ECDSA)
// ===========================
export async function generateSigningKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-384",
    },
    true, // Allow exporting
    ["sign", "verify"]
  );
  return keyPair;
}

// ===========================
// Key Agreement Pair (X25519)
// ===========================
export async function generateKeyAgreementKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "X25519",
    },
    true, // Allow exporting
    ["deriveKey", "deriveBits"]
  );
  return keyPair;
}

// ===========================
// Export a CryptoKey
// ===========================
export async function exportCryptoKey(format, key) {
  return await window.crypto.subtle.exportKey(format, key);
}

// ===========================
// Import an AES Key
// ===========================
export async function importSecretKey(rawKey) {
  return await window.crypto.subtle.importKey(
    "raw",
    rawKey,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"]
  );
}

// ── Everything below is new — the layer that actually uses the above ──────

// base64 <-> ArrayBuffer helpers (Firestore can't store raw binary/CryptoKeys)
export function bufToB64(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function b64ToBuf(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

// Import someone's public X25519 key (raw bytes, as exported by exportCryptoKey)
export async function importAgreementPublicKey(rawBytes) {
  return window.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'X25519' },
    true,
    []
  )
}

// Import someone's public ECDSA verify key
export async function importVerifyPublicKey(rawBytes) {
  return window.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'ECDSA', namedCurve: 'P-384' },
    true,
    ['verify']
  )
}

// ECDH: combine my private X25519 key + their public X25519 key into one
// static AES-GCM key both sides will independently arrive at
export async function deriveSharedAesKey(myPrivateKey, theirPublicKey) {
  const bits = await window.crypto.subtle.deriveBits(
    { name: 'X25519', public: theirPublicKey },
    myPrivateKey,
    256
  )
  return importSecretKey(bits)
}

// Encrypt any JS value (string, or JSON-serialisable object) with AES-GCM.
// Returns everything as base64 strings so it can go straight into Firestore.
export async function encryptPayload(aesKey, value) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintext
  )
  return {
    ciphertext: bufToB64(ciphertext),
    iv: bufToB64(iv),
  }
}

export async function decryptPayload(aesKey, { ciphertext, iv }) {
  const plainBuf = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(iv) },
    aesKey,
    b64ToBuf(ciphertext)
  )
  return JSON.parse(new TextDecoder().decode(plainBuf))
}

// Sign the ciphertext (not the plaintext — signing the encrypted bytes is
// enough to prove authenticity + catch tampering, without needing to touch
// plaintext twice)
export async function signCiphertext(signingPrivateKey, ciphertextB64) {
  const sig = await window.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-384' },
    signingPrivateKey,
    new TextEncoder().encode(ciphertextB64)
  )
  return bufToB64(sig)
}

export async function verifyCiphertext(verifyPublicKey, ciphertextB64, signatureB64) {
  try {
    return await window.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-384' },
      verifyPublicKey,
      b64ToBuf(signatureB64),
      new TextEncoder().encode(ciphertextB64)
    )
  } catch (e) {
    console.error('[e2e] signature verify failed', e)
    return false
  }
}
