/**
 * Hook que centraliza acciones sobre rondas históricas:
 *  - deleteRound(id)           → DELETE + recalcular índice + actualizar estado
 *  - toggleExcluded(round)     → UPDATE excluded_from_handicap + recalcular índice
 *  - saveEdit(id, scores)      → UPDATE scores + total_gross + recalcular índice
 *
 * FIX bug inbox f772e78b: el monolito anterior llamaba al delete pero NO
 * disparaba calcular_indice_golfers — quedaba el índice obsoleto incluyendo
 * una ronda que ya no existía. También usaba window.confirm() que en
 * algunos contextos PWA/Safari aparece detrás del menú o queda bloqueado;
 * ahora el confirm es responsabilidad del componente (sheet inline).
 *
 * Update optimista en UI + revert si la query falla. Sin console.* —
 * errores van por captureError().
 */
'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import type { HistoricalRound } from '../lib/types'

export interface UseRoundActionsParams {
  userId: string | null
  setRounds: React.Dispatch<React.SetStateAction<HistoricalRound[]>>
}

export interface UseRoundActionsResult {
  deleting:           string | null
  savingEdit:         boolean
  deleteRound:        (id: string) => Promise<{ ok: boolean }>
  toggleExcluded:     (round: HistoricalRound) => Promise<{ ok: boolean }>
  saveEdit:           (id: string, scores: (number | null)[]) => Promise<{ ok: boolean }>
}

/** Fire-and-forget — recalcula el índice Golfers+ post-mutación. */
function triggerIndexRecalc(userId: string | null) {
  if (!userId) return
  const supabase = createClient()
  void supabase.rpc('calcular_indice_golfers', { p_user_id: userId })
}

export function useRoundActions({ userId, setRounds }: UseRoundActionsParams): UseRoundActionsResult {
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const deleteRound = useCallback(async (id: string): Promise<{ ok: boolean }> => {
    setDeleting(id)
    const supabase = createClient()
    const { error } = await supabase.from('historical_rounds').delete().eq('id', id)
    setDeleting(null)
    if (error) {
      void captureError(error, { context: 'historial.delete', userId, meta: { roundId: id } })
      return { ok: false }
    }
    setRounds(prev => prev.filter(r => r.id !== id))
    // FIX inbox f772e78b: disparar recálculo del índice tras borrar.
    // Sin esto, el índice quedaba calculado contra una ronda que ya no existe.
    triggerIndexRecalc(userId)
    return { ok: true }
  }, [userId, setRounds])

  const toggleExcluded = useCallback(async (round: HistoricalRound): Promise<{ ok: boolean }> => {
    const next = !round.excluded_from_handicap
    // Update optimista
    setRounds(prev => prev.map(x => x.id === round.id ? { ...x, excluded_from_handicap: next } : x))
    const supabase = createClient()
    const { error } = await supabase
      .from('historical_rounds')
      .update({ excluded_from_handicap: next })
      .eq('id', round.id)
    if (error) {
      // Revert si falló
      setRounds(prev => prev.map(x => x.id === round.id ? { ...x, excluded_from_handicap: !next } : x))
      void captureError(error, { context: 'historial.toggleExcluded', userId, meta: { roundId: round.id, next } })
      return { ok: false }
    }
    triggerIndexRecalc(userId)
    return { ok: true }
  }, [userId, setRounds])

  const saveEdit = useCallback(async (id: string, editScores: (number | null)[]): Promise<{ ok: boolean }> => {
    setSavingEdit(true)
    const filled = editScores.filter((s): s is number => s != null)
    const totalGross = filled.reduce((a, b) => a + b, 0)
    const totalGrossOrNull = totalGross > 0 ? totalGross : null
    const supabase = createClient()
    const { error } = await supabase
      .from('historical_rounds')
      .update({ scores: editScores, total_gross: totalGrossOrNull })
      .eq('id', id)
    setSavingEdit(false)
    if (error) {
      void captureError(error, { context: 'historial.saveEdit', userId, meta: { roundId: id } })
      return { ok: false }
    }
    setRounds(prev => prev.map(r =>
      r.id === id ? { ...r, scores: editScores, total_gross: totalGrossOrNull } : r
    ))
    // Cambiar scores cambia el diferencial — recalcular índice.
    triggerIndexRecalc(userId)
    return { ok: true }
  }, [userId, setRounds])

  return { deleting, savingEdit, deleteRound, toggleExcluded, saveEdit }
}
