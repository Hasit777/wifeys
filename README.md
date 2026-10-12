# Wifey's App 💌

A private, two-person web app for staying close: real-time chat, a shared memory timeline, push notifications, and a PIN lock. Built with React, Vite and Firebase, deployed on Vercel.

> Personal project. Not intended for public use or sign-ups.

## Features

- **Real-time chat** with instant delivery via Firestore listeners
- **Push notifications** for new messages, even when the app is closed
- **Memory timeline**: a shared, chronological collection of moments and notes
- **PIN lock** so only the two of you get in
- **Responsive**: works on desktop and mobile

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Firebase (Firestore, Auth, Cloud Messaging) |
| Hosting | Vercel (auto-deploys from GitHub) |

## Getting Started

```bash
git clone https://github.com/<username>/<repo>.git
cd <repo>
npm install
```

Create a `.env` file in the project root:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

Run it:

```bash
npm run dev      # http://localhost:5173
npm run build    # production build
npm run preview  # preview the build
```

## Deployment

Push to `main` and Vercel builds and deploys automatically. Add the same `VITE_FIREBASE_*` variables in Vercel under Project → Settings → Environment Variables.

## Security

- Firestore rules restrict read/write access to the two authorised users
- The PIN lock is a convenience layer on top of Firebase Auth, not a replacement
- Never commit `.env`

## License

Private. All rights reserved.
