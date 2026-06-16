/**
 * Hook que centraliza acciones sobre rondas históricas:
 *  - deleteRound(id)           → DELETE + recalcular índice + actualizar estado
 *  - toggleExcluded(round)     → UPDATE excluded_from_handicap + recalcular índice
 *  - saveEdit(id, scores)      → UPDATE scores + total_gross + recalcular índice
 *  - deleteAllRounds()         → borrado masivo de TODAS las rondas del usuario
 *
 * FIX bug inbox f772e78b: el monolito anterior llamaba al delete pero NO
 * disparaba calcular_indice_golfers — quedaba el índice obsoleto incluyendo
 * una ronda que ya no existía. También usaba window.confirm() que en
 * algunos contextos PWA/Safari aparece detrás del menú o queda bloqueado;
 * ahora el confirm es responsabilidad del componente (sheet inline).
 *
 * ENDURECIMIENTO (CERO FALLOS): cada mutación usa `.select('id')` para saber
 * cuántas filas afectó de verdad. Sin esto, un DELETE/UPDATE que RLS filtra a
 * 0 filas devuelve `error: null` y la UI creía que había éxito (la tarjeta
 * "se borraba" pero volvía al recargar). Ahora 0 filas = `reason: 'noop'` y
 * el caller muestra un error claro en vez de fallar en silencio.
 *
 * El recálculo del índice se AWAITEA (antes era fire-and-forget): así el caller
 * puede confirmar al usuario que el handicap ya se actualizó.
 *
 * Update optimista en UI + revert si la query falla. Sin console.* —
 * errores van por captureError().
 */
'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import type { HistoricalRound } from '../lib/types'

/** Resultado de una acción. `reason` distingue el tipo de fallo para el feedback. */
export interface ActionResult {
  ok: boolean
  /** 'error' = la query falló; 'noop' = 0 filas afectadas (RLS / ya no existe). */
  reason?: 'error' | 'noop'
}

export interface BulkDeleteResult extends ActionResult {
  deletedCount: number
}

export interface UseRoundActionsParams {
  userId: string | null
  setRounds: React.Dispatch<React.SetStateAction<HistoricalRound[]>>
}

export interface UseRoundActionsResult {
  deleting:           string | null
  deletingAll:        boolean
  savingEdit:         boolean
  deleteRound:        (id: string) => Promise<ActionResult>
  toggleExcluded:     (round: HistoricalRound) => Promise<ActionResult>
  saveEdit:           (id: string, scores: (number | null)[]) => Promise<ActionResult>
  deleteAllRounds:    () => Promise<BulkDeleteResult>
}

/** Recalcula el índice Golfers+ post-mutación. Awaiteado para confirmar al usuario. */
async function recalcIndice(userId: string | null): Promise<void> {
  if (!userId) return
  const supabase = createClient()
  const { error } = await supabase.rpc('calcular_indice_golfers', { p_user_id: userId })
  if (error) {
    // No es fatal para la acción (la ronda ya se borró/excluyó); solo lo registramos.
    void captureError(error, { context: 'historial.recalcIndice', userId })
  }
}

export function useRoundActions({ userId, setRounds }: UseRoundActionsParams): UseRoundActionsResult {
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [savingEdit,  setSavingEdit]  = useState(false)

  const deleteRound = useCallback(async (id: string): Promise<ActionResult> => {
    setDeleting(id)
    const supabase = createClient()
    // .select('id') → sabemos cuántas filas borró realmente (detecta no-op de RLS).
    const { data, error } = await supabase
      .from('historical_rounds')
      .delete()
      .eq('id', id)
      .select('id')
    setDeleting(null)
    if (error) {
      void captureError(error, { context: 'historial.delete', userId, meta: { roundId: id } })
      return { ok: false, reason: 'error' }
    }
    if (!data || data.length === 0) {
      // 0 filas: la ronda ya no existe o RLS la filtró. NO la sacamos de la UI
      // como si hubiera éxito — sería el bug "se borra pero vuelve".
      void captureError('delete afectó 0 filas', { context: 'historial.delete.noop', userId, meta: { roundId: id } })
      return { ok: false, reason: 'noop' }
    }
    setRounds(prev => prev.filter(r => r.id !== id))
    // FIX inbox f772e78b: recalcular el índice tras borrar.
    await recalcIndice(userId)
    return { ok: true }
  }, [userId, setRounds])

  const toggleExcluded = useCallback(async (round: HistoricalRound): Promise<ActionResult> => {
    const next = !round.excluded_from_handicap
    // Update optimista
    setRounds(prev => prev.map(x => x.id === round.id ? { ...x, excluded_from_handicap: next } : x))
    const supabase = createClient()
    const { data, error } = await supabase
      .from('historical_rounds')
      .update({ excluded_from_handicap: next })
      .eq('id', round.id)
      .select('id')
    if (error || !data || data.length === 0) {
      // Revert si falló o no afectó filas (RLS / ya no existe).
      setRounds(prev => prev.map(x => x.id === round.id ? { ...x, excluded_from_handicap: !next } : x))
      void captureError(error ?? 'update afectó 0 filas', {
        context: error ? 'historial.toggleExcluded' : 'historial.toggleExcluded.noop',
        userId, meta: { roundId: round.id, next },
      })
      return { ok: false, reason: error ? 'error' : 'noop' }
    }
    await recalcIndice(userId)
    return { ok: true }
  }, [userId, setRounds])

  const saveEdit = useCallback(async (id: string, editScores: (number | null)[]): Promise<ActionResult> => {
    setSavingEdit(true)
    const filled = editScores.filter((s): s is number => s != null)
    const totalGross = filled.reduce((a, b) => a + b, 0)
    const totalGrossOrNull = totalGross > 0 ? totalGross : null
    const supabase = createClient()
    const { data, error } = await supabase
      .from('historical_rounds')
      .update({ scores: editScores, total_gross: totalGrossOrNull })
      .eq('id', id)
      .select('id')
    setSavingEdit(false)
    if (error || !data || data.length === 0) {
      void captureError(error ?? 'update afectó 0 filas', {
        context: error ? 'historial.saveEdit' : 'historial.saveEdit.noop',
        userId, meta: { roundId: id },
      })
      return { ok: false, reason: error ? 'error' : 'noop' }
    }
    setRounds(prev => prev.map(r =>
      r.id === id ? { ...r, scores: editScores, total_gross: totalGrossOrNull } : r
    ))
    // Cambiar scores cambia el diferencial — recalcular índice.
    await recalcIndice(userId)
    return { ok: true }
  }, [userId, setRounds])

  const deleteAllRounds = useCallback(async (): Promise<BulkDeleteResult> => {
    if (!userId) return { ok: false, reason: 'error', deletedCount: 0 }
    setDeletingAll(true)
    const supabase = createClient()
    // Filtramos por user_id explícito (cinturón + RLS): jamás tocar filas ajenas.
    const { data, error } = await supabase
      .from('historical_rounds')
      .delete()
      .eq('user_id', userId)
      .select('id')
    setDeletingAll(false)
    if (error) {
      void captureError(error, { context: 'historial.deleteAll', userId })
      return { ok: false, reason: 'error', deletedCount: 0 }
    }
    const deletedCount = data?.length ?? 0
    setRounds([])
    await recalcIndice(userId)
    return { ok: true, deletedCount }
  }, [userId, setRounds])

  return { deleting, deletingAll, savingEdit, deleteRound, toggleExcluded, saveEdit, deleteAllRounds }
}
