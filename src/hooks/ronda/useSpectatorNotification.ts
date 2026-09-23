/**
 * useSpectatorNotification — persistent OS notification for followed rounds.
 *
 * Shows a PGA-style table of all players in the notification tray.
 * Updates silently when scores change (via realtime or polling).
 * Handles the "unfollow" action from the notification itself.
 *
 * Used in: /ronda-libre/[codigo] (spectator view) and /en-vivo feed.
 */

'use client'

import { useEffect, useCallback } from 'react'
import {
  showSpectatorNotification,
  showSpectatorFinishedNotification,
  isFollowingRound,
  unfollowRound,
  type SpectatorPlayer,
} from '@/lib/round-notifications'
import { isPushSupported } from '@/lib/push-notifications'

interface UseSpectatorNotificationOptions {
  /** Round code */
  codigo: string
  /** Course name */
  courseName: string
  /** Players with current scores */
  players: SpectatorPlayer[]
  /** Max hole completed across all players */
  maxHole: number
  /** Whether the round is finished */
  isFinished: boolean
}

export function useSpectatorNotification(opts: UseSpectatorNotificationOptions): void {
  const { codigo, courseName, players, maxHole, isFinished } = opts

  // Update notification when scores change
  useEffect(() => {
    if (!isPushSupported() || Notification.permission !== 'granted') return
    if (!isFollowingRound(codigo)) return
    if (players.length === 0) return

    if (isFinished) {
      void showSpectatorFinishedNotification({ courseName, codigo, players })
    } else {
      void showSpectatorNotification({ courseName, codigo, players, maxHole })
    }
  }, [codigo, courseName, players, maxHole, isFinished])

  // Listen for "unfollow" messages from the Service Worker
  const handleSWMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type === 'UNFOLLOW_ROUND' && event.data?.rondaCodigo === codigo) {
      unfollowRound(codigo)
    }
  }, [codigo])

  useEffect(() => {
    navigator.serviceWorker?.addEventListener('message', handleSWMessage)
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage)
    }
  }, [handleSWMessage])
}
