import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, query, orderBy, writeBatch
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth'
import SakuraBackground from '../components/SakuraBackground'
import styles from './Memories.module.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMemoryDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function getMonthYear(dateStr) {
  if (!dateStr) return 'Unknown'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function groupByMonth(memories) {
  const groups = []
  let lastMonth = null
  memories.forEach(m => {
    const month = getMonthYear(m.date)
    if (month !== lastMonth) {
      groups.push({ type: 'header', id: 'h-' + month, label: month })
      lastMonth = month
    }
    groups.push({ type: 'memory', ...m })
  })
  return groups
}

function toDateInputValue(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Compress + convert image to base64 (keeps it under Firestore's 1MB doc limit)
function compressImage(file, maxWidth = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const base64 = canvas.toDataURL('image/jpeg', quality)
      URL.revokeObjectURL(url)
      resolve(base64)
    }
    img.onerror = reject
    img.src = url
  })
}

// Try to read the date a photo was actually taken from its EXIF data.
// Falls back to the file's last-modified date, then to today.
async function getPhotoDate(file) {
  try {
    const exifr = await import('exifr')
    const exifDate = await exifr.default.parse(file, ['DateTimeOriginal', 'CreateDate'])
    const taken = exifDate?.DateTimeOriginal || exifDate?.CreateDate
    if (taken instanceof Date && !isNaN(taken)) return taken
  } catch (_) {
    // No EXIF data, or not a JPEG — that's fine, fall through
  }
  if (file.lastModified) {
    const d = new Date(file.lastModified)
    if (!isNaN(d)) return d
  }
  return new Date()
}

const TAG_OPTIONS = [
  { value: 'us',        label: '💑 Us' },
  { value: 'food',      label: '🍽️ Food' },
  { value: 'travel',    label: '✈️ Travel' },
  { value: 'home',      label: '🏠 Home' },
  { value: 'milestone', label: '🌟 Milestone' },
  { value: 'silly',     label: '😂 Silly' },
  { value: 'romantic',  label: '🌹 Romantic' },
  { value: 'other',     label: '📷 Other' },
]

const TAG_ICONS = {
  us: '💑', food: '🍽️', travel: '✈️', home: '🏠',
  milestone: '🌟', silly: '😂', romantic: '🌹', other: '📷',
}

// ─── Batch Add Modal ──────────────────────────────────────────────────────────

function BatchAddModal({ onClose, onSaveAll }) {
  // items: [{ id, file, preview, date, tag, caption, status }]
  const [items, setItems] = useState([])
  const [bulkTag, setBulkTag] = useState('us')
  const [saving, setSaving] = useState(false)
  const [readingDates, setReadingDates] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [expandedId, setExpandedId] = useState(null)
  const fileRef = useRef(null)

  async function pickFiles(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setReadingDates(true)

    const newItems = await Promise.all(files.map(async (file, i) => {
      const date = await getPhotoDate(file)
      return {
        id: `${Date.now()}_${i}`,
        file,
        preview: URL.createObjectURL(file),
        date: toDateInputValue(date),
        tag: bulkTag,
        caption: '',
      }
    }))

    setItems(prev => [...prev, ...newItems])
    setReadingDates(false)
  }

  function removeItem(id) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function updateItem(id, patch) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  function applyBulkTag(tag) {
    setBulkTag(tag)
    setItems(prev => prev.map(i => ({ ...i, tag })))
  }

  async function handleSaveAll() {
    if (items.length === 0) return
    setSaving(true)
    setProgress({ done: 0, total: items.length })

    for (const item of items) {
      const photoBase64 = await compressImage(item.file)
      await onSaveAll({
        caption: item.caption.trim(),
        date: item.date,
        tag: item.tag,
        photoBase64,
      })
      setProgress(p => ({ ...p, done: p.done + 1 }))
    }

    setSaving(false)
    onClose()
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add memories 📸</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {items.length === 0 ? (
          <div
            className={styles.batchPicker}
            onClick={() => fileRef.current?.click()}
          >
            <span className={styles.photoPlaceholderIcon}>📷</span>
            <p className={styles.photoPlaceholderText}>
              {readingDates ? 'Reading photo dates…' : 'Tap to choose photos'}
            </p>
            <p className={styles.photoPlaceholderSub}>
              Select as many as you want — dates are picked up automatically
            </p>
          </div>
        ) : (
          <>
            <p className={styles.batchCount}>
              {items.length} photo{items.length !== 1 ? 's' : ''} ready
              {' · '}
              <button className={styles.addMoreBtn} onClick={() => fileRef.current?.click()}>
                + add more
              </button>
            </p>

            {/* Bulk tag — applies to all at once */}
            <div className={styles.field}>
              <label className={styles.label}>Tag all as</label>
              <div className={styles.catGrid}>
                {TAG_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`${styles.catBtn} ${bulkTag === opt.value ? styles.catBtnActive : ''}`}
                    onClick={() => applyBulkTag(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Photo strip — tap any photo to fine-tune just that one */}
            <div className={styles.batchGrid}>
              {items.map(item => (
                <div key={item.id} className={styles.batchItem}>
                  <img
                    src={item.preview}
                    alt=""
                    className={styles.batchThumb}
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  />
                  <span className={styles.batchDate}>{formatMemoryDate(item.date)}</span>
                  <button className={styles.batchRemove} onClick={() => removeItem(item.id)}>✕</button>
                </div>
              ))}
            </div>

            {expandedId && items.find(i => i.id === expandedId) && (
              <div className={styles.batchDetail}>
                {(() => {
                  const item = items.find(i => i.id === expandedId)
                  return (
                    <>
                      <img src={item.preview} alt="" className={styles.batchDetailPhoto} />
                      <input
                        className={styles.input}
                        type="date"
                        value={item.date}
                        onChange={e => updateItem(item.id, { date: e.target.value })}
                      />
                      <input
                        className={styles.input}
                        placeholder="Caption (optional)"
                        value={item.caption}
                        onChange={e => updateItem(item.id, { caption: e.target.value })}
                        maxLength={280}
                      />
                      <div className={styles.catGrid}>
                        {TAG_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            className={`${styles.catBtn} ${item.tag === opt.value ? styles.catBtnActive : ''}`}
                            onClick={() => updateItem(item.id, { tag: opt.value })}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <button className={styles.batchDetailClose} onClick={() => setExpandedId(null)}>
                        Done
                      </button>
                    </>
                  )
                })()}
              </div>
            )}

            <p className={styles.hintText}>Tap a photo to edit its date, tag, or add a caption</p>
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={pickFiles}
        />

        {items.length > 0 && (
          <button
            className={styles.saveBtn}
            onClick={handleSaveAll}
            disabled={saving}
          >
            {saving
              ? `Saving ${progress.done}/${progress.total}…`
              : `Save ${items.length} memor${items.length !== 1 ? 'ies' : 'y'} 💖`}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Memory Card ──────────────────────────────────────────────────────────────

function MemoryCard({ item, onDelete, onClick }) {
  return (
    <div className={styles.card} onClick={() => onClick(item)}>
      {item.photoBase64 && (
        <img src={item.photoBase64} alt={item.caption} className={styles.cardPhoto} loading="lazy" />
      )}
      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>
          <span className={styles.cardTag}>{TAG_ICONS[item.tag] || '📷'} {item.tag}</span>
          <span className={styles.cardDate}>{formatMemoryDate(item.date)}</span>
        </div>
        {item.caption && <p className={styles.cardCaption}>{item.caption}</p>}
      </div>
      <button
        className={styles.deleteBtn}
        onClick={e => { e.stopPropagation(); onDelete(item) }}
        title="Remove"
      >✕</button>
    </div>
  )
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ item, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.lightboxOverlay} onClick={onClose}>
      <div className={styles.lightbox} onClick={e => e.stopPropagation()}>
        {item.photoBase64 && (
          <img src={item.photoBase64} alt={item.caption} className={styles.lightboxPhoto} />
        )}
        <div className={styles.lightboxBody}>
          {item.caption && <p className={styles.lightboxCaption}>{item.caption}</p>}
          <p className={styles.lightboxDate}>{formatMemoryDate(item.date)}</p>
        </div>
        <button className={styles.lightboxClose} onClick={onClose}>✕</button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Memories() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [lightboxItem, setLightboxItem] = useState(null)
  const [filterTag, setFilterTag] = useState('all')

  useEffect(() => {
    if (!user) return
    loadMemories()
  }, [user])

  async function loadMemories() {
    setLoading(true)
    try {
      const q = query(collection(db, 'memories'), orderBy('date', 'desc'))
      const snap = await getDocs(q)
      setMemories(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function saveMemory({ caption, date, tag, photoBase64 }) {
    await addDoc(collection(db, 'memories'), {
      caption,
      date,
      tag,
      photoBase64: photoBase64 || null,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    })
  }

  async function saveAllAndReload(data) {
    await saveMemory(data)
  }

  async function deleteMemory(item) {
    await deleteDoc(doc(db, 'memories', item.id))
    setMemories(prev => prev.filter(m => m.id !== item.id))
  }

  const filtered = filterTag === 'all' ? memories : memories.filter(m => m.tag === filterTag)
  const grouped = groupByMonth(filtered)
  const usedTags = [...new Set(memories.map(m => m.tag))]

  return (
    <div className={styles.page}>
      <SakuraBackground />
      <div className={styles.container}>

        <header className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>←</button>
          <div className={styles.headerCenter}>
            <span className={styles.headerEmoji}>📸</span>
            <h1 className={styles.headerTitle}>Our memories</h1>
          </div>
          <button className={styles.addHeaderBtn} onClick={() => setShowAdd(true)}>＋</button>
        </header>

        {memories.length > 0 && (
          <div className={styles.statsPill}>
            <span>{memories.length} moment{memories.length !== 1 ? 's' : ''} saved 💖</span>
          </div>
        )}

        {usedTags.length > 1 && (
          <div className={styles.filters}>
            <button className={`${styles.filterBtn} ${filterTag === 'all' ? styles.filterBtnActive : ''}`} onClick={() => setFilterTag('all')}>All</button>
            {usedTags.map(t => (
              <button key={t} className={`${styles.filterBtn} ${filterTag === t ? styles.filterBtnActive : ''}`} onClick={() => setFilterTag(t)}>
                {TAG_ICONS[t]} {t}
              </button>
            ))}
          </div>
        )}

        <div className={styles.timeline}>
          {loading && <p className={styles.loadingText}>Loading…</p>}

          {!loading && memories.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyEmoji}>📸</span>
              <p className={styles.emptyTitle}>No memories yet</p>
              <p className={styles.emptySub}>Start saving the little moments 💖</p>
              <button className={styles.emptyBtn} onClick={() => setShowAdd(true)}>Add your first memories</button>
            </div>
          )}

          {!loading && filtered.length === 0 && memories.length > 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyEmoji}>{TAG_ICONS[filterTag]}</span>
              <p className={styles.emptyTitle}>No {filterTag} memories yet</p>
            </div>
          )}

          {grouped.map(item => {
            if (item.type === 'header') {
              return <div key={item.id} className={styles.monthHeader}><span>{item.label}</span></div>
            }
            return <MemoryCard key={item.id} item={item} onDelete={deleteMemory} onClick={setLightboxItem} />
          })}
        </div>

        <button className={styles.fab} onClick={() => setShowAdd(true)}>＋</button>
      </div>

      {showAdd && (
        <BatchAddModal
          onClose={() => { setShowAdd(false); loadMemories() }}
          onSaveAll={saveAllAndReload}
        />
      )}
      {lightboxItem && <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />}
    </div>
  )
}
