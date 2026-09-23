/**
 * FollowRoundButton — "Seguir ronda" / "Siguiendo" toggle.
 *
 * When tapped:
 * 1. Requests notification permission if not granted
 * 2. Subscribes to push if needed
 * 3. Follows the round locally (localStorage)
 * 4. Shows the first spectator notification immediately
 *
 * Visual states:
 * - Default: "Seguir" with bell icon
 * - Following: "Siguiendo" with check, muted style
 * - Tap while following: unfollows + clears notification
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
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
}

export function FollowRoundButton({
  codigo, courseName, players, maxHole, compact = false,
}: FollowRoundButtonProps) {
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setFollowing(isFollowingRound(codigo))
  }, [codigo])

  const handleToggle = useCallback(async () => {
    if (following) {
      unfollowRound(codigo)
      setFollowing(false)
      return
    }

    setLoading(true)
    try {
      // Ensure push is set up
      if (isPushSupported() && Notification.permission !== 'granted') {
        const ok = await setupPushNotifications()
        if (!ok) {
          setLoading(false)
          return
        }
      }

      // Enable spectator notifications pref
      const prefs = getNotifPrefs()
      if (!prefs.spectator) {
        setNotifPrefs({ spectator: true, enabled: true })
      }

      // Follow the round
      followRound(codigo, courseName)
      setFollowing(true)

      // Show the first notification immediately
      if (players.length > 0) {
        void showSpectatorNotification({ courseName, codigo, players, maxHole })
      }
    } finally {
      setLoading(false)
    }
  }, [following, codigo, courseName, players, maxHole])

  // Don't render if push is not supported
  if (typeof window !== 'undefined' && !isPushSupported()) return null

  if (compact) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleToggle() }}
        disabled={loading}
        aria-label={following ? 'Dejar de seguir ronda' : 'Seguir ronda'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '36px', height: '36px', borderRadius: '10px',
          background: following ? 'rgba(22,163,74,0.1)' : 'rgba(196,153,42,0.12)',
          border: following ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(196,153,42,0.25)',
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

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleToggle() }}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 16px', borderRadius: '10px',
        background: following ? 'rgba(22,163,74,0.08)' : 'var(--brand)',
        color: following ? 'var(--status-live-fg)' : 'var(--brand-dark)',
        border: following ? '1px solid rgba(22,163,74,0.2)' : 'none',
        fontSize: '13px', fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.2s',
        minHeight: '44px',
      }}
    >
      {following
        ? <><CheckCircle size={16} /> Siguiendo</>
        : <><Bell size={16} /> {loading ? 'Activando...' : 'Seguir'}</>
      }
    </button>
  )
}
