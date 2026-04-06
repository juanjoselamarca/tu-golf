'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

const DISMISSED_KEY = 'system-status-banner-dismissed'
const POLL_INTERVAL = 60_000 // 60 seconds

export function SystemStatusBanner() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const failCountRef = useRef(0)
  const THRESHOLD = 3

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
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
    const interval = setInterval(checkHealth, POLL_INTERVAL)
    return () => clearInterval(interval)
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
        background: '#c4992a',
        color: '#1a1a1a',
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
          color: '#1a1a1a',
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
