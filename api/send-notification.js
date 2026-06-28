// /api/send-notification.js
//
// This runs on Vercel's server, NOT in the browser. The Firebase service
// account credentials live only here, as environment variables — never in
// the frontend code, so they can't be stolen by anyone visiting the site.
//
// The app calls this endpoint after sending a chat message, passing the
// recipient's device token. This function then asks Google's FCM servers
// to push a real notification to that device — which works even if the
// recipient's app/browser is fully closed.

import admin from 'firebase-admin'

let initError = null

// Initialise the Firebase Admin SDK once (Vercel reuses the same function
// instance across requests when possible, so we guard against re-init)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel env vars store newlines as literal "\n" — convert them back
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  } catch (e) {
    initError = e.message
    console.error('Firebase Admin init failed:', e)
  }
}

export default async function handler(req, res) {
  // GET /api/send-notification?debug=1 — quick way to check env vars are
  // wired up correctly without sending a real push. Visit this URL directly
  // in your phone's browser to see what's actually configured on Vercel.
  if (req.method === 'GET') {
    const key = process.env.FIREBASE_PRIVATE_KEY || ''
    return res.status(200).json({
      initError,
      hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!key,
      privateKeyStartsCorrectly: key.includes('BEGIN PRIVATE KEY'),
      privateKeyContainsLiteralBackslashN: key.includes('\\n'),
      adminAppsCount: admin.apps.length,
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (initError) {
    console.error('Cannot send — Firebase Admin failed to init:', initError)
    return res.status(500).json({ success: false, error: 'Server misconfigured: ' + initError })
  }

  const { token, title, body, url } = req.body || {}

  if (!token || !title || !body) {
    return res.status(400).json({ error: 'Missing token, title, or body' })
  }

  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      webpush: {
        notification: {
          icon: '/pwa-192.png',
          badge: '/pwa-192.png',
        },
        fcmOptions: {
          link: url || '/chat',
        },
      },
    })

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('FCM send error:', err)
    // Surface the real error so the client can log it — silently returning
    // 200 on failure is exactly what made this bug invisible before
    return res.status(500).json({ success: false, error: err.message, code: err.code })
  }
}
