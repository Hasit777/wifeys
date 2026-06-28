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

// Same config as src/lib/firebase.js — duplicated here because service
// workers can't import from your app's source files
firebase.initializeApp({
  apiKey: "AIzaSyD35PNdjUNu3GMQwDFyK2SShvExzxhC-10",
  authDomain: "justus-1a3c7.firebaseapp.com",
  projectId: "justus-1a3c7",
  storageBucket: "justus-1a3c7.firebasestorage.app",
  messagingSenderId: "1047665019493",
  appId: "1:1047665019493:web:e49a7ea610cacb30a6d48c",
})

const messaging = firebase.messaging()

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

// Required for Android's PWA install criteria — pass requests straight
// through to the network (we're not caching app data since Firestore
// needs to stay live)
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})

// Fires when a push arrives and the app is NOT in the foreground —
// the actual "phone buzzes even though the app is closed" moment
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || '💌 Just Us'
  const body = payload.notification?.body || 'You have a new message'
  const url = payload.fcmOptions?.link || payload.data?.url || '/chat'

  self.registration.showNotification(title, {
    body,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: 'justus-message',
    data: { url },
  })
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
