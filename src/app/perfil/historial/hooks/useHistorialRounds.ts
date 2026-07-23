/**
 * Hook que mantiene la lista de rondas históricas en el cliente.
 *
 * Post-RSC (jul-2026): la carga INICIAL (auth + rondas + stats) vive en el
 * Server Component page.tsx vía src/lib/data/historial.ts — este hook ya no
 * hace auth check ni fetch inicial (murieron el spinner de auth, el timeout
 * de 8s y el skeleton de primera carga). Solo queda el estado client y
 * `reload()`, que re-fetchea tras mutaciones (guardar ronda nueva, retry
 * tras error). Las columnas vienen de SELECT_COLUMNS (fuente única en la
 * capa de datos — no puede desincronizarse del fetch server-side).
 */
'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { SELECT_COLUMNS, OR_EXCLUDE_FEDEGOLF } from '@/lib/data/historial'
import type { HistoricalRound } from '../lib/types'

export interface UseHistorialRoundsParams {
  initialRounds: HistoricalRound[]
  /** true si el fetch server-side falló — pinta FatalErrorScreen con Reintentar. */
  initialLoadError: boolean
}

export interface UseHistorialRoundsResult {
  loadError:    boolean
  rounds:       HistoricalRound[]
  setRounds:    React.Dispatch<React.SetStateAction<HistoricalRound[]>>
  setLoadError: React.Dispatch<React.SetStateAction<boolean>>
  reload:       () => Promise<void>
}

export function useHistorialRounds({ initialRounds, initialLoadError }: UseHistorialRoundsParams): UseHistorialRoundsResult {
  const [loadError, setLoadError] = useState(initialLoadError)
  const [rounds,    setRounds]    = useState<HistoricalRound[]>(initialRounds)

  /* Re-carga client-side tras mutaciones — misma query que el server
     (SELECT_COLUMNS compartido); el scope por usuario lo garantiza la RLS
     own_rounds, igual que antes del refactor. */
  const reload = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('historical_rounds')
        .select(SELECT_COLUMNS)
        .or(OR_EXCLUDE_FEDEGOLF)
        .order('played_at', { ascending: false })
        .limit(500)
      if (error) { setLoadError(true); return }
      setRounds((data as unknown as HistoricalRound[]) || [])
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [])

  return { loadError, rounds, setRounds, setLoadError, reload }
}
