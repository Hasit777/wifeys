import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth'
import { usePinLock } from '../hooks/usePinLock'
import { useTheme } from '../hooks/useTheme'
import { useFcm } from '../hooks/useFcm'
import { useGlobalChat } from '../hooks/useGlobalChat'
import PinLock from '../components/PinLock'
import { CatOfTheDayWidget, CatManageModal } from '../components/CatOfTheDay'
import styles from './Dashboard.module.css'
import SakuraBackground from '../components/SakuraBackground'

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getCountdown(dateStr) {
  const target = new Date(dateStr)
  const now = new Date()
  const diff = target - now
  if (diff < 0) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''} away`
  return `${hours} hour${hours !== 1 ? 's' : ''} away`
}

export default function Dashboard() {
  const { user, profile, logout, INVITE_CODE } = useAuth()
  const navigate = useNavigate()
  const { pin, locked, savePin, removePin, unlock, lockNow } = usePinLock()
  const { theme, toggleTheme } = useTheme()
  const { permission: notifPermission, requestPermissionAndRegister, lastError: fcmError } = useFcm()
  const { unreadCount } = useGlobalChat()

  const [latestMessage, setLatestMessage] = useState(null)
  const [nextDate, setNextDate] = useState(null)
  const [latestMemory, setLatestMemory] = useState(null)
  const [dailyNote, setDailyNote] = useState(null)
  const [partnerName, setPartnerName] = useState(null)
  const [copied, setCopied] = useState(false)
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)

  useEffect(() => {
    if (!user) return
    loadDashboard()
  }, [user])

  async function loadDashboard() {
    try {
      const msgQ = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(1))
      const msgSnap = await getDocs(msgQ)
      if (!msgSnap.empty) setLatestMessage(msgSnap.docs[0].data())

      const datesSnap = await getDocs(collection(db, 'dates'))
      const now = new Date()
      const upcoming = datesSnap.docs
        .map(d => d.data())
        .filter(d => new Date(d.date) > now)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
      if (upcoming.length > 0) setNextDate(upcoming[0])

      const memQ = query(collection(db, 'memories'), orderBy('date', 'desc'), limit(1))
      const memSnap = await getDocs(memQ)
      if (!memSnap.empty) setLatestMemory(memSnap.docs[0].data())

      const noteQ = query(collection(db, 'notes'), limit(1))
      const noteSnap = await getDocs(noteQ)
      if (!noteSnap.empty) setDailyNote(noteSnap.docs[0].data())

      const usersSnap = await getDocs(collection(db, 'users'))
      usersSnap.forEach(d => {
        if (d.id !== user.uid) setPartnerName(d.data().name)
      })
    } catch (e) {
      console.error(e)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  function copyCode() {
    navigator.clipboard?.writeText(INVITE_CODE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const firstName = profile?.name?.split(' ')[0] || 'you'

  // Show PIN lock screen
  if (locked) {
    return <PinLock mode="unlock" onUnlock={unlock} />
  }

  // Show PIN setup flow
  if (showPinSetup) {
    return (
      <PinLock
        mode="set"
        onSetPin={(newPin) => { savePin(newPin); setShowPinSetup(false) }}
        onCancel={() => setShowPinSetup(false)}
      />
    )
  }

  return (
    <div className={styles.page}>
      <SakuraBackground />

      {/* Cat of the Day — floating top-right corner */}
      <div className={styles.catCorner}>
        <CatOfTheDayWidget onManage={() => setShowCatModal(true)} />
      </div>

      <div className={styles.container}>

        {/* Header */}
        <header className={styles.header}>
          <div>
            <p className={styles.greeting}>{getTimeOfDay()},</p>
            <h1 className={styles.name}>Wifey's App 💖</h1>
          </div>

          <div className={styles.headerActions}>
            {/* Theme toggle */}
            <button className={styles.btnTheme} onClick={toggleTheme} title="Toggle theme">
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            {/* Lock button — shown if pin is set */}
            {pin && (
              <button className={styles.btnLock} onClick={lockNow} title="Lock app">
                🔒
              </button>
            )}
            {/* PIN settings */}
            <button className={styles.btnPin} onClick={() => {
              if (pin) { removePin() } else { setShowPinSetup(true) }
            }} title={pin ? 'Remove PIN' : 'Set PIN'}>
              {pin ? '🔓' : '🔐'}
            </button>
            <button className={styles.btnSignOut} onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        {/* PIN hint */}
        {!pin && (
          <div className={styles.pinHint} onClick={() => setShowPinSetup(true)}>
            <span>🔐</span>
            <span>Tap 🔐 to set a PIN lock for privacy</span>
          </div>
        )}

        {/* Notification permission hint */}
        {notifPermission === 'default' && (
          <div className={styles.pinHint} onClick={requestPermissionAndRegister}>
            <span>🔔</span>
            <span>Turn on notifications so you never miss a message — even with the app closed</span>
          </div>
        )}
        {notifPermission === 'denied' && (
          <div className={styles.pinHintMuted}>
            <span>🔕</span>
            <span>Notifications are blocked — enable them in your browser settings</span>
          </div>
        )}
        {notifPermission === 'granted' && fcmError && (
          <div className={styles.pinHintMuted} onClick={requestPermissionAndRegister}>
            <span>⚠️</span>
            <span>Notification setup error: {fcmError} — tap to retry</span>
          </div>
        )}

        {/* Invite */}
        {!partnerName && profile?.role === 'creator' && (
          <div className={styles.inviteBanner}>
            <div className={styles.inviteBannerLeft}>
              <span className={styles.inviteBannerIcon}>💌</span>
              <div>
                <p className={styles.inviteBannerTitle}>For my princess</p>
                <p className={styles.inviteBannerSub}>this space is only for you</p>
              </div>
            </div>
            <div className={styles.codeRow}>
              <span className={styles.code}>{INVITE_CODE}</span>
              <button className={styles.btnCopy} onClick={copyCode}>
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Partner */}
        {partnerName && (
          <div className={styles.partnerPill}>
            <span className={styles.dot} />
            <span><strong>{partnerName}</strong> is here with you 💖</span>
          </div>
        )}

        {/* Widgets */}
        <div className={styles.grid}>

          <div className={styles.widget} onClick={() => navigate('/chat')}>
            <div className={styles.widgetHeader}>
              <span className={styles.widgetIcon}>💬</span>
              <span className={styles.widgetLabel}>Our words</span>
              {unreadCount > 0 ? (
                <span className={styles.unreadBadge}>{unreadCount}</span>
              ) : (
                <span className={styles.widgetArrow}>→</span>
              )}
            </div>
            {latestMessage ? (
              <>
                <p className={styles.widgetBig}>"{latestMessage.text}"</p>
                <p className={styles.widgetSub}>sent with love 💖</p>
              </>
            ) : (
              <>
                <p className={styles.widgetBig}>No messages yet</p>
                <p className={styles.widgetSub}>say something sweet 💬</p>
              </>
            )}
          </div>

          <div className={styles.widget} onClick={() => navigate('/dates')}>
            <div className={styles.widgetHeader}>
              <span className={styles.widgetIcon}>⏳</span>
              <span className={styles.widgetLabel}>Moments ahead</span>
              <span className={styles.widgetArrow}>→</span>
            </div>
            {nextDate ? (
              <>
                <p className={styles.widgetBig}>{nextDate.title}</p>
                <p className={styles.widgetCountdown}>{getCountdown(nextDate.date)}</p>
              </>
            ) : (
              <>
                <p className={styles.widgetBig}>No plans yet</p>
                <p className={styles.widgetSub}>let's make memories 💖</p>
              </>
            )}
          </div>

          <div className={styles.widget} onClick={() => navigate('/memories')}>
            <div className={styles.widgetHeader}>
              <span className={styles.widgetIcon}>📸</span>
              <span className={styles.widgetLabel}>Our memories</span>
              <span className={styles.widgetArrow}>→</span>
            </div>
            {latestMemory ? (
              <>
                <p className={styles.widgetBig}>{latestMemory.caption}</p>
                <p className={styles.widgetSub}>a moment we saved 💖</p>
              </>
            ) : (
              <>
                <p className={styles.widgetBig}>No memories yet</p>
                <p className={styles.widgetSub}>start our story 📸</p>
              </>
            )}
          </div>

          <div className={styles.widget} onClick={() => navigate('/notes')}>
            <div className={styles.widgetHeader}>
              <span className={styles.widgetIcon}>❤️</span>
              <span className={styles.widgetLabel}>Love notes</span>
              <span className={styles.widgetArrow}>→</span>
            </div>
            {dailyNote ? (
              <>
                <p className={styles.widgetBig}>"{dailyNote.body?.slice(0, 60)}{dailyNote.body?.length > 60 ? '…' : ''}"</p>
                <p className={styles.widgetSub}>from the heart 💖</p>
              </>
            ) : (
              <>
                <p className={styles.widgetBig}>No notes yet</p>
                <p className={styles.widgetSub}>write something sweet ❤️</p>
              </>
            )}
          </div>

        </div>

        <p className={styles.footer}>Wifey's App · only for you 💖</p>

      </div>

      {showCatModal && (
        <CatManageModal onClose={() => setShowCatModal(false)} />
      )}
    </div>
  )
}
