// Edición inline del handicap de inscripción desde el tab Resumen (Scoring → Resumen).
// Persistencia vía la ruta del servidor (`updatePlayerHandicap`), que con el torneo
// iniciado lleva la corrección a la tarjeta del grupo y al hándicap del equipo.
// El caller decide qué refrescar al guardar (roster local + board del Resumen, que
// reparte golpes con este número) y qué recargar si otro cambio llegó primero.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import {
  HandicapCambiadoError,
  HandicapNoGuardadoError,
  updatePlayerHandicap,
  type ScoringCourse,
} from '@/lib/data/tournaments/scoring'
import {
  courseDataDeInscripcion,
  esHandicapDeInscripcionValido,
  MENSAJE_HANDICAP_UN_DECIMAL,
  mensajeHandicapFueraDeRango,
  parsearHandicap,
  presentacionHandicapInscrito,
  rangoDeHandicapDeInscripcion,
  tieneUnDecimalComoMaximo,
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
  // Blur y Enter llaman los dos a `save`: el segundo, con el mismo esperado, sería un 409 falso.
  // El ref corta la reentrada en el mismo tick; `guardando` deshabilita el input y lo muestra.
  // Ambos son POR JUGADOR: mientras se guarda A (blur) el organizador ya puede estar editando B.
  const enVuelo = useRef(new Set<string>())
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(() => new Set())

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
  const cerrarSi = useCallback((playerId: string) => setEditingId((id) => (id === playerId ? null : id)), [])

  const save = useCallback(
    async (playerId: string) => {
      if (enVuelo.current.has(playerId)) return
      // "+2" (notación del golf) y "-2" (como lo guarda la app) son el mismo plus.
      const value = parsearHandicap(editValue)
      if (!esHandicapDeInscripcionValido(value, rango)) {
        showWarning(`${rotulo} inválido`, mensajeHandicapFueraDeRango(rango))
        cerrarSi(playerId)
        return
      }
      // La columna es numeric(4,1): "12.45" se guardaría 12.5 y la tarjeta quedaría con otro número.
      if (!tieneUnDecimalComoMaximo(value)) {
        showWarning(`${rotulo} inválido`, MENSAJE_HANDICAP_UN_DECIMAL)
        cerrarSi(playerId)
        return
      }
      enVuelo.current.add(playerId)
      setGuardando((s) => new Set(s).add(playerId))
      try {
        // El que quedó en la base (lo devuelve la ruta), no el tipeado.
        const guardado = await updatePlayerHandicap(slug, playerId, value, esperado, rango)
        onSaved(playerId, guardado)
        showSuccess(`${rotulo} actualizado`, '', { duration: 1500 })
      } catch (e) {
        if (e instanceof HandicapCambiadoError) {
          showWarning('Otro cambio llegó primero', 'Recargamos los datos: revisa y vuelve a intentarlo.')
          onConflicto()
        } else if (e instanceof HandicapNoGuardadoError) {
          // El servidor dice por qué (rango, decimales, demasiados cambios seguidos).
          showError('No se guardó', e.message)
        } else {
          void captureError(e, { context: 'scoring.useHcpEditor.save', meta: { playerId } })
          showError('Error', `No se pudo actualizar el ${enFrase}.`)
        }
      } finally {
        enVuelo.current.delete(playerId)
        setGuardando((s) => {
          const n = new Set(s)
          n.delete(playerId)
          return n
        })
        // Cierra SU editor; si el organizador ya abrió otra fila, esa queda abierta.
        cerrarSi(playerId)
      }
    },
    [cerrarSi, editValue, enFrase, esperado, onConflicto, onSaved, rango, rotulo, showError, showSuccess, showWarning, slug],
  )

  return { editingId, editValue, setEditValue, startEdit, cancel, save, guardando }
}

export type UseHcpEditorReturn = ReturnType<typeof useHcpEditor>
