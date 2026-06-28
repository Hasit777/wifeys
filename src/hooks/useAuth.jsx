import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import {
  doc, setDoc, getDoc, collection, query, getDocs
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const AuthContext = createContext(null)

// The secret invite code — change this to whatever you want!
const INVITE_CODE = 'ILYFE'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
        if (snap.exists()) setProfile(snap.data())
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function signup(name, email, password, inviteCode) {
    if (inviteCode.toUpperCase() !== INVITE_CODE) {
      throw new Error('Invalid invite code. Ask your partner for theirs 💌')
    }
    // Check 2-user limit
    const usersSnap = await getDocs(collection(db, 'users'))
    if (usersSnap.size >= 2) {
      throw new Error('This app already has 2 accounts. It\'s invite-only for just you two 🔒')
    }
    const isFirstUser = usersSnap.size === 0
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    const userProfile = {
      uid: cred.user.uid,
      name,
      email,
      role: isFirstUser ? 'creator' : 'partner',
      joinedAt: new Date().toISOString(),
    }
    await setDoc(doc(db, 'users', cred.user.uid), userProfile)
    setProfile(userProfile)
    return cred.user
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const snap = await getDoc(doc(db, 'users', cred.user.uid))
    if (snap.exists()) setProfile(snap.data())
    return cred.user
  }

  async function logout() {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signup, login, logout, INVITE_CODE }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
