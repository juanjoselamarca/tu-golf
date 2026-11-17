// Edición inline del handicap de inscripción desde el tab Resumen (Scoring → Resumen).
// Persistencia vía la ruta del servidor (`updatePlayerHandicap`), que con el torneo
// iniciado lleva la corrección a la tarjeta del grupo y al hándicap del equipo.
// El caller decide qué refrescar al guardar (roster local + board del Resumen, que
// reparte golpes con este número) y qué recargar si otro cambio llegó primero.

import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { HandicapCambiadoError, updatePlayerHandicap, type ScoringCourse } from '@/lib/data/tournaments/scoring'
import {
  courseDataDeInscripcion,
  esHandicapDeInscripcionValido,
  mensajeHandicapFueraDeRango,
  parsearHandicap,
  presentacionHandicapInscrito,
  rangoDeHandicapDeInscripcion,
} from '@/golf/handicap-index-range'

interface UseHcpEditorArgs {
  slug: string
  onSaved: (playerId: string, value: number) => void
  /** `tournaments.hcp_calc_mode`: en WHS la columna guarda el ÍNDICE; en raw, el course handicap. */
  hcpCalcMode: string | null | undefined
  /** Cancha de la ronda 1: en raw el rango creíble sale de SU fórmula. */
  course: ScoringCourse | null
  /** Otro cambio del mismo hándicap llegó primero (409): recargar lo que muestra el panel. */
  onConflicto: () => void
}

export function useHcpEditor({ slug, onSaved, hcpCalcMode, course, onConflicto }: UseHcpEditorArgs) {
  const { showError, showSuccess, showWarning } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  // Lo que el organizador VIO al abrir el editor: la ruta lo exige para no pisar otro cambio.
  const [esperado, setEsperado] = useState<number | null>(null)

  // Rango desde la fuente única `@/golf/handicap-index-range`: índice (−10..54)
  // en WHS; en raw, también la imagen de ese rango por la fórmula de la cancha,
  // porque ahí la columna guarda un course handicap que pasa de 54 legítimamente.
  const rango = useMemo(
    () => rangoDeHandicapDeInscripcion(hcpCalcMode, courseDataDeInscripcion(course)),
    [hcpCalcMode, course],
  )

  // Rótulo y formato del panel (Índice en WHS, HCP en el resto): el editor habla igual que la columna.
  const { rotulo, enFrase, formatear } = useMemo(() => presentacionHandicapInscrito(hcpCalcMode), [hcpCalcMode])

  const startEdit = useCallback((playerId: string, current: number | null) => {
    setEditingId(playerId)
    setEsperado(current)
    // Se precarga exactamente como se muestra ("+2.0"), no como lo guarda la base ("-2").
    setEditValue(current == null ? '' : formatear(current))
  }, [formatear])

  const cancel = useCallback(() => setEditingId(null), [])

  const save = useCallback(
    async (playerId: string) => {
      // "+2" (notación del golf) y "-2" (como lo guarda la app) son el mismo plus.
      const value = parsearHandicap(editValue)
      if (!esHandicapDeInscripcionValido(value, rango)) {
        showWarning(`${rotulo} inválido`, mensajeHandicapFueraDeRango(rango))
        setEditingId(null)
        return
      }
      try {
        await updatePlayerHandicap(slug, playerId, value, esperado, rango)
        onSaved(playerId, value)
        showSuccess(`${rotulo} actualizado`, '', { duration: 1500 })
      } catch (e) {
        if (e instanceof HandicapCambiadoError) {
          showWarning('Otro cambio llegó primero', 'Recargamos los datos: revisa y vuelve a intentarlo.')
          onConflicto()
          setEditingId(null)
          return
        }
        void captureError(e, { context: 'scoring.useHcpEditor.save', meta: { playerId } })
        showError('Error', `No se pudo actualizar el ${enFrase}.`)
      }
      setEditingId(null)
    },
    [editValue, enFrase, esperado, onConflicto, onSaved, rango, rotulo, showError, showSuccess, showWarning, slug],
  )

  return { editingId, editValue, setEditValue, startEdit, cancel, save }
}

export type UseHcpEditorReturn = ReturnType<typeof useHcpEditor>
