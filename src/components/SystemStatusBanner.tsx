'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

const DISMISSED_KEY = 'system-status-banner-dismissed'
// 5 min (antes 60 s). Incidente 02-oct-2026: este polling, multiplicado por cada pestaña abierta,
// era ~1/3 del tiempo de servidor de la base (plan free, ~0,5 GB). El banner avisa de una caída
// que dura minutos u horas: 5 min de demora no cambia la experiencia y reduce 5× la carga.
const POLL_INTERVAL = 300_000

export function SystemStatusBanner() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const failCountRef = useRef(0)
  const THRESHOLD = 3

  const checkHealth = useCallback(async () => {
    try {
      // Sin cookies: así el proxy no valida la sesión contra Auth en cada chequeo (otra consulta a la base).
      const res = await fetch('/api/health', { cache: 'no-store', credentials: 'omit' })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'ok') {
          failCountRef.current = 0
          setVisible(false)
          return
        }
      }
      failCountRef.current++
      if (failCountRef.current >= THRESHOLD) setVisible(true)
    } catch {
      failCountRef.current++
      if (failCountRef.current >= THRESHOLD) setVisible(true)
    }
  }, [])

  useEffect(() => {
    // Check sessionStorage for dismissal
    try {
      if (sessionStorage.getItem(DISMISSED_KEY) === 'true') {
        setDismissed(true)
        return
      }
    } catch {
      // sessionStorage not available
    }

    checkHealth()
    let interval: ReturnType<typeof setInterval> | null = null
    const start = () => { if (!interval) interval = setInterval(checkHealth, POLL_INTERVAL) }
    const stop = () => { if (interval) { clearInterval(interval); interval = null } }
    const onVisibility = () => document.hidden ? stop() : start()

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [checkHealth])

  if (!visible || dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // sessionStorage not available
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: 'var(--brand)',
        color: 'var(--brand-dark)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        fontSize: '14px',
        fontWeight: 500,
      }}
    >
      <span>
        Estamos experimentando problemas técnicos. Estamos trabajando en resolverlo.
      </span>
      <button
        onClick={handleDismiss}
        aria-label="Cerrar aviso"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--brand-dark)',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
          padding: '2px 6px',
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}
