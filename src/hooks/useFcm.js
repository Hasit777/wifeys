import { useEffect, useState, useCallback } from 'react'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import app, { db } from '../lib/firebase'
import { useAuth } from './useAuth'

// Your real VAPID key
const VAPID_KEY = 'BE_4N9jqOJ3STonJ2igsp0E5nC_D06WWgiml8H7s1olxAL84aUEQMFf4I4N9knqbq5BrfcZUhi_ADT_pw54Cm-A'

// Writes a debug entry to Firestore so we can see exactly what happened on
// the phone from any other device. TEMPORARY — for debugging only.
async function logClientEvent(uid, label, detail) {
  try {
    await setDoc(doc(db, 'swDebugLogs', `${Date.now()}_${Math.random().toString(36).slice(2,7)}`), {
      source: 'client',
      uid: uid || 'unknown',
      label,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail || {}),
      time: new Date().toISOString(),
      userAgent: navigator.userAgent,
    })
  } catch (e) {
    console.error('logClientEvent failed:', e)
  }
}

async function getMessagingServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
  if (existing) return existing
  return navigator.serviceWorker.register('/firebase-messaging-sw.js')
}

async function fetchAndSaveToken(user, setToken, setLastError, setStatus) {
  setStatus('checking')
  await logClientEvent(user?.uid, 'fetchAndSaveToken: starting')

  try {
    const registration = await getMessagingServiceWorker()
    if (!registration) {
      setLastError('No service worker registration available')
      setStatus('error')
      await logClientEvent(user?.uid, 'fetchAndSaveToken: no SW registration')
      return null
    }
    await logClientEvent(user?.uid, 'fetchAndSaveToken: SW registration OK', registration.scope)

    const messaging = getMessaging(app)
    const fcmToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    })

    if (!fcmToken) {
      setLastError('getToken() returned empty — check your VAPID key is correct')
      setStatus('error')
      await logClientEvent(user?.uid, 'fetchAndSaveToken: getToken returned empty')
      return null
    }

    await logClientEvent(user?.uid, 'fetchAndSaveToken: got token', fcmToken.slice(0, 20) + '...')

    setToken(fcmToken)

    await setDoc(doc(db, 'fcmTokens', user.uid), {
      token: fcmToken,
      updatedAt: serverTimestamp(),
      userAgent: navigator.userAgent,
    }, { merge: true })

    await logClientEvent(user?.uid, 'fetchAndSaveToken: saved to Firestore successfully')

    setLastError(null)
    setStatus('registered')
    return fcmToken
  } catch (e) {
    console.error('FCM token error:', e)
    setLastError(e.message || String(e))
    setStatus('error')
    await logClientEvent(user?.uid, 'fetchAndSaveToken: threw error', e.message || String(e))
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
  // status: 'idle' | 'checking' | 'registered' | 'error'
  const [status, setStatus] = useState('idle')

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
      await fetchAndSaveToken(user, setToken, setLastError, setStatus)
    } else if (result !== 'granted') {
      setLastError(`Permission was "${result}", not "granted"`)
      setStatus('error')
    }

    return result
  }, [user])

  // Auto-register silently if permission was already granted previously
  useEffect(() => {
    if (!user) return
    if (typeof Notification === 'undefined') return

    logClientEvent(user.uid, 'useFcm mounted', `Notification.permission = ${Notification.permission}`)

    if (Notification.permission !== 'granted') return

    isSupported().then(async supported => {
      await logClientEvent(user.uid, 'isSupported() result', String(supported))
      if (!supported) {
        setStatus('error')
        setLastError('Firebase Messaging isSupported() returned false on this device/browser')
        return
      }
      fetchAndSaveToken(user, setToken, setLastError, setStatus)
    })
  }, [user])

  useEffect(() => {
    isSupported().then(supported => {
      if (!supported) return
      const messaging = getMessaging(app)
      const unsub = onMessage(messaging, () => {})
      return unsub
    })
  }, [])

  return { permission, requestPermissionAndRegister, token, lastError, status }
}
