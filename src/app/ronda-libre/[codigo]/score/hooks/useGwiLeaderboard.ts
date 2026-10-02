'use client'

import { useEffect, useRef, useState } from 'react'
import { calcularGWI, type JugadorGWIInput, type GWIResult } from '@/golf/stats/gwi'

export type ScorerView = 'scorecard' | 'leaderboard'

/** Cuánto dura la vista de leaderboard antes de volver sola al scorecard. */
export const LEADERBOARD_AUTO_RETURN_MS = 10000

/**
 * Vista Scorecard / Leaderboard del scorer individual. Al abrir el
 * leaderboard trae los inputs del GWI (debounce 10s entre fetches) y a los
 * 10s vuelve sola al scorecard: en cancha la pantalla principal es anotar.
 */
export function useGwiLeaderboard(codigo: string) {
  const [view, setView] = useState<ScorerView>('scorecard')
  const [gwiInputs, setGwiInputs] = useState<JugadorGWIInput[]>([])
  const [, setGwiResults] = useState<GWIResult[]>([])
  const gwiLastFetchRef = useRef(0)

  useEffect(() => {
    if (view !== 'leaderboard') return
    const t = setTimeout(() => setView('scorecard'), LEADERBOARD_AUTO_RETURN_MS)
    // Debounce: no re-fetch si ya se cargó hace <10s
    const now = Date.now()
    if (now - gwiLastFetchRef.current > LEADERBOARD_AUTO_RETURN_MS) {
      gwiLastFetchRef.current = now
      fetch(`/api/gwi/ronda-libre/${codigo}`)
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (json?.inputs) {
            setGwiInputs(json.inputs)
            setGwiResults(calcularGWI(json.inputs, json.totalHoyos))
          }
        })
        .catch(() => {})
    }
    return () => clearTimeout(t)
  }, [view, codigo])

  return { view, setView, gwiInputs }
}
