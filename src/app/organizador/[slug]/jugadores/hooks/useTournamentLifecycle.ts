// hooks/useTournamentLifecycle.ts
//
// Estado + handlers para cambios de tournament.status (start/close/cancel).

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import {
  startTournament,
  closeTournament,
  cancelTournament,
} from '@/lib/data/tournaments/lifecycle'
import { captureError } from '@/lib/error-tracking'

export function useTournamentLifecycle({
  tournamentId,
  initialStatus,
}: {
  tournamentId: string
  initialStatus: string
}) {
  const [status, setStatus] = useState(initialStatus)
  const [busy, setBusy] = useState(false)
  const supabase = createClient()

  const start = useCallback(async () => {
    setBusy(true)
    try {
      await startTournament(supabase, tournamentId)
      setStatus('in_progress')
    } catch (err) {
      void captureError(err, {
        context: 'useTournamentLifecycle.start',
        meta: { tournamentId },
      })
      throw err
    } finally {
      setBusy(false)
    }
  }, [supabase, tournamentId])

  const close = useCallback(async () => {
    setBusy(true)
    try {
      await closeTournament(supabase, tournamentId)
      setStatus('closed')
    } catch (err) {
      void captureError(err, {
        context: 'useTournamentLifecycle.close',
        meta: { tournamentId },
      })
      throw err
    } finally {
      setBusy(false)
    }
  }, [supabase, tournamentId])

  const cancel = useCallback(async () => {
    setBusy(true)
    try {
      await cancelTournament(supabase, tournamentId)
      setStatus('cancelled')
    } catch (err) {
      void captureError(err, {
        context: 'useTournamentLifecycle.cancel',
        meta: { tournamentId },
      })
      throw err
    } finally {
      setBusy(false)
    }
  }, [supabase, tournamentId])

  return { status, busy, start, close, cancel }
}
