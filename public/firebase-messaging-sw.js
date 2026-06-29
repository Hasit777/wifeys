// firebase-messaging-sw.js
//
// This single service worker does two jobs:
//  1. Satisfies Android's "Add to Home Screen" install requirements (a
//     fetch handler + install/activate lifecycle), which fixes the
//     "opens a new tab every time" problem.
//  2. Receives FCM push events and shows a real notification — this is
//     what fires even when the app/tab is fully closed.
//
// Firebase's Web SDK specifically looks for this exact filename at the
// site root, so don't rename it.

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: "AIzaSyD35PNdjUNu3GMQwDFyK2SShvExzxhC-10",
  authDomain: "justus-1a3c7.firebaseapp.com",
  projectId: "justus-1a3c7",
  storageBucket: "justus-1a3c7.firebasestorage.app",
  messagingSenderId: "1047665019493",
  appId: "1:1047665019493:web:e49a7ea610cacb30a6d48c",
})

const messaging = firebase.messaging()

self.addEventListener('install', (event) => {
  // Activate this service worker immediately rather than waiting for
  // old tabs to close — important so push delivery doesn't depend on
  // the user having fully closed every tab first
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

// Required for Android's PWA install criteria. We deliberately keep this
// minimal and non-blocking — if it ever throws, that must NOT prevent the
// service worker from staying alive to receive pushes.
self.addEventListener('fetch', (event) => {
  // No-op passthrough — intentionally not calling event.respondWith() so
  // the browser handles the request normally. A faulty custom response
  // here could destabilise the worker; simplest is safest.
})

// ── This is the core of background delivery ────────────────────────────
// Fires when a push arrives and the app is NOT in the foreground —
// the actual "phone buzzes even though the app is closed" moment.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload)
  logSwEvent('onBackgroundMessage fired', payload)

  const title = payload.notification?.title || 'wifeys app'
  const body = payload.notification?.body || 'You hab new message'
  const url = payload.fcmOptions?.link || payload.data?.url || '/chat'

  return self.registration.showNotification(title, {
    body,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: 'justus-message',
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: { url },
  })
})

// Writes a small debug entry straight to Firestore (via REST, since the
// service worker can't use the regular Firestore SDK) so we can see what
// actually happened on your phone from any other device's browser.
function logSwEvent(label, payload) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/justus-1a3c7/databases/(default)/documents/swDebugLogs`
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          label: { stringValue: String(label) },
          payload: { stringValue: JSON.stringify(payload || {}).slice(0, 800) },
          time: { stringValue: new Date().toISOString() },
        },
      }),
    }).catch(() => {})
  } catch (_) {}
}

// Log every push event at the lowest level too, in case onBackgroundMessage
// itself never fires — this tells us if the push reached the device at all
self.addEventListener('push', (event) => {
  let raw = null
  try { raw = event.data ? event.data.json() : null } catch (_) { raw = event.data ? event.data.text() : null }
  logSwEvent('raw push event received', raw)
})

// Clicking the notification opens (or focuses) the chat page
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/chat'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
