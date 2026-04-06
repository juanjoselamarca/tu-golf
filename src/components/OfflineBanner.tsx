'use client'

import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)

    // Check initial state
    if (!navigator.onLine) setOffline(true)

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#dc2626',
        color: '#fff',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      Sin conexion — Los scores se guardaran cuando vuelvas a tener internet
    </div>
  )
}
