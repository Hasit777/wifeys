import { useState, useEffect, useCallback } from 'react'

const PIN_KEY = 'justus_pin'
const LOCKED_KEY = 'justus_locked'
const LOCK_AFTER_MS = 5 * 60 * 1000 // 5 minutes of inactivity

export function usePinLock() {
  const [pin, setPin] = useState(() => localStorage.getItem(PIN_KEY) || null)
  const [locked, setLocked] = useState(() => {
    // If pin exists, start locked
    return !!localStorage.getItem(PIN_KEY)
  })
  const [lastActive, setLastActive] = useState(Date.now())

  // Reset inactivity timer on user interaction
  const resetTimer = useCallback(() => {
    setLastActive(Date.now())
  }, [])

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, resetTimer))
  }, [resetTimer])

  // Auto-lock after inactivity
  useEffect(() => {
    if (!pin) return
    const interval = setInterval(() => {
      if (Date.now() - lastActive > LOCK_AFTER_MS) {
        setLocked(true)
      }
    }, 30_000) // check every 30s
    return () => clearInterval(interval)
  }, [pin, lastActive])

  function savePin(newPin) {
    localStorage.setItem(PIN_KEY, newPin)
    setPin(newPin)
    setLocked(false)
  }

  function removePin() {
    localStorage.removeItem(PIN_KEY)
    setPin(null)
    setLocked(false)
  }

  function unlock(attempt) {
    if (attempt === pin) {
      setLocked(false)
      setLastActive(Date.now())
      return true
    }
    return false
  }

  function lockNow() {
    if (pin) setLocked(true)
  }

  return { pin, locked, savePin, removePin, unlock, lockNow }
}
