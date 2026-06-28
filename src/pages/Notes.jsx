import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, query, orderBy, updateDoc
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth'
import SakuraBackground from '../components/SakuraBackground'
import styles from './Notes.module.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const MOODS = [
  { value: 'love',      emoji: '🥰', label: 'Love' },
  { value: 'miss',      emoji: '💭', label: 'Missing you' },
  { value: 'grateful',  emoji: '🙏', label: 'Grateful' },
  { value: 'funny',     emoji: '😂', label: 'Funny' },
  { value: 'sorry',     emoji: '🫶', label: 'Sorry' },
  { value: 'proud',     emoji: '🌟', label: 'Proud' },
]

const MOOD_COLORS = {
  love:     { bg: 'rgba(255,79,139,0.08)',  border: 'rgba(255,79,139,0.25)',  text: 'var(--pink)' },
  miss:     { bg: 'rgba(183,156,255,0.08)', border: 'rgba(183,156,255,0.25)', text: 'var(--purple)' },
  grateful: { bg: 'rgba(125,223,176,0.08)', border: 'rgba(125,223,176,0.25)', text: 'var(--green)' },
  funny:    { bg: 'rgba(255,214,0,0.08)',   border: 'rgba(255,214,0,0.2)',    text: '#d4a800' },
  sorry:    { bg: 'rgba(255,150,100,0.08)', border: 'rgba(255,150,100,0.25)', text: '#e07040' },
  proud:    { bg: 'rgba(100,180,255,0.08)', border: 'rgba(100,180,255,0.25)', text: '#4a9ed4' },
}

function formatDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Compose Modal ────────────────────────────────────────────────────────────

function ComposeModal({ onClose, onSave }) {
  const [body, setBody] = useState('')
  const [mood, setMood] = useState('love')
  const [saving, setSaving] = useState(false)
  const MAX = 600

  async function handleSave() {
    if (!body.trim()) return
    setSaving(true)
    await onSave({ body: body.trim(), mood })
    setSaving(false)
    onClose()
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Write a note ❤️</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Mood</label>
          <div className={styles.moodGrid}>
            {MOODS.map(m => (
              <button
                key={m.value}
                className={`${styles.moodBtn} ${mood === m.value ? styles.moodBtnActive : ''}`}
                onClick={() => setMood(m.value)}
                style={mood === m.value ? {
                  background: MOOD_COLORS[m.value].bg,
                  borderColor: MOOD_COLORS[m.value].border,
                  color: MOOD_COLORS[m.value].text,
                } : {}}
              >
                <span>{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Your note</label>
          <textarea
            className={styles.textarea}
            placeholder="Say whatever's on your heart…"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            maxLength={MAX}
            autoFocus
          />
          <p className={styles.charCount}>{body.length}/{MAX}</p>
        </div>

        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!body.trim() || saving}
        >
          {saving ? 'Sending…' : 'Send note 💌'}
        </button>
      </div>
    </div>
  )
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({ item, currentUserId, onDelete, onPin }) {
  const isMine = item.createdBy === currentUserId
  const moodObj = MOODS.find(m => m.value === item.mood) || MOODS[0]
  const colors = MOOD_COLORS[item.mood] || MOOD_COLORS.love
  const [expanded, setExpanded] = useState(false)
  const isLong = item.body.length > 180

  return (
    <div
      className={`${styles.card} ${item.pinned ? styles.cardPinned : ''}`}
      style={{ borderColor: item.pinned ? colors.border : undefined }}
    >
      {/* Top row */}
      <div className={styles.cardTop}>
        <div className={styles.cardTopLeft}>
          <span
            className={styles.moodBadge}
            style={{ background: colors.bg, borderColor: colors.border, color: colors.text }}
          >
            {moodObj.emoji} {moodObj.label}
          </span>
          {item.pinned && <span className={styles.pinnedBadge}>📌 pinned</span>}
        </div>
        <div className={styles.cardActions}>
          <button
            className={styles.actionBtn}
            onClick={() => onPin(item)}
            title={item.pinned ? 'Unpin' : 'Pin'}
          >
            {item.pinned ? '📌' : '📍'}
          </button>
          {isMine && (
            <button className={styles.actionBtn} onClick={() => onDelete(item)} title="Delete">✕</button>
          )}
        </div>
      </div>

      {/* Body */}
      <p className={`${styles.cardBody} ${!expanded && isLong ? styles.cardBodyClamped : ''}`}>
        {item.body}
      </p>
      {isLong && (
        <button className={styles.expandBtn} onClick={() => setExpanded(p => !p)}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

      {/* Footer */}
      <div className={styles.cardFooter}>
        <span className={styles.cardFrom}>{isMine ? 'from you' : 'from her'} · {formatDate(item.createdAt)}</span>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Notes() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCompose, setShowCompose] = useState(false)
  const [filterMood, setFilterMood] = useState('all')
  const [tab, setTab] = useState('all') // 'all' | 'mine' | 'hers' | 'pinned'

  useEffect(() => {
    if (!user) return
    loadNotes()
  }, [user])

  async function loadNotes() {
    setLoading(true)
    try {
      const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function saveNote({ body, mood }) {
    await addDoc(collection(db, 'notes'), {
      body,
      mood,
      pinned: false,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    })
    loadNotes()
  }

  async function deleteNote(item) {
    await deleteDoc(doc(db, 'notes', item.id))
    setNotes(prev => prev.filter(n => n.id !== item.id))
  }

  async function togglePin(item) {
    const newVal = !item.pinned
    await updateDoc(doc(db, 'notes', item.id), { pinned: newVal })
    setNotes(prev => prev.map(n => n.id === item.id ? { ...n, pinned: newVal } : n))
  }

  // Sort: pinned first
  const sorted = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return 0
  })

  let filtered = sorted
  if (tab === 'mine')   filtered = filtered.filter(n => n.createdBy === user.uid)
  if (tab === 'hers')   filtered = filtered.filter(n => n.createdBy !== user.uid)
  if (tab === 'pinned') filtered = filtered.filter(n => n.pinned)
  if (filterMood !== 'all') filtered = filtered.filter(n => n.mood === filterMood)

  const pinnedCount = notes.filter(n => n.pinned).length
  const mineCount   = notes.filter(n => n.createdBy === user?.uid).length
  const hersCount   = notes.filter(n => n.createdBy !== user?.uid).length

  return (
    <div className={styles.page}>
      <SakuraBackground />
      <div className={styles.container}>

        {/* Header */}
        <header className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>←</button>
          <div className={styles.headerCenter}>
            <span className={styles.headerEmoji}>💌</span>
            <h1 className={styles.headerTitle}>Love notes</h1>
          </div>
          <button className={styles.addHeaderBtn} onClick={() => setShowCompose(true)}>＋</button>
        </header>

        {/* Stats */}
        {notes.length > 0 && (
          <div className={styles.statsRow}>
            <div className={styles.statChip}>
              <span className={styles.statNum}>{notes.length}</span>
              <span className={styles.statLabel}>notes</span>
            </div>
            <div className={styles.statChip}>
              <span className={styles.statNum}>{mineCount}</span>
              <span className={styles.statLabel}>from you</span>
            </div>
            <div className={styles.statChip}>
              <span className={styles.statNum}>{hersCount}</span>
              <span className={styles.statLabel}>from her</span>
            </div>
            <div className={styles.statChip}>
              <span className={styles.statNum}>{pinnedCount}</span>
              <span className={styles.statLabel}>pinned</span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs}>
          {[
            { key: 'all',    label: 'All' },
            { key: 'mine',   label: 'From you' },
            { key: 'hers',   label: 'From her' },
            { key: 'pinned', label: '📌 Pinned' },
          ].map(t => (
            <button
              key={t.key}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Mood filter */}
        {notes.length > 0 && (
          <div className={styles.moodFilters}>
            <button
              className={`${styles.moodFilterBtn} ${filterMood === 'all' ? styles.moodFilterBtnActive : ''}`}
              onClick={() => setFilterMood('all')}
            >
              All moods
            </button>
            {MOODS.map(m => (
              <button
                key={m.value}
                className={`${styles.moodFilterBtn} ${filterMood === m.value ? styles.moodFilterBtnActive : ''}`}
                onClick={() => setFilterMood(filterMood === m.value ? 'all' : m.value)}
                style={filterMood === m.value ? {
                  background: MOOD_COLORS[m.value].bg,
                  borderColor: MOOD_COLORS[m.value].border,
                  color: MOOD_COLORS[m.value].text,
                } : {}}
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Notes list */}
        <div className={styles.list}>
          {loading && <p className={styles.loadingText}>Loading…</p>}

          {!loading && notes.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyEmoji}>💌</span>
              <p className={styles.emptyTitle}>No notes yet</p>
              <p className={styles.emptySub}>Write her something sweet 💖</p>
              <button className={styles.emptyBtn} onClick={() => setShowCompose(true)}>
                Write a note
              </button>
            </div>
          )}

          {!loading && filtered.length === 0 && notes.length > 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyEmoji}>🔍</span>
              <p className={styles.emptyTitle}>Nothing here</p>
              <p className={styles.emptySub}>Try a different filter</p>
            </div>
          )}

          {filtered.map(item => (
            <NoteCard
              key={item.id}
              item={item}
              currentUserId={user.uid}
              onDelete={deleteNote}
              onPin={togglePin}
            />
          ))}
        </div>

        {/* FAB */}
        <button className={styles.fab} onClick={() => setShowCompose(true)}>💌</button>
      </div>

      {showCompose && (
        <ComposeModal onClose={() => setShowCompose(false)} onSave={saveNote} />
      )}
    </div>
  )
}
