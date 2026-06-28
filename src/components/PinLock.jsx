import { useState, useEffect, useRef } from 'react'
import styles from './PinLock.module.css'

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function PinLock({ mode = 'unlock', onUnlock, onSetPin, onCancel }) {
  // mode: 'unlock' | 'set' | 'confirm'
  const [entry, setEntry] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [phase, setPhase] = useState(mode === 'set' ? 'enter' : 'unlock') // enter | confirm | unlock
  const [shake, setShake] = useState(false)
  const [hint, setHint] = useState(
    mode === 'set' ? 'Choose a 4-digit PIN' : 'Enter your PIN'
  )

  const PIN_LEN = 4

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  function handleDigit(d) {
    if (d === '') return
    if (d === '⌫') {
      setEntry(p => p.slice(0, -1))
      return
    }
    if (entry.length >= PIN_LEN) return
    const next = entry + d

    if (next.length === PIN_LEN) {
      // Auto-submit after short delay so user sees the last dot
      setTimeout(() => submit(next), 120)
    }
    setEntry(next)
  }

  function submit(value) {
    if (phase === 'unlock') {
      const ok = onUnlock(value)
      if (!ok) {
        triggerShake()
        setEntry('')
        setHint('Wrong PIN — try again')
      }
    } else if (phase === 'enter') {
      setFirstPin(value)
      setEntry('')
      setPhase('confirm')
      setHint('Confirm your PIN')
    } else if (phase === 'confirm') {
      if (value === firstPin) {
        onSetPin(value)
      } else {
        triggerShake()
        setEntry('')
        setFirstPin('')
        setPhase('enter')
        setHint("PINs didn't match — try again")
      }
    }
  }

  return (
    <div className={styles.screen}>
      {/* Sakura-like background blobs */}
      <div className={styles.blob1} />
      <div className={styles.blob2} />

      <div className={styles.inner}>
        <div className={styles.lockIcon}>🔒</div>
        <h1 className={styles.title}>
          {mode === 'set' ? (phase === 'confirm' ? 'Confirm PIN' : 'Set PIN') : 'Just Us'}
        </h1>
        <p className={styles.hint}>{hint}</p>

        {/* Dots */}
        <div className={`${styles.dots} ${shake ? styles.dotsShake : ''}`}>
          {Array.from({ length: PIN_LEN }).map((_, i) => (
            <div key={i} className={`${styles.dot} ${i < entry.length ? styles.dotFilled : ''}`} />
          ))}
        </div>

        {/* Keypad */}
        <div className={styles.keypad}>
          {DIGITS.map((d, i) => (
            <button
              key={i}
              className={`${styles.key} ${d === '' ? styles.keyEmpty : ''} ${d === '⌫' ? styles.keyBack : ''}`}
              onClick={() => handleDigit(d)}
              disabled={d === ''}
            >
              {d}
            </button>
          ))}
        </div>

        {onCancel && (
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        )}
      </div>
    </div>
  )
}
