import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyD35PNdjUNu3GMQwDFyK2SShvExzxhC-10",
  authDomain: "justus-1a3c7.firebaseapp.com",
  projectId: "justus-1a3c7",
  storageBucket: "justus-1a3c7.firebasestorage.app",
  messagingSenderId: "1047665019493",
  appId: "1:1047665019493:web:e49a7ea610cacb30a6d48c",
  measurementId: "G-RTY897JNHE"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

// Explicitly persist login across app closes/reopens (don't rely on the
// default — this matters especially once the app is installed as a PWA)
setPersistence(auth, browserLocalPersistence).catch(() => {})

export default app
