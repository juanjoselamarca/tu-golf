'use client'

import { useCallback, useState } from 'react'
import type React from 'react'
import { haptic } from '@/lib/ronda/helpers'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'
import { saveGroupTeamScores, marcarPendientes, ID_PENDIENTE_EQUIPO, olvidarRechazado } from '@/lib/ronda/score-storage'
import { limitarGolpes } from '@/golf/ronda-libre/golpes-por-hoyo'
import { completarEquiposSinMarcarConPar } from '@/golf/ronda-libre/tarjeta-historica'

export interface TeamScoreSave {
  /** +/- sobre el score COMPARTIDO del equipo (scramble / foursome) en un hoyo. */
  handleTeamScoreChange: (equipoId: string, hole: number, delta: number) => void
  /** Equipos sin score en el hoyo → par (al pasar de hoyo). No espera al servidor. */
  autoFillTeamsWithPar: (hole: number, par: number) => Promise<void>
  /**
   * Al finalizar (bola compartida): los hoyos DE LA RONDA sin score del equipo → par.
   * Deja los pendientes marcados ANTES de volver (los envía `enviarPendientes`) y
   * devuelve los equipos completos (lo que se guarda en el historial).
   */
  completarEquiposConPar: (equipos: EquipoDelScorer[], hoyos: readonly number[]) => EquipoDelScorer[]
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
}): TeamScoreSave {
  const { codigo, parMap, setTeamEquipos, setHasUnsaved, programarEnvio } = input
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

  const autoFillTeamsWithPar = useCallback(async (hole: number, par: number) => {
    const key = String(hole)
    setTeamEquipos(prev => {
      const next = prev.map(eq => {
        if (eq.scores[key] != null) return eq
        marcarPendientes(codigo, ID_PENDIENTE_EQUIPO(eq.id), { [key]: par })
        return { ...eq, scores: { ...eq.scores, [key]: par } }
      })
      respaldar(codigo, next)
      return next
    })
    setHasUnsaved(true)
    programarEnvio()
  }, [codigo, setTeamEquipos, setHasUnsaved, programarEnvio])

  const completarEquiposConPar = useCallback((equipos: EquipoDelScorer[], hoyos: readonly number[]) => {
    const { equipos: next, rellenados } = completarEquiposSinMarcarConPar(equipos, hoyos, parMap)
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

  return { handleTeamScoreChange, autoFillTeamsWithPar, completarEquiposConPar, foursomeInvertido, toggleFoursomeInvertido }
}
