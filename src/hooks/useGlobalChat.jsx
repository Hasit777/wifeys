import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './useAuth'
import { useSound } from './useSound'
import { useNotifications } from './useNotifications'

const GlobalChatContext = createContext(null)

// This provider mounts once at the top of the whole app (in App.jsx) and stays
// alive on every page — dashboard, dates, memories, notes, everywhere.
// That's the fix: it is NOT tied to the Chat page being open.
export function GlobalChatProvider({ children }) {
  const { user } = useAuth()
  const { playReceive } = useSound()
  const { notify } = useNotifications()

  const [unreadCount, setUnreadCount] = useState(0)
  const [lastMessage, setLastMessage] = useState(null)

  const prevMsgCountRef = useRef(0)
  const firstLoadRef = useRef(true)
  const isOnChatPageRef = useRef(false)

  // Let the Chat page tell this listener "I'm open right now" so we don't
  // double-fire sounds/notifications while the user is already looking at it.
  function setChatPageOpen(isOpen) {
    isOnChatPageRef.current = isOpen
  }

  useEffect(() => {
    if (!user) {
      setUnreadCount(0)
      setLastMessage(null)
      firstLoadRef.current = true
      prevMsgCountRef.current = 0
      return
    }

    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'))

    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Unread = sent by partner, not yet marked read by me
      const unread = msgs.filter(m => m.senderId !== user.uid && !(m.readBy || []).includes(user.uid))
      setUnreadCount(unread.length)

      if (msgs.length > 0) setLastMessage(msgs[msgs.length - 1])

      // Fire sound + notification for a genuinely new incoming message,
      // no matter which page is currently open
      if (!firstLoadRef.current && msgs.length > prevMsgCountRef.current) {
        const newest = msgs[msgs.length - 1]
        if (newest && newest.senderId !== user.uid) {
          // Don't double-fire the sound if Chat.jsx's own listener already played it
          if (!isOnChatPageRef.current) {
            playReceive()
          }
          notify(`💌 ${newest.senderName || 'Your partner'}`, {
            body: newest.text,
            tag: 'justus-message',
            onClickUrl: '/chat',
          })
        }
      }
      prevMsgCountRef.current = msgs.length
      firstLoadRef.current = false
    })

    return unsub
  }, [user])

  return (
    <GlobalChatContext.Provider value={{ unreadCount, lastMessage, setChatPageOpen }}>
      {children}
    </GlobalChatContext.Provider>
  )
}

export function useGlobalChat() {
  return useContext(GlobalChatContext)
}
