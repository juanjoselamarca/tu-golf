'use client'

import { useEffect } from 'react'
import type { useScoreSync } from '@/hooks/useScoreSync'
import type { UseScoreSaveResult } from './useScoreSave'

type ScoreSyncReturn = ReturnType<typeof useScoreSync>

/**
 * Auto-sync al reconectar (y al abrir con algo pendiente): si el respaldo local
 * (`useScoreSync`) tiene scores sin sincronizar, los manda con el guardado del
 * scorer (`saveImmediately`): reintentos, avisos y marca del respaldo como
 * cualquier guardado, y Finalizar lo espera. Merge server-side vía RPC (audit
 * 2026-05-17 P0 #1: nunca se pierden hoyos). Mientras Finalizar corre no: Finalizar
 * ya manda la tarjeta y un reenvío tardío chocaría con el cierre.
 */
export function useOfflineResync(input: {
  isOnline: boolean
  activeJugadorId: string | null
  finalizando: boolean
  scoreSync: ScoreSyncReturn
  saveImmediately: UseScoreSaveResult['saveImmediately']
}): void {
  const { isOnline, activeJugadorId, finalizando, scoreSync, saveImmediately } = input

  useEffect(() => {
    if (!isOnline) return
    if (!activeJugadorId) return
    if (finalizando) return
    if (!scoreSync.tienePendientes()) return
    if (scoreSync.syncInProgressRef.current) return

    const pendingScores = scoreSync.obtenerLocal()
    if (!pendingScores) return
    scoreSync.syncInProgressRef.current = true
    void saveImmediately(activeJugadorId, pendingScores).finally(() => { scoreSync.syncInProgressRef.current = false })
  }, [isOnline, activeJugadorId, finalizando, scoreSync, saveImmediately])
}
