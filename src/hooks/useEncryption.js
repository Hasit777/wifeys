import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getStoredKeyBundle, setStoredKeyBundle } from '../lib/keyStore'
import {
  generateSigningKeyPair, generateKeyAgreementKeyPair, exportCryptoKey,
  importAgreementPublicKey, importVerifyPublicKey, deriveSharedAesKey,
  encryptPayload, decryptPayload, signCiphertext, verifyCiphertext,
  bufToB64, b64ToBuf,
} from '../lib/e2e'

// Encrypts/decrypts chat content (text, photo, sticker) using a static
// shared AES key derived from both partners' long-term X25519 keys.
//
// `ready` becomes true once: this device has its own keys AND the partner
// has published theirs. The very first time either of you opens the app
// after this feature ships, encryption isn't ready until BOTH of you have
// opened it at least once — that's the one-time bootstrap.
export function useEncryption(user) {
  const [ready, setReady] = useState(false)
  const [partnerUid, setPartnerUid] = useState(null)
  const aesKeyRef = useRef(null)
  const signingPrivateKeyRef = useRef(null)
  const partnerVerifyKeyRef = useRef(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function setup() {
      // 1. Load or generate this device's own keypairs
      let bundle = await getStoredKeyBundle(user.uid)
      if (!bundle) {
        const signingPair = await generateSigningKeyPair()
        const agreementPair = await generateKeyAgreementKeyPair()
        bundle = {
          signingPublicKey: signingPair.publicKey,
          signingPrivateKey: signingPair.privateKey,
          agreementPublicKey: agreementPair.publicKey,
          agreementPrivateKey: agreementPair.privateKey,
        }
        await setStoredKeyBundle(user.uid, bundle)
      }
      if (cancelled) return
      signingPrivateKeyRef.current = bundle.signingPrivateKey

      // 2. Publish our public keys (idempotent — safe to re-run every load)
      const [signingPubRaw, agreementPubRaw] = await Promise.all([
        exportCryptoKey('raw', bundle.signingPublicKey),
        exportCryptoKey('raw', bundle.agreementPublicKey),
      ])
      await setDoc(doc(db, 'publicKeys', user.uid), {
        signingPublicKey: bufToB64(signingPubRaw),
        agreementPublicKey: bufToB64(agreementPubRaw),
        updatedAt: Date.now(),
      })

      // 3. Find the partner + fetch their public keys
      const usersSnap = await getDocs(collection(db, 'users'))
      let foundPartnerUid = null
      usersSnap.forEach(d => { if (d.id !== user.uid) foundPartnerUid = d.id })
      if (!foundPartnerUid) return // no partner account yet
      if (cancelled) return
      setPartnerUid(foundPartnerUid)

      const partnerKeysSnap = await getDoc(doc(db, 'publicKeys', foundPartnerUid))
      if (!partnerKeysSnap.exists()) {
        console.warn('[e2e] Partner hasn\'t published their keys yet — they need to open the app once')
        return // stays not-ready until partner opens the app at least once
      }
      const partnerKeys = partnerKeysSnap.data()
      if (cancelled) return

      const partnerAgreementPubKey = await importAgreementPublicKey(b64ToBuf(partnerKeys.agreementPublicKey))
      const partnerVerifyPubKey = await importVerifyPublicKey(b64ToBuf(partnerKeys.signingPublicKey))
      partnerVerifyKeyRef.current = partnerVerifyPubKey

      // 4. Derive the static shared AES key
      aesKeyRef.current = await deriveSharedAesKey(bundle.agreementPrivateKey, partnerAgreementPubKey)

      if (!cancelled) setReady(true)
    }

    setup().catch(err => console.error('[e2e] setup failed', err))
    return () => { cancelled = true }
  }, [user])

  // Encrypt + sign a JS value (string or object). Returns the fields to
  // store directly in the Firestore message doc.
  const encrypt = useCallback(async (value) => {
    if (!aesKeyRef.current) throw new Error('Encryption not ready yet')
    const { ciphertext, iv } = await encryptPayload(aesKeyRef.current, value)
    const signature = await signCiphertext(signingPrivateKeyRef.current, ciphertext)
    return { enc: true, ciphertext, iv, signature }
  }, [])

  // Decrypt + verify a message doc's encrypted fields. Returns the original
  // value, or null if it fails (wrong/missing key, tampered data, etc.)
  const decrypt = useCallback(async (msg) => {
    if (!aesKeyRef.current) return null
    try {
      if (partnerVerifyKeyRef.current && msg.senderId === partnerUid) {
        const valid = await verifyCiphertext(partnerVerifyKeyRef.current, msg.ciphertext, msg.signature)
        if (!valid) {
          console.warn('[e2e] signature did not verify for message', msg.id)
          return null
        }
      }
      return await decryptPayload(aesKeyRef.current, msg)
    } catch (err) {
      console.error('[e2e] decrypt failed for message', msg.id, err)
      return null
    }
  }, [partnerUid])

  return { ready, encrypt, decrypt }
}
