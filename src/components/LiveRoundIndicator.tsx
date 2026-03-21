'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

/**
 * Floating indicator that appears on ALL pages when the user
 * is following or playing an active round.
 * Stored in sessionStorage so it persists across navigation.
 */
export function LiveRoundIndicator() {
  const pathname = usePathname()
  const [activeRonda, setActiveRonda] = useState<{ codigo: string; courseName: string } | null>(null)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('golfers-active-ronda')
      if (stored) {
        setActiveRonda(JSON.parse(stored))
      }
    } catch {}
  }, [pathname])

  // Don't show on the ronda page itself or score page
  if (!activeRonda) return null
  if (pathname.includes(`/ronda-libre/${activeRonda.codigo}`)) return null
  if (pathname.includes('/score')) return null

  return (
    <Link
      href={`/ronda-libre/${activeRonda.codigo}`}
      style={{
        position: 'fixed',
        top: '64px',
        right: '12px',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(7,13,24,0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(22,163,74,0.3)',
        borderRadius: '20px',
        padding: '6px 12px 6px 8px',
        textDecoration: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: '#22c55e',
        boxShadow: '0 0 8px rgba(34,197,94,0.6)',
        animation: 'livePulse 2s ease-in-out infinite',
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: '11px', fontWeight: 600, color: '#22c55e',
        fontFamily: 'var(--font-dm-mono), monospace',
        letterSpacing: '0.05em',
      }}>
        EN VIVO
      </span>
    </Link>
  )
}

/**
 * Call this to set the active ronda (from spectator or player view)
 */
export function setActiveRondaSession(codigo: string, courseName: string) {
  try {
    sessionStorage.setItem('golfers-active-ronda', JSON.stringify({ codigo, courseName }))
  } catch {}
}

/**
 * Call this to clear the active ronda (when round finishes)
 */
export function clearActiveRondaSession() {
  try {
    sessionStorage.removeItem('golfers-active-ronda')
  } catch {}
}
