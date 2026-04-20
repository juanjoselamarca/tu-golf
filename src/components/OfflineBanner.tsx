'use client'

import { useEffect, useState } from 'react'

function contarHoyosPendientes(): number {
  try {
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith('golfers_score_')) continue
      const raw = localStorage.getItem(k)
      if (!raw) continue
      const data = JSON.parse(raw) as { sincronizado?: boolean; scores?: Record<string, number> }
      if (data.sincronizado === false && data.scores) {
        total += Object.keys(data.scores).length
      }
    }
    return total
  } catch { return 0 }
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const [pendientes, setPendientes] = useState(0)

  useEffect(() => {
    const tick = () => setPendientes(contarHoyosPendientes())
    const goOffline = () => { setOffline(true); tick() }
    const goOnline = () => { setOffline(false); tick() }

    if (!navigator.onLine) setOffline(true)
    tick()
    const interval = setInterval(tick, 3000)

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      clearInterval(interval)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  // Mostrar siempre que esté offline, o cuando haya scores pendientes (aunque vuelva online).
  if (!offline && pendientes === 0) return null

  const mensaje = offline
    ? pendientes > 0
      ? `Sin conexión — ${pendientes} hoyo${pendientes === 1 ? '' : 's'} en cola, se sincronizará al reconectar`
      : 'Sin conexión — Los scores se guardarán cuando vuelvas a tener internet'
    : `Sincronizando ${pendientes} hoyo${pendientes === 1 ? '' : 's'}...`

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: offline ? '#dc2626' : '#c4992a',
        color: '#fff',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      {mensaje}
    </div>
  )
}
