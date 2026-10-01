'use client'

import { useCallback, useState } from 'react'
import type React from 'react'
import { createClient } from '@/lib/supabase'
import { saveRondaEquiposScores } from '@/lib/data/ronda-libre-scores'
import { addToast } from '@/hooks/useToast'
import { haptic } from '@/lib/ronda/helpers'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'
import { SAVE_RETRIES, SCORE_MIN, SCORE_MAX, type GrupoSaveStatus } from './useGrupoScoreSave'

export interface TeamScoreSave {
  /** +/- sobre el score COMPARTIDO del equipo (scramble / foursome) en un hoyo. */
  handleTeamScoreChange: (equipoId: string, hole: number, delta: number) => void
  /** Equipos sin score en el hoyo → par (al pasar de hoyo). Delta-only, preserva el resto. */
  autoFillTeamsWithPar: (hole: number, par: number) => Promise<void>
  /** Foursome: invertir orden de salida por equipo (A→pares, B→impares). */
  foursomeInvertido: Record<string, boolean>
  toggleFoursomeInvertido: (equipoId: string) => void
}

/**
 * Score compartido de equipo (scramble / foursome): vive en `ronda_equipos`
 * y se guarda por la capa de datos (RPC merge server-side + aviso a los
 * seguidores), con 3 reintentos y estado visible — nunca una falla muda.
 */
export function useTeamScoreSave(input: {
  codigo: string
  parMap: Record<number, number>
  teamEquipos: EquipoDelScorer[]
  setTeamEquipos: React.Dispatch<React.SetStateAction<EquipoDelScorer[]>>
  setSaveStatus: React.Dispatch<React.SetStateAction<GrupoSaveStatus>>
  setHasUnsaved: React.Dispatch<React.SetStateAction<boolean>>
}): TeamScoreSave {
  const { codigo, parMap, teamEquipos, setTeamEquipos, setSaveStatus, setHasUnsaved } = input
  const [foursomeInvertido, setFoursomeInvertido] = useState<Record<string, boolean>>({})

  const handleTeamScoreChange = useCallback((equipoId: string, hole: number, delta: number) => {
    setTeamEquipos(prev => prev.map(eq => {
      if (eq.id !== equipoId) return eq
      const key = String(hole)
      const current = eq.scores[key]
      const base = current ?? (parMap[hole] ?? 4)
      const newScore = Math.max(SCORE_MIN, Math.min(SCORE_MAX, base + delta))
      const newScores = { ...eq.scores, [key]: newScore }
      // Persist to DB with retry and visible status (no more silent failures)
      setSaveStatus('saving')
      ;(async () => {
        const supabase = createClient()
        let ok = false
        let attempts = 0
        while (!ok && attempts < SAVE_RETRIES) {
          const { error } = await saveRondaEquiposScores(supabase, { codigo, equipoId, delta: newScores, jugadorId: eq.jugadorIds[0] })
          if (!error) ok = true
          else {
            attempts++
            if (attempts < SAVE_RETRIES) await new Promise(r => setTimeout(r, 400 * attempts))
          }
        }
        if (ok) {
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 1500)
        } else {
          setSaveStatus('error')
          addToast({
            type: 'error',
            title: `Error guardando equipo en hoyo ${hole}`,
            message: 'Tu cambio quedó en la pantalla pero no pudo guardarse. Revisa tu conexión.',
            duration: 6000,
          })
        }
      })()
      setHasUnsaved(true)
      haptic(10)
      return { ...eq, scores: newScores }
    }))
  }, [parMap, codigo, setTeamEquipos, setSaveStatus, setHasUnsaved])

  const autoFillTeamsWithPar = useCallback(async (hole: number, par: number) => {
    const supabase = createClient()
    const key = String(hole)
    for (const eq of teamEquipos) {
      if (eq.scores[key] == null) {
        // Audit 2026-05-17 P0 #1: delta-only RPC, preserva el resto del JSONB del equipo.
        await saveRondaEquiposScores(supabase, { codigo, equipoId: eq.id, delta: { [key]: par }, jugadorId: eq.jugadorIds[0] })
        setTeamEquipos(prev => prev.map(e => e.id === eq.id ? { ...e, scores: { ...e.scores, [key]: par } } : e))
      }
    }
  }, [codigo, teamEquipos, setTeamEquipos])

  const toggleFoursomeInvertido = useCallback((equipoId: string) => {
    haptic(15)
    setFoursomeInvertido(prev => ({ ...prev, [equipoId]: !prev[equipoId] }))
  }, [])

  return { handleTeamScoreChange, autoFillTeamsWithPar, foursomeInvertido, toggleFoursomeInvertido }
}
