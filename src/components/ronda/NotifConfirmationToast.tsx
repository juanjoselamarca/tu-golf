/**
 * NotifConfirmationToast — subtle confirmation when a notification is activated.
 *
 * Appears for 2.5s then fades out. Lightweight, non-blocking, bottom-anchored.
 * Only shows once per session to avoid nagging.
 */

'use client'

import { useState, useEffect } from 'react'
import { CheckCircle } from '@/components/icons'

const SHOWN_KEY = 'golfers-notif-toast-shown'

interface NotifConfirmationToastProps {
  /** Type of notification that was activated */
  type: 'player' | 'spectator'
}

export function NotifConfirmationToast({ type }: NotifConfirmationToastProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const key = `${SHOWN_KEY}-${type}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch { return }

    const showTimer = setTimeout(() => setVisible(true), 600)
    const exitTimer = setTimeout(() => setExiting(true), 3000)
    const hideTimer = setTimeout(() => setVisible(false), 3300)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(exitTimer)
      clearTimeout(hideTimer)
    }
  }, [type])

  if (!visible) return null

  const message = type === 'player'
    ? 'Notificación activa — vuelve al scorer desde cualquier app'
    : 'Siguiendo ronda — recibirás actualizaciones en vivo'

  return (
    <div style={{
      position: 'fixed',
      bottom: '100px',
      left: '16px',
      right: '16px',
      zIndex: 70,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
      opacity: exiting ? 0 : 1,
      transform: exiting ? 'translateY(8px)' : 'translateY(0)',
      transition: 'opacity 0.3s, transform 0.3s',
      animation: 'notifToastIn 0.35s ease-out',
    }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        borderRadius: '10px',
        background: 'rgba(22,163,74,0.12)',
        border: '1px solid rgba(22,163,74,0.25)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        maxWidth: '360px',
      }}>
        <CheckCircle size={16} />
        <span style={{
          fontSize: '12px', fontWeight: 500,
          color: 'var(--status-live-fg)',
          fontFamily: 'var(--font-dm-sans)',
          lineHeight: 1.3,
        }}>
          {message}
        </span>
      </div>

      <style>{`
        @keyframes notifToastIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
