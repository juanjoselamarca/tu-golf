'use client'

import { useCallback, useState } from 'react'
import type React from 'react'
import { CONCEDE } from '@/golf/formats/match-play'
import { haptic } from '@/lib/ronda/helpers'
import { saveScores as lsSave } from '@/lib/ronda/score-storage'

/** Golpes mínimos y máximos que acepta el scorer en un hoyo. */
export const SCORE_MIN = 1
export const SCORE_MAX = 19

/**
 * Entrada de golpes del scorer individual: +/- en el hoyo actual (con
 * respaldo local inmediato y vibración de birdie), y conceder el hoyo en
 * match play (CONCEDE = -1). Cada cambio marca la tarjeta como sin guardar;
 * el envío al servidor lo hace `goToNextHole` / `useScoreSave`.
 */
export function useHoleScoreInput(input: {
  codigo: string
  activeJugadorId: string | null
  isMatchPlay: boolean
  currentHole: number
  parMap: Record<number, number>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  setHasUnsaved: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const { codigo, activeJugadorId, isMatchPlay, currentHole, parMap, setScores, setHasUnsaved } = input
  const [scoreAnimating, setScoreAnimating] = useState(false)

  const handleScoreChange = useCallback((hole: number, value: number) => {
    if (!activeJugadorId) return
    const clamped = Math.max(SCORE_MIN, Math.min(SCORE_MAX, value))
    haptic(10)
    setScoreAnimating(true)
    setTimeout(() => setScoreAnimating(false), 150)

    setScores(prev => {
      const next = { ...prev, [activeJugadorId]: { ...(prev[activeJugadorId] ?? {}), [hole]: clamped } }
      setHasUnsaved(true)
      // Save to localStorage immediately for backup
      lsSave(codigo, activeJugadorId, next[activeJugadorId])
      const holePar = parMap[hole] ?? 4
      if (clamped - holePar <= -1) haptic([15, 30, 15])
      return next
    })
  }, [activeJugadorId, parMap, codigo, setScores, setHasUnsaved])

  /** Match Play: conceder el hoyo actual (score = CONCEDE = -1) */
  const handleConcedeHole = useCallback(() => {
    if (!activeJugadorId || !isMatchPlay) return
    haptic([20, 40, 20])
    setScores(prev => {
      const next = { ...prev, [activeJugadorId]: { ...(prev[activeJugadorId] ?? {}), [currentHole]: CONCEDE } }
      setHasUnsaved(true)
      lsSave(codigo, activeJugadorId, next[activeJugadorId])
      return next
    })
  }, [activeJugadorId, isMatchPlay, currentHole, codigo, setScores, setHasUnsaved])

  return { scoreAnimating, handleScoreChange, handleConcedeHole }
}
