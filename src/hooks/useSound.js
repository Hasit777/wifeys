import { useRef, useCallback, useState } from 'react'

export function useSound() {
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem('justus_sound')
    return saved === null ? true : saved === 'true'
  })

  const ctxRef = useRef(null)

  function getCtx() {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return ctxRef.current
  }

  // Soft two-tone chime for sending a message
  const playSend = useCallback(() => {
    if (!enabled) return
    try {
      const ctx = getCtx()
      const now = ctx.currentTime
      ;[880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, now + i * 0.06)
        gain.gain.linearRampToValueAtTime(0.08, now + i * 0.06 + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.18)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + i * 0.06)
        osc.stop(now + i * 0.06 + 0.2)
      })
    } catch (_) {}
  }, [enabled])

  // Gentle single pop for receiving a message
  const playReceive = useCallback(() => {
    if (!enabled) return
    try {
      const ctx = getCtx()
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, now)
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.08)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.07, now + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.25)
    } catch (_) {}
  }, [enabled])

  function toggleSound() {
    setEnabled(prev => {
      const next = !prev
      localStorage.setItem('justus_sound', String(next))
      return next
    })
  }

  return { enabled, toggleSound, playSend, playReceive }
}
