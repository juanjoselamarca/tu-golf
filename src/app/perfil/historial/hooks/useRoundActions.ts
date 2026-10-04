/**
 * Hook que centraliza acciones sobre rondas históricas:
 *  - deleteRound(id)           → DELETE + recalcular índice + actualizar estado
 *  - toggleExcluded(round)     → UPDATE excluded_from_handicap + recalcular índice
 *  - saveEdit(id, scores)      → `actualizarScoresDeRonda` (golpes, total, hoyos y
 *                                DIFERENCIAL recalculado) + recalcular índice
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
import {
  actualizarScoresDeRonda,
  borrarRonda,
  borrarTodasLasRondas,
  marcarExcluidaDelIndice,
  recalcularYLeerIndice,
} from '@/lib/data/historial-edicion'
import type { HistoricalRound } from '../lib/types'

/** Resultado de una acción. `reason` distingue el tipo de fallo para el feedback. */
export interface ActionResult {
  ok: boolean
  /** 'error' = la query falló; 'noop' = 0 filas afectadas (RLS / ya no existe). */
  reason?: 'error' | 'noop'
  /** Índice Golfers+ recalculado tras la acción (null si <3 rondas válidas o falló el recalc). */
  index?: number | null
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

/**
 * Recalcula el índice Golfers+ post-mutación y devuelve el valor nuevo.
 * Awaiteado para confirmar al usuario con el número real (no una promesa vacía).
 * La RPC retorna numeric (el índice) o null (<3 rondas válidas).
 */
async function recalcIndice(userId: string | null): Promise<number | null> {
  if (!userId) return null
  const { indice, error } = await recalcularYLeerIndice(createClient(), userId)
  if (error) {
    // No es fatal para la acción (la ronda ya se borró/excluyó); solo lo registramos.
    void captureError(error, { context: 'historial.recalcIndice', userId })
    return null
  }
  return indice
}

export function useRoundActions({ userId, setRounds }: UseRoundActionsParams): UseRoundActionsResult {
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [savingEdit,  setSavingEdit]  = useState(false)

  const deleteRound = useCallback(async (id: string): Promise<ActionResult> => {
    setDeleting(id)
    // Filas afectadas → sabemos cuántas borró realmente (detecta no-op de RLS).
    const { filas, error } = await borrarRonda(createClient(), id)
    setDeleting(null)
    if (error) {
      void captureError(error, { context: 'historial.delete', userId, meta: { roundId: id } })
      return { ok: false, reason: 'error' }
    }
    if (filas === 0) {
      // 0 filas: la ronda ya no existe o RLS la filtró. NO la sacamos de la UI
      // como si hubiera éxito — sería el bug "se borra pero vuelve".
      void captureError('delete afectó 0 filas', { context: 'historial.delete.noop', userId, meta: { roundId: id } })
      return { ok: false, reason: 'noop' }
    }
    setRounds(prev => prev.filter(r => r.id !== id))
    // FIX inbox f772e78b: recalcular el índice tras borrar.
    const index = await recalcIndice(userId)
    return { ok: true, index }
  }, [userId, setRounds])

  const toggleExcluded = useCallback(async (round: HistoricalRound): Promise<ActionResult> => {
    const next = !round.excluded_from_handicap
    // Update optimista
    setRounds(prev => prev.map(x => x.id === round.id ? { ...x, excluded_from_handicap: next } : x))
    const { filas, error } = await marcarExcluidaDelIndice(createClient(), round.id, next)
    if (error || filas === 0) {
      // Revert si falló o no afectó filas (RLS / ya no existe).
      setRounds(prev => prev.map(x => x.id === round.id ? { ...x, excluded_from_handicap: !next } : x))
      void captureError(error ?? 'update afectó 0 filas', {
        context: error ? 'historial.toggleExcluded' : 'historial.toggleExcluded.noop',
        userId, meta: { roundId: round.id, next },
      })
      return { ok: false, reason: error ? 'error' : 'noop' }
    }
    const index = await recalcIndice(userId)
    return { ok: true, index }
  }, [userId, setRounds])

  const saveEdit = useCallback(async (id: string, editScores: (number | null)[]): Promise<ActionResult> => {
    setSavingEdit(true)
    // Antes sólo se escribían scores + total_gross: el diferencial quedaba el viejo y el
    // índice se "recalculaba" con el mismo número. Ahora se recalcula con la regla única.
    const res = await actualizarScoresDeRonda(createClient(), { id, scores: editScores })
    setSavingEdit(false)
    if (!res.ok) {
      void captureError(res.error ?? 'update afectó 0 filas', {
        context: res.reason === 'error' ? 'historial.saveEdit' : 'historial.saveEdit.noop',
        userId, meta: { roundId: id },
      })
      return { ok: false, reason: res.reason }
    }
    setRounds(prev => prev.map(r =>
      r.id === id
        ? { ...r, scores: res.scores, total_gross: res.total_gross, holes_played: res.holes_played, diferencial: res.diferencial, metadata: res.metadata as HistoricalRound['metadata'] }
        : r
    ))
    // El diferencial cambió — recalcular índice.
    const index = await recalcIndice(userId)
    return { ok: true, index }
  }, [userId, setRounds])

  const deleteAllRounds = useCallback(async (): Promise<BulkDeleteResult> => {
    if (!userId) return { ok: false, reason: 'error', deletedCount: 0 }
    setDeletingAll(true)
    // Filtro explícito por user_id (cinturón + RLS): jamás tocar filas ajenas.
    const { filas, error } = await borrarTodasLasRondas(createClient(), userId)
    setDeletingAll(false)
    if (error) {
      void captureError(error, { context: 'historial.deleteAll', userId })
      return { ok: false, reason: 'error', deletedCount: 0 }
    }
    const deletedCount = filas
    if (deletedCount === 0) {
      // 0 filas: RLS filtró todo o no había nada. NO reportamos un wipe que no
      // ocurrió — mismo principio anti-falla-silenciosa que el borrado individual.
      void captureError('deleteAll afectó 0 filas', { context: 'historial.deleteAll.noop', userId })
      return { ok: false, reason: 'noop', deletedCount: 0 }
    }
    setRounds([])
    const index = await recalcIndice(userId)
    return { ok: true, deletedCount, index }
  }, [userId, setRounds])

  return { deleting, deletingAll, savingEdit, deleteRound, toggleExcluded, saveEdit, deleteAllRounds }
}
