import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './Auth.module.css'
import SakuraBackground from '../components/SakuraBackground'


export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('login') // 'login' | 'signup'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Login fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Signup fields
  const [name, setName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  const { signup } = useAuth()

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError('Couldn\'t sign in — check your email and password.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignup(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signup(name, signupEmail, signupPassword, inviteCode)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <SakuraBackground />
      <div className="bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logo}>
          <span className={styles.heart}>🐈</span>
          <h1 className={styles.title}>Wifey’s App 💖</h1>
          <p className={styles.subtitle}>only for you my princess</p>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => { setTab('login'); setError('') }}
          >Sign in</button>
          <button
            className={`${styles.tab} ${tab === 'signup' ? styles.tabActive : ''}`}
            onClick={() => { setTab('signup'); setError('') }}
          >Join</button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {tab === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className={styles.field}>
              <label>Email</label>
              <input type="email" placeholder="you@email.com" value={email}
                onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label>Password</label>
              <input type="password" placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)} required />
            </div>
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <div className={styles.field}>
              <label>Your name</label>
              <input type="text" placeholder="What should we call you?" value={name}
                onChange={e => setName(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label>Email</label>
              <input type="email" placeholder="you@email.com" value={signupEmail}
                onChange={e => setSignupEmail(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label>Password</label>
              <input type="password" placeholder="Create a password" value={signupPassword}
                onChange={e => setSignupPassword(e.target.value)} required />
            </div>
            <div className={styles.divider}>
              <hr /><span>invite code</span><hr />
            </div>
            <div className={styles.inviteBox}>
              <p>This app is private 🔒 — you need the code from your partner to join.</p>
              <input
                type="text"
                placeholder="Enter invite code..."
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
                className={styles.inviteInput}
                required
              />
            </div>
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Creating your space...' : 'Create account →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
