'use client'

import { useEffect } from 'react'
import type React from 'react'
import { createClient } from '@/lib/supabase'
import { saveRondaLibreScores } from '@/lib/data/ronda-libre-scores'
import { haptic } from '@/lib/ronda/helpers'
import type { useScoreSync } from '@/hooks/useScoreSync'
import type { SaveStatus } from '../types'

type ScoreSyncReturn = ReturnType<typeof useScoreSync>

/**
 * Auto-sync al reconectar: cuando `isOnline` pasa a true y hay scores
 * pendientes en el respaldo local (`useScoreSync`), los manda al servidor
 * por la capa de datos (merge server-side vía RPC — audit 2026-05-17 P0 #1:
 * nunca se pierden hoyos) y marca el respaldo como sincronizado.
 */
export function useOfflineResync(input: {
  codigo: string
  isOnline: boolean
  activeJugadorId: string | null
  scoreSync: ScoreSyncReturn
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>
  /** Muestra el check de "guardado" un instante. */
  onSynced: (visibleMs: number) => void
}): void {
  const { codigo, isOnline, activeJugadorId, scoreSync, setSaveStatus, onSynced } = input

  useEffect(() => {
    if (!isOnline) return
    if (!activeJugadorId) return
    if (!scoreSync.tienePendientes()) return
    if (scoreSync.syncInProgressRef.current) return

    scoreSync.syncInProgressRef.current = true
    const pendingScores = scoreSync.obtenerLocal()
    if (pendingScores) {
      const supabase = createClient()
      const scoresObj: Record<string, number> = {}
      for (const [k, v] of Object.entries(pendingScores)) scoresObj[k] = v
      saveRondaLibreScores(supabase, { codigo, jugadorId: activeJugadorId, delta: scoresObj })
        .then(({ error }) => {
          if (!error) {
            scoreSync.marcarSincronizado()
            setSaveStatus('saved')
            onSynced(1000)
            haptic(20)
            setTimeout(() => setSaveStatus('idle'), 1500)
          }
          scoreSync.syncInProgressRef.current = false
        })
    } else {
      scoreSync.syncInProgressRef.current = false
    }
  }, [isOnline, activeJugadorId, scoreSync, codigo, setSaveStatus, onSynced])
}
