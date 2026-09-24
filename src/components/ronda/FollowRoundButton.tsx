/**
 * FollowRoundButton — "Seguir" / "Siguiendo" toggle (Instagram-style).
 *
 * Two visual modes:
 * - Default: gold "Seguir" button with bell icon
 * - Following: muted "Siguiendo" with check. Tap → unfollow with confirmation
 *
 * Compact mode: icon-only for feed cards (/en-vivo)
 * Full mode: text button for ronda detail view
 */

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Bell, CheckCircle } from '@/components/icons'
import {
  followRound,
  unfollowRound,
  isFollowingRound,
  showSpectatorNotification,
  type SpectatorPlayer,
} from '@/lib/round-notifications'
import {
  isPushSupported,
  setupPushNotifications,
  getNotifPrefs,
  setNotifPrefs,
} from '@/lib/push-notifications'

interface FollowRoundButtonProps {
  codigo: string
  courseName: string
  players: SpectatorPlayer[]
  maxHole: number
  /** Compact mode for feed cards */
  compact?: boolean
  /** Callback when follow state changes */
  onFollowChange?: (following: boolean) => void
}

export function FollowRoundButton({
  codigo, courseName, players, maxHole, compact = false, onFollowChange,
}: FollowRoundButtonProps) {
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmUnfollow, setConfirmUnfollow] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setFollowing(isFollowingRound(codigo))
  }, [codigo])

  // Listen for unfollow messages from SW
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'UNFOLLOW_ROUND' && e.data?.rondaCodigo === codigo) {
        setFollowing(false)
        onFollowChange?.(false)
      }
    }
    navigator.serviceWorker?.addEventListener('message', handler)
    return () => navigator.serviceWorker?.removeEventListener('message', handler)
  }, [codigo, onFollowChange])

  const handleFollow = useCallback(async () => {
    setLoading(true)
    try {
      if (isPushSupported() && Notification.permission !== 'granted') {
        const ok = await setupPushNotifications()
        if (!ok) { setLoading(false); return }
      }
      const prefs = getNotifPrefs()
      if (!prefs.spectator) {
        setNotifPrefs({ spectator: true, enabled: true })
      }
      followRound(codigo, courseName)
      setFollowing(true)
      onFollowChange?.(true)
      if (players.length > 0) {
        void showSpectatorNotification({ courseName, codigo, players, maxHole })
      }
    } finally {
      setLoading(false)
    }
  }, [codigo, courseName, players, maxHole, onFollowChange])

  const handleUnfollow = useCallback(() => {
    // Instagram pattern: first tap shows "Dejar de seguir?", second tap confirms
    if (!confirmUnfollow) {
      setConfirmUnfollow(true)
      confirmTimer.current = setTimeout(() => setConfirmUnfollow(false), 3000)
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    unfollowRound(codigo)
    setFollowing(false)
    setConfirmUnfollow(false)
    onFollowChange?.(false)
  }, [confirmUnfollow, codigo, onFollowChange])

  const handleToggle = useCallback(async () => {
    if (following) {
      handleUnfollow()
    } else {
      await handleFollow()
    }
  }, [following, handleFollow, handleUnfollow])

  if (typeof window !== 'undefined' && !isPushSupported()) return null

  // ── Compact (icon-only for /en-vivo feed) ──
  if (compact) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleToggle() }}
        disabled={loading}
        aria-label={following ? 'Dejar de seguir ronda' : 'Seguir ronda'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '36px', height: '36px', borderRadius: '10px',
          background: following
            ? confirmUnfollow ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.1)'
            : 'rgba(196,153,42,0.12)',
          border: following
            ? confirmUnfollow ? '1px solid rgba(220,38,38,0.25)' : '1px solid rgba(22,163,74,0.25)'
            : '1px solid rgba(196,153,42,0.25)',
          cursor: loading ? 'wait' : 'pointer',
          transition: 'all 0.2s',
          flexShrink: 0,
          padding: 0,
        }}
      >
        {following
          ? <CheckCircle size={16} />
          : <Bell size={16} />
        }
      </button>
    )
  }

  // ── Full button ──
  if (following) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnfollow() }}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 16px', borderRadius: '10px',
          background: confirmUnfollow ? 'rgba(220,38,38,0.06)' : 'rgba(22,163,74,0.08)',
          color: confirmUnfollow ? 'var(--error, #ef4444)' : 'var(--status-live-fg)',
          border: confirmUnfollow
            ? '1px solid rgba(220,38,38,0.2)'
            : '1px solid rgba(22,163,74,0.2)',
          fontSize: '13px', fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.2s',
          minHeight: '44px',
          fontFamily: 'var(--font-dm-sans)',
        }}
      >
        <CheckCircle size={16} />
        {confirmUnfollow ? 'Dejar de seguir?' : 'Siguiendo'}
      </button>
    )
  }

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleFollow() }}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 16px', borderRadius: '10px',
        background: 'var(--brand)', color: 'var(--brand-dark)',
        border: 'none',
        fontSize: '13px', fontWeight: 700,
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.2s',
        minHeight: '44px',
        fontFamily: 'var(--font-dm-sans)',
      }}
    >
      <Bell size={16} />
      {loading ? 'Activando...' : 'Seguir'}
    </button>
  )
}
