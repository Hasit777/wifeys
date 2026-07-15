import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, updateDoc
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { cropCatFaceEmoji } from '../lib/catFace'
import styles from './CatOfTheDay.module.css'

// Compress + convert image to base64 (same approach as Memories — no paid Storage needed)
function compressImage(file, maxWidth = 500, quality = 0.75) {
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

// Deterministic "random" pick — same result all day, for both of you
function pickForToday(arr) {
  if (arr.length === 0) return null
  const today = new Date()
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  const index = seed % arr.length
  return arr[index]
}

// ─── Corner widget shown on the dashboard ─────────────────────────────────────

export function CatOfTheDayWidget({ onManage }) {
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCats()
  }, [])

  async function loadCats() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'cats'))
      setCats(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return null

  if (cats.length === 0) {
    return (
      <button className={styles.emptyWidget} onClick={onManage} title="Add cat photos">
        🐾
      </button>
    )
  }

  const todayCat = pickForToday(cats)

  return (
    <button className={styles.widget} onClick={onManage} title="Cat of the day">
      <img src={todayCat.photoBase64} alt="Cat of the day" className={styles.widgetPhoto} />
    </button>
  )
}

// ─── Management modal — batch upload, no naming ────────────────────────────────

export function CatManageModal({ onClose }) {
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [cropping, setCropping] = useState(false)
  const [cropProgress, setCropProgress] = useState({ done: 0, total: 0 })
  const fileRef = useRef(null)

  useEffect(() => {
    loadCats()
  }, [])

  async function loadCats() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'cats'))
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setCats(loaded)
      processMissingFaces(loaded)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Crop faces for any photo — old or new — that doesn't have one yet.
  // Runs quietly in the background after photos load so every cat that's
  // ever been added ends up with an emoji version, not just new uploads.
  async function processMissingFaces(list) {
    const todo = list.filter(c => !c.faceBase64)
    if (todo.length === 0) return
    setCropping(true)
    setCropProgress({ done: 0, total: todo.length })
    for (const cat of todo) {
      try {
        const faceBase64 = await cropCatFaceEmoji(cat.photoBase64)
        await updateDoc(doc(db, 'cats', cat.id), { faceBase64 })
        setCats(prev => prev.map(c => (c.id === cat.id ? { ...c, faceBase64 } : c)))
      } catch (err) {
        console.error('[cats] face crop failed for', cat.id, err)
      }
      setCropProgress(p => ({ ...p, done: p.done + 1 }))
    }
    setCropping(false)
  }

  async function pickFiles(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setUploading(true)
    setProgress({ done: 0, total: files.length })

    const added = []
    for (const file of files) {
      try {
        const photoBase64 = await compressImage(file)
        const faceBase64 = await cropCatFaceEmoji(photoBase64)
        const ref = await addDoc(collection(db, 'cats'), {
          photoBase64,
          faceBase64,
          createdAt: serverTimestamp(),
        })
        added.push({ id: ref.id, photoBase64, faceBase64 })
      } catch (err) {
        console.error(err)
      }
      setProgress(p => ({ ...p, done: p.done + 1 }))
    }

    setUploading(false)
    setCats(prev => [...prev, ...added])
    loadCats()
  }

  async function handleDelete(id) {
    await deleteDoc(doc(db, 'cats', id))
    setCats(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Cat photos 🐾</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <p className={styles.modalSub}>
          Add as many photos as you want — one shows up on the dashboard each day, same pick for both of you 💖
        </p>

        {cropping && (
          <p className={styles.loadingText}>
            Cropping cat faces for stickers… {cropProgress.done}/{cropProgress.total}
          </p>
        )}

        {/* Existing photos */}
        {loading && <p className={styles.loadingText}>Loading…</p>}

        {!loading && cats.length > 0 && (
          <div className={styles.catGrid}>
            {cats.map(cat => (
              <div key={cat.id} className={styles.catCard}>
                <img src={cat.photoBase64} alt="" className={styles.catPhoto} />
                {cat.faceBase64 && (
                  <img src={cat.faceBase64} alt="" className={styles.catFaceBadge} />
                )}
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(cat.id)}
                  title="Remove"
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {!loading && cats.length === 0 && !uploading && (
          <p className={styles.emptyText}>No photos added yet — add your first ones below 🐱</p>
        )}

        {/* Batch upload */}
        <div className={styles.addSection}>
          <div
            className={styles.batchPicker}
            onClick={() => fileRef.current?.click()}
          >
            <span className={styles.photoPlaceholderIcon}>📷</span>
            <p className={styles.photoPlaceholderText}>
              {uploading ? `Uploading ${progress.done}/${progress.total}…` : 'Tap to choose photos'}
            </p>
            {!uploading && (
              <p className={styles.photoPlaceholderSub}>Select as many as you want at once</p>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={pickFiles}
          />
        </div>
      </div>
    </div>
  )
}
