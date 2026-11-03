// Edición inline del handicap de inscripción desde el tab Resumen.
// Persistencia vía capa de datos; el caller decide qué refrescar al guardar
// (roster local + board del Resumen, que reparte golpes con este número).

import { useCallback, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { updatePlayerHandicap, type ScoringCourse } from '@/lib/data/tournaments/scoring'
import {
  courseDataDeInscripcion,
  esHandicapDeInscripcionValido,
  formatearHandicap,
  mensajeHandicapFueraDeRango,
  parsearHandicap,
  rangoDeHandicapDeInscripcion,
} from '@/golf/handicap-index-range'

interface UseHcpEditorArgs {
  onSaved: (playerId: string, value: number) => void
  /** `tournaments.hcp_calc_mode`: en WHS la columna guarda el ÍNDICE; en raw, el course handicap. */
  hcpCalcMode: string | null | undefined
  /** Cancha de la ronda 1: en raw el rango creíble sale de SU fórmula. */
  course: ScoringCourse | null
}

export function useHcpEditor({ onSaved, hcpCalcMode, course }: UseHcpEditorArgs) {
  const { showError, showSuccess, showWarning } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // Rango desde la fuente única `@/golf/handicap-index-range`: índice (−10..54)
  // en WHS; en raw, también la imagen de ese rango por la fórmula de la cancha,
  // porque ahí la columna guarda un course handicap que pasa de 54 legítimamente.
  const rango = useMemo(
    () => rangoDeHandicapDeInscripcion(hcpCalcMode, courseDataDeInscripcion(course)),
    [hcpCalcMode, course],
  )

  const startEdit = useCallback((playerId: string, current: number | null) => {
    setEditingId(playerId)
    // Se precarga como se muestra ("+2"), no como lo guarda la base ("-2").
    setEditValue(current == null ? '' : formatearHandicap(current))
  }, [])

  const cancel = useCallback(() => setEditingId(null), [])

  const save = useCallback(
    async (playerId: string) => {
      // "+2" (notación del golf) y "-2" (como lo guarda la app) son el mismo plus.
      const value = parsearHandicap(editValue)
      if (!esHandicapDeInscripcionValido(value, rango)) {
        showWarning('Handicap inválido', mensajeHandicapFueraDeRango(rango))
        setEditingId(null)
        return
      }
      try {
        await updatePlayerHandicap(createClient(), playerId, value, rango)
        onSaved(playerId, value)
        showSuccess('Handicap actualizado', '', { duration: 1500 })
      } catch (e) {
        void captureError(e, { context: 'scoring.useHcpEditor.save', meta: { playerId } })
        showError('Error', 'No se pudo actualizar el handicap.')
      }
      setEditingId(null)
    },
    [editValue, onSaved, rango, showError, showSuccess, showWarning],
  )

  return { editingId, editValue, setEditValue, startEdit, cancel, save }
}

export type UseHcpEditorReturn = ReturnType<typeof useHcpEditor>
