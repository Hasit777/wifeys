import { useEffect, useState, useCallback } from 'react'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import app, { db } from '../lib/firebase'
import { useAuth } from './useAuth'

// Paste your VAPID key here once you generate it in Firebase Console
// (Project Settings → Cloud Messaging → Web Push certificates)
const VAPID_KEY = 'BE_4N9jqOJ3STonJ2igsp0E5nC_D06WWgiml8H7s1olxAL84aUEQMFf4I4N9knqbq5BrfcZUhi_ADT_pw54Cm-A'

// Explicitly register (or reuse) the Firebase Messaging service worker,
// rather than trusting whatever navigator.serviceWorker.ready resolves to.
// This avoids a race where index.html's generic registration and FCM's
// own requirements get out of sync.
async function getMessagingServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
  if (existing) return existing
  return navigator.serviceWorker.register('/firebase-messaging-sw.js')
}

async function fetchAndSaveToken(user, setToken, setLastError) {
  try {
    const registration = await getMessagingServiceWorker()
    if (!registration) {
      setLastError('No service worker registration available')
      return null
    }

    const messaging = getMessaging(app)
    const fcmToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    })

    if (!fcmToken) {
      setLastError('getToken() returned empty — check your VAPID key is correct')
      return null
    }

    setToken(fcmToken)

    await setDoc(doc(db, 'fcmTokens', user.uid), {
      token: fcmToken,
      updatedAt: serverTimestamp(),
      userAgent: navigator.userAgent,
    }, { merge: true })

    setLastError(null)
    return fcmToken
  } catch (e) {
    console.error('FCM token error:', e)
    setLastError(e.message || String(e))
    return null
  }
}

export function useFcm() {
  const { user } = useAuth()
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [token, setToken] = useState(null)
  const [lastError, setLastError] = useState(null)

  const requestPermissionAndRegister = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setLastError('Notifications not supported in this browser')
      return 'unsupported'
    }

    const supported = await isSupported().catch(() => false)
    if (!supported) {
      setLastError('Firebase Messaging not supported in this browser/context')
      return 'unsupported'
    }

    const result = await Notification.requestPermission()
    setPermission(result)

    if (result === 'granted' && user) {
      await fetchAndSaveToken(user, setToken, setLastError)
    } else if (result !== 'granted') {
      setLastError(`Permission was "${result}", not "granted"`)
    }

    return result
  }, [user])

  // Auto-register silently if permission was already granted previously
  useEffect(() => {
    if (!user) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    isSupported().then(supported => {
      if (!supported) return
      fetchAndSaveToken(user, setToken, setLastError)
    })
  }, [user])

  // Listen for messages that arrive while the app IS open/foregrounded —
  // background/closed delivery is handled entirely by the service worker
  useEffect(() => {
    isSupported().then(supported => {
      if (!supported) return
      const messaging = getMessaging(app)
      const unsub = onMessage(messaging, () => {
        // The global chat listener (useGlobalChat) already handles sound +
        // in-app state for foreground messages — nothing extra needed here.
      })
      return unsub
    })
  }, [])

  return { permission, requestPermissionAndRegister, token, lastError }
}
