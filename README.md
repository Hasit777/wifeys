# Just Us 🩷
Your private app — just for you two.

## Setup (takes ~10 minutes)

### Step 1 — Install Node.js
If you don't have it: https://nodejs.org (download the LTS version)

### Step 2 — Set up Firebase (free)
1. Go to https://console.firebase.google.com
2. Click **Add project** → name it "justus" → create
3. In the left menu: **Build → Authentication → Get started**
   - Enable **Email/Password** provider
4. In the left menu: **Build → Firestore Database → Create database**
   - Choose **Start in test mode** → pick a region
5. Click the ⚙️ gear → **Project settings** → scroll to **Your apps**
6. Click the `</>` (Web) icon → register app → copy the config object

### Step 3 — Add your Firebase config
Open `src/lib/firebase.js` and paste your config:
```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  // etc
}
```

### Step 4 — Change your invite code (optional)
In `src/hooks/useAuth.jsx`, line 12:
```js
const INVITE_CODE = 'XOXO42'  // ← change this to whatever you want
```

### Step 5 — Run the app
Open a terminal in this folder and run:
```bash
npm install
npm run dev
```

Then open http://localhost:5173 in your browser 🎉

### Step 6 — Share with your partner
You create an account first (you're the "creator").
Send your partner the invite code → they sign up on the Join tab.

---

## What's built so far
- ✅ Phase 1 — Auth (login, signup, invite code, 2-user limit)
- ✅ Phase 2 — Dashboard (4 widgets: messages, dates, memories, notes)
- 🔜 Phase 3 — Chat
- 🔜 Phase 4 — Important Dates + Countdowns
- 🔜 Phase 5 — Memory Timeline
- 🔜 Phase 6 — Love Notes
- 🔜 Phase 7 — Polish (app lock, themes)

## File structure
```
src/
  lib/firebase.js        ← Firebase config (fill this in!)
  hooks/useAuth.jsx      ← Auth logic + invite code
  pages/
    Login.jsx            ← Sign in + Join screens
    Dashboard.jsx        ← Home dashboard
    Placeholders.jsx     ← Stubs for future pages
  components/
    ProtectedRoute.jsx   ← Guards pages from logged-out users
  App.jsx                ← Routing
  main.jsx               ← Entry point
  index.css              ← Global styles
```
