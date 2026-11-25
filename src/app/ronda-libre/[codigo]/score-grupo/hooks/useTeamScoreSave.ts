'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type React from 'react'
import { haptic } from '@/lib/ronda/helpers'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'
import { saveGroupTeamScores, marcarPendientes, ID_PENDIENTE_EQUIPO, olvidarRechazado } from '@/lib/ronda/score-storage'
import { limitarGolpes } from '@/golf/ronda-libre/golpes-por-hoyo'
import { completarEquiposSinMarcarConPar } from '@/golf/ronda-libre/tarjeta-historica'

export interface TeamScoreSave {
  /** +/- sobre el score COMPARTIDO del equipo (scramble / foursome) en un hoyo. */
  handleTeamScoreChange: (equipoId: string, hole: number, delta: number) => void
  /**
   * Confirma el valor que la pantalla muestra en el hoyo: los equipos que este celular confirma
   * (`equiposQueConfirmanElHoyo`) y no tienen score en el hoyo quedan con el par gris. Una sola regla para
   * «Siguiente» y «Guardar hoyo N». Nunca toca `noConfirmanElHoyo` (un celular por equipo: los de otro celular y
   * los sin reclamar que nadie anota todavía).
   * `inmediato`: lo envía YA y la promesa espera ese envío (último hoyo); si no, con el debounce y sin esperar.
   */
  confirmarHoyo: (hole: number, par: number, opciones?: { inmediato?: boolean }) => Promise<void>
  /**
   * Al finalizar (bola compartida): los hoyos DE LA RONDA sin score del equipo → par.
   * Deja los pendientes marcados ANTES de volver (los envía `enviarPendientes`) y
   * devuelve los equipos completos (lo que se guarda en el historial).
   * `sinPar`: los equipos que no se rellenan, leídos recién del servidor al cerrar; sin él, `sinParAutomatico`.
   */
  completarEquiposConPar: (equipos: EquipoDelScorer[], hoyos: readonly number[], sinPar?: ReadonlyArray<{ id: string }>) => EquipoDelScorer[]
  /** Foursome: invertir orden de salida por equipo (A→pares, B→impares). */
  foursomeInvertido: Record<string, boolean>
  toggleFoursomeInvertido: (equipoId: string) => void
}

/** Respaldo local de los scores de todos los equipos (fuente: el estado en pantalla). */
function respaldar(codigo: string, equipos: EquipoDelScorer[]): void {
  saveGroupTeamScores(codigo, Object.fromEntries(equipos.map(e => [e.id, e.scores])))
}

/**
 * Score compartido de equipo (scramble / foursome): vive en `ronda_equipos`.
 *
 * Mismo camino resistente que las tarjetas individuales (caída 04-oct-2026, revisión
 * Fable): cada cambio se respalda en el teléfono, queda PENDIENTE (`eq:<equipoId>`) y lo
 * envía `programarEnvio` de useGrupoScoreSave — con plazo, sincronización automática y
 * aviso. Antes un equipo no tenía respaldo local y "Siguiente" esperaba al servidor.
 */
export function useTeamScoreSave(input: {
  codigo: string
  parMap: Record<number, number>
  teamEquipos: EquipoDelScorer[]
  setTeamEquipos: React.Dispatch<React.SetStateAction<EquipoDelScorer[]>>
  setHasUnsaved: React.Dispatch<React.SetStateAction<boolean>>
  /** Envía lo pendiente (useGrupoScoreSave). */
  programarEnvio: () => void
  /** Envía lo pendiente YA, sin debounce (useGrupoScoreSave). */
  enviarYa: () => Promise<unknown>
  /**
   * Un celular por equipo: los equipos que este celular NO rellena con par (`equiposSinParAutomatico`: los de otro
   * celular y los sin reclamar). El par al pasar de hoyo y al finalizar nunca los toca, aunque una lista vieja los
   * tuviera en pantalla. Se editan a mano.
   */
  sinParAutomatico?: ReadonlyArray<{ id: string }>
  /**
   * Un celular por equipo: los equipos cuyo par gris este celular NO guarda al confirmar el hoyo
   * (`equiposQueNoConfirmanElHoyo`). Sin esto, `sinParAutomatico`.
   */
  noConfirmanElHoyo?: ReadonlyArray<{ id: string }>
}): TeamScoreSave {
  const { codigo, parMap, setTeamEquipos, setHasUnsaved, programarEnvio, enviarYa } = input
  const sinParRef = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => { sinParRef.current = new Set((input.sinParAutomatico ?? []).map(e => e.id)) }, [input.sinParAutomatico])
  const noConfirmanRef = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    noConfirmanRef.current = new Set((input.noConfirmanElHoyo ?? input.sinParAutomatico ?? []).map(e => e.id))
  }, [input.noConfirmanElHoyo, input.sinParAutomatico])
  const [foursomeInvertido, setFoursomeInvertido] = useState<Record<string, boolean>>({})

  const handleTeamScoreChange = useCallback((equipoId: string, hole: number, delta: number) => {
    setTeamEquipos(prev => {
      const next = prev.map(eq => {
        if (eq.id !== equipoId) return eq
        const key = String(hole)
        const base = eq.scores[key] ?? (parMap[hole] ?? 4)
        const newScore = limitarGolpes(base + delta)
        marcarPendientes(codigo, ID_PENDIENTE_EQUIPO(equipoId), { [key]: newScore })
        olvidarRechazado(codigo, ID_PENDIENTE_EQUIPO(equipoId), hole)
        return { ...eq, scores: { ...eq.scores, [key]: newScore } }
      })
      respaldar(codigo, next)
      return next
    })
    setHasUnsaved(true)
    haptic(10)
    programarEnvio()
  }, [parMap, codigo, setTeamEquipos, setHasUnsaved, programarEnvio])

  const confirmarHoyo = useCallback(async (hole: number, par: number, opciones?: { inmediato?: boolean }) => {
    const key = String(hole)
    // flushSync: el par queda en la cola del teléfono ANTES de enviar (el envío inmediato lee la cola al tiro).
    flushSync(() => {
      setTeamEquipos(prev => {
        const next = prev.map(eq => {
          if (eq.scores[key] != null || noConfirmanRef.current.has(eq.id)) return eq
          marcarPendientes(codigo, ID_PENDIENTE_EQUIPO(eq.id), { [key]: par })
          return { ...eq, scores: { ...eq.scores, [key]: par } }
        })
        respaldar(codigo, next)
        return next
      })
    })
    setHasUnsaved(true)
    if (opciones?.inmediato) await enviarYa()
    else programarEnvio()
  }, [codigo, setTeamEquipos, setHasUnsaved, programarEnvio, enviarYa])

  const completarEquiposConPar = useCallback((equipos: EquipoDelScorer[], hoyos: readonly number[], sinPar?: ReadonlyArray<{ id: string }>) => {
    const excluidos = sinPar ? new Set(sinPar.map(e => e.id)) : sinParRef.current
    const { equipos: propios, rellenados } = completarEquiposSinMarcarConPar(equipos.filter(e => !excluidos.has(e.id)), hoyos, parMap)
    const completados = new Map(propios.map(e => [e.id, e]))
    const next = rellenados.length > 0 ? equipos.map(e => completados.get(e.id) ?? e) : equipos
    for (const { id, delta } of rellenados) marcarPendientes(codigo, ID_PENDIENTE_EQUIPO(id), delta)
    if (rellenados.length > 0) {
      setTeamEquipos(next)
      respaldar(codigo, next)
    }
    return next
  }, [codigo, parMap, setTeamEquipos])

  const toggleFoursomeInvertido = useCallback((equipoId: string) => {
    haptic(15)
    setFoursomeInvertido(prev => ({ ...prev, [equipoId]: !prev[equipoId] }))
  }, [])

  return { handleTeamScoreChange, confirmarHoyo, completarEquiposConPar, foursomeInvertido, toggleFoursomeInvertido }
}
