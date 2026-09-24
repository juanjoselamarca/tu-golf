/**
 * usePlayerNotification — persistent OS notification for the active scorer.
 *
 * Shows "Hoyo 7 · Par 4" in the notification tray with a deep link
 * back to the scorer. Updates silently on each hole change.
 * Clears on unmount (navigating away) or round discard.
 *
 * Requires: push permission granted + player pref enabled.
 */

'use client'

import { useEffect, useRef } from 'react'
import {
  showPlayerNotification,
  showPlayerFinishedNotification,
  clearPlayerNotification,
} from '@/lib/round-notifications'
import { isPushSupported } from '@/lib/push-notifications'

interface UsePlayerNotificationOptions {
  /** Active round code */
  codigo: string
  /** Course name for display */
  courseName: string
  /** Current hole number (1-18) */
  currentHole: number
  /** Par for the current hole */
  currentPar: number
  /** Whether the round has been finalized */
  roundDone: boolean
  /** Gross score (for finished notification) */
  grossScore?: number
  /** vs par string like "+3", "E", "-2" */
  vsPar?: string
}

export function usePlayerNotification(opts: UsePlayerNotificationOptions): void {
  const {
    codigo, courseName, currentHole, currentPar,
    roundDone, grossScore, vsPar,
  } = opts

  const hasSentFinished = useRef(false)

  // Show/update notification on hole change
  useEffect(() => {
    if (roundDone || !isPushSupported() || Notification.permission !== 'granted') return

    void showPlayerNotification({
      courseName,
      hole: currentHole,
      par: currentPar,
      codigo,
      vsPar: vsPar ?? 'E',
    })
  }, [codigo, courseName, currentHole, currentPar, vsPar, roundDone])

  // Mutate to finished notification
  useEffect(() => {
    if (!roundDone || hasSentFinished.current) return
    if (!isPushSupported() || Notification.permission !== 'granted') return
    if (grossScore == null || vsPar == null) return

    hasSentFinished.current = true
    void showPlayerFinishedNotification({
      courseName,
      grossScore,
      vsPar,
      codigo,
    })
  }, [roundDone, grossScore, vsPar, courseName, codigo])

  // Clear notification on unmount (user navigated away from scorer)
  useEffect(() => {
    return () => {
      // Don't clear if round just finished — the finished notification should stay
      if (!hasSentFinished.current) {
        void clearPlayerNotification()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
