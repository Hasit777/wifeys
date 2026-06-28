import { useEffect, useRef, useState, useCallback } from 'react'

export function useNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )

  async function requestPermission() {
    if (typeof Notification === 'undefined') return 'unsupported'
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }

  // Fire a browser notification (only if permitted + tab isn't focused)
  const notify = useCallback((title, options = {}) => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    // Don't spam a notification if the user is actively looking at the tab
    if (document.visibilityState === 'visible' && document.hasFocus()) return

    try {
      const n = new Notification(title, {
        icon: '/pwa-192.png',
        badge: '/pwa-192.png',
        ...options,
      })
      n.onclick = () => {
        window.focus()
        if (options.onClickUrl) {
          window.location.href = options.onClickUrl
        }
        n.close()
      }
      // Auto-close after 8s so they don't pile up
      setTimeout(() => n.close(), 8000)
    } catch (_) {}
  }, [])

  return { permission, requestPermission, notify }
}
