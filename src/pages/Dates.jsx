import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, query, orderBy
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth'
import SakuraBackground from '../components/SakuraBackground'
import styles from './Dates.module.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCountdownParts(dateStr) {
  const target = new Date(dateStr)
  const now = new Date()
  // Reset time so day-level accuracy
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = target - today

  if (diff < 0) return null // past
  if (diff === 0) return { label: 'Today 🎉', type: 'today' }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 1) return { label: 'Tomorrow 🩷', type: 'soon' }
  if (days < 7) return { label: `${days} days away`, type: 'soon' }
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return { label: `${weeks} week${weeks !== 1 ? 's' : ''} away`, type: 'upcoming' }
  }
  const months = Math.floor(days / 30)
  return { label: `${months} month${months !== 1 ? 's' : ''} away`, type: 'far' }
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const CATEGORY_OPTIONS = [
  { value: 'anniversary', label: '💑 Anniversary' },
  { value: 'birthday',    label: '🎂 Birthday' },
  { value: 'date',        label: '🌹 Date night' },
  { value: 'trip',        label: '✈️ Trip' },
  { value: 'special',     label: '✨ Special moment' },
  { value: 'other',       label: '📅 Other' },
]

const CATEGORY_ICONS = {
  anniversary: '💑',
  birthday:    '🎂',
  date:        '🌹',
  trip:        '✈️',
  special:     '✨',
  other:       '📅',
}

// ─── Add Date Modal ───────────────────────────────────────────────────────────

function AddDateModal({ onClose, onSave }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('special')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim() || !date) return
    setSaving(true)
    await onSave({ title: title.trim(), date, category, note: note.trim() })
    setSaving(false)
    onClose()
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add a date 📅</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>What is it?</label>
          <input
            className={styles.input}
            placeholder="e.g. Our anniversary, Her birthday…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={60}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>When?</label>
          <input
            className={styles.input}
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Category</label>
          <div className={styles.catGrid}>
            {CATEGORY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`${styles.catBtn} ${category === opt.value ? styles.catBtnActive : ''}`}
                onClick={() => setCategory(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Note (optional)</label>
          <textarea
            className={styles.textarea}
            placeholder="Any details, ideas, or sweet thoughts…"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            maxLength={200}
          />
        </div>

        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!title.trim() || !date || saving}
        >
          {saving ? 'Saving…' : 'Save date 💖'}
        </button>
      </div>
    </div>
  )
}

// ─── Date Card ────────────────────────────────────────────────────────────────

function DateCard({ item, onDelete }) {
  const countdown = getCountdownParts(item.date)
  const isPast = !countdown

  return (
    <div className={`${styles.card} ${isPast ? styles.cardPast : ''}`}>
      <div className={styles.cardLeft}>
        <span className={styles.cardIcon}>{CATEGORY_ICONS[item.category] || '📅'}</span>
      </div>
      <div className={styles.cardBody}>
        <p className={styles.cardTitle}>{item.title}</p>
        <p className={styles.cardDate}>{formatDisplayDate(item.date)}</p>
        {item.note && <p className={styles.cardNote}>{item.note}</p>}
      </div>
      <div className={styles.cardRight}>
        {isPast ? (
          <span className={styles.pastTag}>passed</span>
        ) : (
          <span className={`${styles.countdown} ${styles['countdown_' + countdown.type]}`}>
            {countdown.label}
          </span>
        )}
        <button className={styles.deleteBtn} onClick={() => onDelete(item.id)} title="Remove">
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dates() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [dates, setDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [tab, setTab] = useState('upcoming') // 'upcoming' | 'past'

  useEffect(() => {
    if (!user) return
    loadDates()
  }, [user])

  async function loadDates() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'dates'))
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      all.sort((a, b) => new Date(a.date) - new Date(b.date))
      setDates(all)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function saveDate(data) {
    await addDoc(collection(db, 'dates'), {
      ...data,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    })
    loadDates()
  }

  async function deleteDate(id) {
    await deleteDoc(doc(db, 'dates', id))
    setDates(prev => prev.filter(d => d.id !== id))
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const upcoming = dates.filter(d => {
    const t = new Date(d.date)
    t.setHours(0, 0, 0, 0)
    return t >= now
  })

  const past = dates.filter(d => {
    const t = new Date(d.date)
    t.setHours(0, 0, 0, 0)
    return t < now
  }).reverse() // most recent first

  const displayed = tab === 'upcoming' ? upcoming : past

  // Next upcoming for the hero countdown
  const next = upcoming[0]
  const nextCountdown = next ? getCountdownParts(next.date) : null

  return (
    <div className={styles.page}>
      <SakuraBackground />

      <div className={styles.container}>

        {/* Header */}
        <header className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>←</button>
          <div className={styles.headerCenter}>
            <span className={styles.headerEmoji}>⏳</span>
            <div>
              <h1 className={styles.headerTitle}>Moments ahead</h1>
            </div>
          </div>
          <button className={styles.addHeaderBtn} onClick={() => setShowAdd(true)}>＋</button>
        </header>

        {/* Hero — next upcoming date */}
        {next && nextCountdown && (
          <div className={styles.hero}>
            <p className={styles.heroLabel}>Next up</p>
            <p className={styles.heroTitle}>{next.title}</p>
            <p className={styles.heroDate}>{formatDisplayDate(next.date)}</p>
            <div className={`${styles.heroBadge} ${styles['heroBadge_' + nextCountdown.type]}`}>
              {nextCountdown.label}
            </div>
          </div>
        )}

        {!next && !loading && (
          <div className={styles.hero}>
            <p className={styles.heroLabel}>No plans yet</p>
            <p className={styles.heroTitle}>add the first calendar date baby💖</p>
            <button className={styles.addHeroBtn} onClick={() => setShowAdd(true)}>
              Add a date
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'upcoming' ? styles.tabActive : ''}`}
            onClick={() => setTab('upcoming')}
          >
            Upcoming {upcoming.length > 0 && <span className={styles.badge}>{upcoming.length}</span>}
          </button>
          <button
            className={`${styles.tab} ${tab === 'past' ? styles.tabActive : ''}`}
            onClick={() => setTab('past')}
          >
            Past {past.length > 0 && <span className={styles.badge}>{past.length}</span>}
          </button>
        </div>

        {/* List */}
        <div className={styles.list}>
          {loading && <p className={styles.loadingText}>Loading…</p>}

          {!loading && displayed.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyEmoji}>{tab === 'upcoming' ? '📅' : '🕰️'}</span>
              <p className={styles.emptyTitle}>
                {tab === 'upcoming' ? 'No upcoming dates' : 'No past dates'}
              </p>
              <p className={styles.emptySub}>
                {tab === 'upcoming'
                  ? 'calender for my princess💖'
                  : 'Dates youve added will appear here'}
              </p>
            </div>
          )}

          {displayed.map(item => (
            <DateCard key={item.id} item={item} onDelete={deleteDate} />
          ))}
        </div>

        {/* FAB */}
        <button className={styles.fab} onClick={() => setShowAdd(true)}>＋</button>

      </div>

      {/* Add modal */}
      {showAdd && (
        <AddDateModal onClose={() => setShowAdd(false)} onSave={saveDate} />
      )}
    </div>
  )
}
