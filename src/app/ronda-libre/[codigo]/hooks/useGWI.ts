'use client'

// ─── Hook de GWI (probabilidad de ganar) para la vista live ─────────────────
// El GWI se calcula en el servidor (/api/gwi/ronda-libre/[codigo]); este hook
// trae el resultado público ya calculado. Los inputs privados (historial y
// patrones de cada jugador) nunca llegan al navegador.

import { useCallback, useEffect, useState } from 'react'
import { logError } from '@/lib/error-tracking'
import { fetchGWIRondaLibre } from '@/lib/data/gwi-api'
import type { GWIResultPublico, JugadorGWIPublico } from '@/golf/stats/gwi'

export interface UseGWIResult {
  jugadores: JugadorGWIPublico[]
  results: GWIResultPublico[]
  refetch: () => void
}

export function useGWI(codigo: string): UseGWIResult {
  const [gwi, setGwi] = useState<Pick<UseGWIResult, 'jugadores' | 'results'>>({ jugadores: [], results: [] })

  const refetch = useCallback(async () => {
    try {
      const res = await fetchGWIRondaLibre(codigo)
      if (res) setGwi({ jugadores: res.jugadores, results: res.results })
    } catch (err) {
      logError(err, '[GWI fetch]')
    }
  }, [codigo])

  useEffect(() => { refetch() }, [refetch])

  return { ...gwi, refetch }
}
