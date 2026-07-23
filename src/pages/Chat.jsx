import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove,
  getDocs, getDoc, writeBatch, where, setDoc, deleteField
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../hooks/useAuth'
import { useSound } from '../hooks/useSound'
import { useGlobalChat } from '../hooks/useGlobalChat'
import styles from './Chat.module.css'

// ─── Emoji picker data ────────────────────────────────────────────────────────
const EMOJIS = [
  '❤️','🩷','🥰','😍','😘','😊','🥺','😂','😭','🙈',
  '✨','🌹','💌','💋','🤍','💫','🌙','☀️','🦋','🌸',
  '🥂','🍓','🫶','🤗','😏','🫠','💯','🔥','👀','😴',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateHeader(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function groupByDate(messages) {
  const groups = []
  let lastDate = null
  messages.forEach(msg => {
    const d = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date()
    const dateStr = d.toDateString()
    if (dateStr !== lastDate) {
      groups.push({ type: 'date', id: 'date-' + dateStr, label: formatDateHeader(msg.createdAt) })
      lastDate = dateStr
    }
    groups.push({ type: 'msg', ...msg })
  })
  return groups
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine, onLongPress, onReact, partnerName }) {
  const pressTimer = useRef(null)
  const [pressing, setPressing] = useState(false)

  function startPress() {
    setPressing(true)
    pressTimer.current = setTimeout(() => {
      onLongPress(msg)
    }, 500)
  }

  function endPress() {
    setPressing(false)
    clearTimeout(pressTimer.current)
  }

  const isSticker = msg.type === 'sticker'

  return (
    <div
      className={`${styles.bubbleRow} ${isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs}`}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
    >
      {/* Pinned / fav badges */}
      <div className={`${styles.bubble} ${isSticker ? styles.stickerBubble : (isMine ? styles.bubbleMine : styles.bubbleTheirs)} ${pressing ? styles.bubblePressing : ''}`}>
        {(msg.pinned || msg.favourited) && (
          <div className={styles.bubbleBadges}>
            {msg.pinned && <span className={styles.badge}>📌</span>}
            {msg.favourited && <span className={styles.badge}>⭐</span>}
          </div>
        )}

        {isSticker ? (
          <img src={msg.stickerUrl} alt="🐱" className={styles.stickerImg} draggable={false} />
        ) : (
          <p className={styles.bubbleText}>{msg.text}</p>
        )}

        {/* Reactions */}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className={styles.reactions}>
            {[...new Set(msg.reactions)].map(r => {
              const count = msg.reactions.filter(x => x === r).length
              return (
                <span
                  key={r}
                  className={styles.reactionPill}
                  onClick={e => { e.stopPropagation(); onReact(msg, r) }}
                >
                  {r}{count > 1 ? ` ${count}` : ''}
                </span>
              )
            })}
          </div>
        )}

        <div className={styles.bubbleMeta}>
          <span className={styles.bubbleTime}>{formatTime(msg.createdAt)}</span>
          {isMine && (
            <span className={styles.readReceipt} title={msg.readBy?.length > 1 ? 'Seen' : 'Sent'}>
              {msg.readBy?.length > 1 ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function ContextMenu({ msg, isMine, onClose, onPin, onFav, onReact }) {
  const menuRef = useRef(null)

  useEffect(() => {
    function outside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('touchstart', outside)
    }
  }, [onClose])

  return (
    <div className={styles.contextOverlay}>
      <div ref={menuRef} className={styles.contextMenu}>
        <div className={styles.contextPreview}>
          <p>
            {msg.type === 'sticker'
              ? '🐱 Sticker'
              : (msg.text.length > 60 ? msg.text.slice(0, 60) + '…' : msg.text)}
          </p>
        </div>

        {/* Quick reactions */}
        <div className={styles.contextReactions}>
          {['❤️','😂','😭','🥺','🔥','✨'].map(e => (
            <button key={e} className={styles.contextReactionBtn} onClick={() => { onReact(msg, e); onClose() }}>
              {e}
            </button>
          ))}
        </div>

        <div className={styles.contextActions}>
          <button className={styles.contextAction} onClick={() => { onPin(msg); onClose() }}>
            <span>{msg.pinned ? '📌 Unpin' : '📌 Pin message'}</span>
          </button>
          <button className={styles.contextAction} onClick={() => { onFav(msg); onClose() }}>
            <span>{msg.favourited ? '⭐ Unfavourite' : '⭐ Favourite'}</span>
          </button>
        </div>

        <button className={styles.contextCancel} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Main Chat Page ───────────────────────────────────────────────────────────
export default function Chat() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [contextMsg, setContextMsg] = useState(null)
  const [tab, setTab] = useState('all') // 'all' | 'pinned' | 'favourites'
  const [partnerName, setPartnerName] = useState('')
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [cats, setCats] = useState([])
  const [showStickers, setShowStickers] = useState(false)
  const [sendingSticker, setSendingSticker] = useState(null)

  const { enabled: soundOn, toggleSound, playSend, playReceive } = useSound()
  const { setChatPageOpen } = useGlobalChat()

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const messagesRef = collection(db, 'messages')
  const typingTimeoutRef = useRef(null)

  // Load cat photos (same collection Cat of the Day uses) so their cropped
  // faces can be sent as little emoji-style stickers in chat
  useEffect(() => {
    if (!user) return
    getDocs(collection(db, 'cats'))
      .then(snap => setCats(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(e => console.error(e))
  }, [user])

  // Tell the global chat listener "I'm open" so it doesn't double-play
  // the receive sound while this page is already visible
  useEffect(() => {
    setChatPageOpen(true)
    return () => setChatPageOpen(false)
  }, [])

  // Load partner name
  useEffect(() => {
    if (!user) return
    getDocs(collection(db, 'users')).then(snap => {
      snap.forEach(d => {
        if (d.id !== user.uid) setPartnerName(d.data().name)
      })
    })
  }, [user])

  const localPrevCountRef = useRef(0)
  const localFirstLoadRef = useRef(true)

  // Real-time message listener — renders the chat itself.
  // Browser notifications for incoming messages are handled globally
  // (useGlobalChat) so they work on every page, not just while this is open.
  // The receive *sound* is still played from here too, since the global
  // listener intentionally skips it while this page is the active one.
  useEffect(() => {
    if (!user) return
    const q = query(messagesRef, orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      if (!localFirstLoadRef.current && msgs.length > localPrevCountRef.current) {
        const newest = msgs[msgs.length - 1]
        if (newest && newest.senderId !== user.uid) playReceive()
      }
      localPrevCountRef.current = msgs.length
      localFirstLoadRef.current = false

      setMessages(msgs)

      // Mark unread messages as read
      const batch = writeBatch(db)
      let dirty = false
      snap.docs.forEach(d => {
        const data = d.data()
        if (data.senderId !== user.uid && !(data.readBy || []).includes(user.uid)) {
          batch.update(d.ref, { readBy: arrayUnion(user.uid) })
          dirty = true
        }
      })
      if (dirty) batch.commit()
    })
    return unsub
  }, [user])

  // Typing indicator — listen for partner's typing status
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'typingStatus', 'status'), snap => {
      if (!snap.exists()) { setPartnerTyping(false); return }
      const data = snap.data()
      const partnerEntry = Object.entries(data).find(([uid]) => uid !== user.uid)
      if (!partnerEntry) { setPartnerTyping(false); return }
      const [, info] = partnerEntry
      const isRecent = info?.at && (Date.now() - info.at.toMillis()) < 4000
      setPartnerTyping(!!info?.typing && isRecent)
    })
    return unsub
  }, [user])

  // Broadcast my typing status (debounced clear after 2.5s of no keystrokes)
  function broadcastTyping(isTyping) {
    if (!user) return
    setDoc(doc(db, 'typingStatus', 'status'), {
      [user.uid]: { typing: isTyping, at: serverTimestamp() }
    }, { merge: true }).catch(() => {})
  }

  function handleTextChange(value) {
    setText(value)
    if (!typingTimeoutRef.current) broadcastTyping(true)
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(false)
      typingTimeoutRef.current = null
    }, 2000)
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, partnerTyping])

  // Send message
  async function sendMessage() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    setShowEmoji(false)
    setShowStickers(false)
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = null
    broadcastTyping(false)
    try {
      await addDoc(messagesRef, {
        text: trimmed,
        senderId: user.uid,
        senderName: profile?.name || 'You',
        createdAt: serverTimestamp(),
        readBy: [user.uid],
        pinned: false,
        favourited: false,
        reactions: [],
      })
      playSend()
      // Push a real notification to the partner's device — this is what
      // wakes their phone even if their app is fully closed
      pushToPartner(trimmed)
    } catch (e) {
      console.error(e)
      setText(trimmed) // restore on error
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  // Look up the partner's saved FCM token and ask our Vercel endpoint to
  // push a notification to it. Fails silently — a missed push notification
  // should never block or break sending the actual message.
  async function pushToPartner(messageText) {
    try {
      const usersSnap = await getDocs(collection(db, 'users'))
      let partnerUid = null
      usersSnap.forEach(d => {
        if (d.id !== user.uid) partnerUid = d.id
      })
      if (!partnerUid) {
        console.warn('[push] No partner account found yet')
        return
      }

      const tokenSnap = await getDoc(doc(db, 'fcmTokens', partnerUid))
      if (!tokenSnap.exists()) {
        console.warn('[push] Partner has no saved FCM token — they need to tap "Turn on notifications" on their device')
        return
      }
      const partnerToken = tokenSnap.data().token
      if (!partnerToken) {
        console.warn('[push] Partner token doc exists but token field is empty')
        return
      }

      const res = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: partnerToken,
          title: `💌 ${profile?.name || 'Your partner'}`,
          body: messageText,
          url: '/chat',
        }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok || !result?.success) {
        console.error('[push] Server rejected the push:', res.status, result)
      } else {
        console.log('[push] Notification sent successfully')
      }
    } catch (e) {
      console.error('[push] Failed to send (non-critical):', e)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function insertEmoji(emoji) {
    setText(t => t + emoji)
    inputRef.current?.focus()
  }

  // Send a cat photo as a little emoji-style sticker (uses the cropped face
  // version if it's ready, otherwise falls back to the full photo)
  async function sendSticker(cat) {
    if (sendingSticker) return
    setSendingSticker(cat.id)
    try {
      await addDoc(messagesRef, {
        type: 'sticker',
        stickerUrl: cat.faceBase64 || cat.photoBase64,
        senderId: user.uid,
        senderName: profile?.name || 'You',
        createdAt: serverTimestamp(),
        readBy: [user.uid],
        pinned: false,
        favourited: false,
        reactions: [],
      })
      playSend()
      pushToPartner('🐱 sent a sticker')
      setShowStickers(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSendingSticker(null)
    }
  }

  // Pin toggle
  async function togglePin(msg) {
    await updateDoc(doc(db, 'messages', msg.id), { pinned: !msg.pinned })
  }

  // Favourite toggle
  async function toggleFav(msg) {
    await updateDoc(doc(db, 'messages', msg.id), { favourited: !msg.favourited })
  }

  // React to a message (toggle)
  async function toggleReact(msg, emoji) {
    const reactions = msg.reactions || []
    // each user can add one of each emoji — we track by emoji string for simplicity
    const hasIt = reactions.includes(emoji)
    await updateDoc(doc(db, 'messages', msg.id), {
      reactions: hasIt ? arrayRemove(emoji) : arrayUnion(emoji)
    })
  }

  // Filtered messages
  const displayed = messages.filter(m => {
    if (tab === 'pinned') return m.pinned
    if (tab === 'favourites') return m.favourited
    return true
  })

  const grouped = groupByDate(displayed)

  return (
    <div className={styles.page}>
      {/* Background orbs */}
      <div className="bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>←</button>
        <div className={styles.headerCenter}>
          <span className={styles.headerEmoji}>💬</span>
          <div>
            <h1 className={styles.headerTitle}>wifeys app</h1>
            {partnerTyping ? (
              <p className={styles.headerSubTyping}>typing…</p>
            ) : partnerName ? (
              <p className={styles.headerSub}>with {partnerName} 🩷</p>
            ) : null}
          </div>
        </div>
        <button
          className={styles.soundToggle}
          onClick={toggleSound}
          title={soundOn ? 'Mute sounds' : 'Unmute sounds'}
        >
          {soundOn ? '🔔' : '🔕'}
        </button>
      </header>

      {/* Filter tabs */}
      <div className={styles.tabs}>
        {[
          { key: 'all',        label: 'All' },
          { key: 'pinned',     label: '📌 Pinned' },
          { key: 'favourites', label: '⭐ Favourites' },
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

      {/* Messages */}
      <div className={styles.messages}>
        {grouped.length === 0 && tab === 'all' && (
          <div className={styles.empty}>
            <span className={styles.emptyEmoji}>💌</span>
            <p className={styles.emptyTitle}>send first message</p>
            <p className={styles.emptySub}>it between us.</p>
          </div>
        )}

        {grouped.length === 0 && tab !== 'all' && (
          <div className={styles.empty}>
            <span className={styles.emptyEmoji}>{tab === 'pinned' ? '📌' : '⭐'}</span>
            <p className={styles.emptyTitle}>No {tab} messages yet</p>
            <p className={styles.emptySub}>Long-press any message to {tab === 'pinned' ? 'pin' : 'favourite'} it.</p>
          </div>
        )}

        {grouped.map(item => {
          if (item.type === 'date') {
            return (
              <div key={item.id} className={styles.dateHeader}>
                <span>{item.label}</span>
              </div>
            )
          }
          const isMine = item.senderId === user?.uid
          return (
            <MessageBubble
              key={item.id}
              msg={item}
              isMine={isMine}
              partnerName={partnerName}
              onLongPress={setContextMsg}
              onReact={toggleReact}
            />
          )
        })}

        {partnerTyping && (
          <div className={`${styles.bubbleRow} ${styles.bubbleRowTheirs}`}>
            <div className={styles.typingBubble}>
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className={styles.inputBar}>
        <button
          className={`${styles.emojiToggle} ${showEmoji ? styles.emojiToggleActive : ''}`}
          onClick={() => { setShowEmoji(s => !s); setShowStickers(false) }}
          title="Emoji"
        >
          🙂
        </button>
        <button
          className={`${styles.stickerToggle} ${showStickers ? styles.stickerToggleActive : ''}`}
          onClick={() => { setShowStickers(s => !s); setShowEmoji(false) }}
          title="Cat stickers"
        >
          {cats[0] ? (
            <img src={cats[0].faceBase64 || cats[0].photoBase64} alt="" className={styles.stickerToggleIcon} />
          ) : '🐱'}
        </button>
        <textarea
          ref={inputRef}
          className={styles.input}
          rows={1}
          placeholder="i miss talking to you wifey"
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          onKeyDown={handleKey}
        />
        <button
          className={`${styles.sendBtn} ${text.trim() ? styles.sendBtnActive : ''}`}
          onClick={sendMessage}
          disabled={!text.trim() || sending}
        >
          ↑
        </button>
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div className={styles.emojiPicker}>
          {EMOJIS.map(e => (
            <button key={e} className={styles.emojiBtn} onClick={() => insertEmoji(e)}>{e}</button>
          ))}
        </div>
      )}

      {/* Cat sticker picker */}
      {showStickers && (
        <div className={styles.stickerPicker}>
          {cats.length === 0 && (
            <p className={styles.stickerPickerEmpty}>
              No cat photos yet — add some from Cat of the Day on the dashboard 🐾
            </p>
          )}
          {cats.map(cat => (
            <img
              key={cat.id}
              src={cat.faceBase64 || cat.photoBase64}
              alt="🐱"
              className={`${styles.stickerThumb} ${sendingSticker === cat.id ? styles.stickerThumbSending : ''}`}
              onClick={() => sendSticker(cat)}
            />
          ))}
        </div>
      )}

      {/* Context menu (long press) */}
      {contextMsg && (
        <ContextMenu
          msg={contextMsg}
          isMine={contextMsg.senderId === user?.uid}
          onClose={() => setContextMsg(null)}
          onPin={togglePin}
          onFav={toggleFav}
          onReact={toggleReact}
        />
      )}
    </div>
  )
}
