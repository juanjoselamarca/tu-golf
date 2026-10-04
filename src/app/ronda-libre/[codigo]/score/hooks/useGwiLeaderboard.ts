'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchGWIRondaLibre } from '@/lib/data/gwi-api'
import type { GWIResultPublico, JugadorGWIPublico } from '@/golf/stats/gwi'

export type ScorerView = 'scorecard' | 'leaderboard'

/** Cuánto dura la vista de leaderboard antes de volver sola al scorecard. */
export const LEADERBOARD_AUTO_RETURN_MS = 10000

export interface GwiDelScorer {
  jugadores: JugadorGWIPublico[]
  results: GWIResultPublico[]
}

const SIN_GWI: GwiDelScorer = { jugadores: [], results: [] }

/**
 * Vista Scorecard / Leaderboard del scorer individual. Al abrir el
 * leaderboard trae el GWI ya calculado en el servidor (debounce 10s entre
 * fetches) y a los 10s vuelve sola al scorecard: en cancha la pantalla
 * principal es anotar.
 */
export function useGwiLeaderboard(codigo: string) {
  const [view, setView] = useState<ScorerView>('scorecard')
  const [gwi, setGwi] = useState<GwiDelScorer>(SIN_GWI)
  const gwiLastFetchRef = useRef(0)

  useEffect(() => {
    if (view !== 'leaderboard') return
    const t = setTimeout(() => setView('scorecard'), LEADERBOARD_AUTO_RETURN_MS)
    // Debounce: no re-fetch si ya se cargó hace <10s
    const now = Date.now()
    if (now - gwiLastFetchRef.current > LEADERBOARD_AUTO_RETURN_MS) {
      gwiLastFetchRef.current = now
      fetchGWIRondaLibre(codigo)
        .then(res => { if (res) setGwi({ jugadores: res.jugadores, results: res.results }) })
        // Sin red entre hoyos el leaderboard sigue con el último GWI; no es un error.
        .catch(() => {})
    }
    return () => clearTimeout(t)
  }, [view, codigo])

  return { view, setView, gwi }
}
