// hooks/useJugadores.ts
//
// Estado + handlers para los jugadores inscritos de un torneo.
// Centraliza la lógica que antes vivía dentro de JugadoresPanel.tsx.

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import {
  listPlayers,
  inscribePlayer,
  withdrawPlayer,
  disqualifyPlayer,
  type PlayerRow,
  type InscribePlayerInput,
} from '@/lib/data/tournaments/players'
import { captureError } from '@/lib/error-tracking'

export interface UseJugadoresInput {
  tournamentId: string
  initialPlayers: PlayerRow[]
}

export function useJugadores({ tournamentId, initialPlayers }: UseJugadoresInput) {
  const [players, setPlayers] = useState<PlayerRow[]>(initialPlayers)
  const supabase = createClient()

  const refresh = useCallback(async () => {
    try {
      const rows = await listPlayers(supabase, tournamentId)
      setPlayers(rows)
    } catch (err) {
      void captureError(err, {
        context: 'useJugadores.refresh',
        meta: { tournamentId },
      })
    }
  }, [supabase, tournamentId])

  const inscribir = useCallback(
    async (input: Omit<InscribePlayerInput, 'tournament_id'>) => {
      await inscribePlayer(supabase, { ...input, tournament_id: tournamentId })
      await refresh()
    },
    [supabase, tournamentId, refresh]
  )

  const desinscribir = useCallback(
    async (playerId: string) => {
      await withdrawPlayer(supabase, playerId)
      await refresh()
    },
    [supabase, refresh]
  )

  const descalificar = useCallback(
    async (playerId: string) => {
      await disqualifyPlayer(supabase, playerId)
      await refresh()
    },
    [supabase, refresh]
  )

  return { players, inscribir, desinscribir, descalificar, refresh }
}
