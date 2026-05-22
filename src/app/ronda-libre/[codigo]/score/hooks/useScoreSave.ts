'use client'

import { useState, useRef, useCallback } from 'react'
import type React from 'react'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { saveScores as lsSave } from '@/lib/ronda/score-storage'
import type { SaveStatus } from '../types'
import type { useScoreSync } from '@/hooks/useScoreSync'

type ScoreSyncReturn = ReturnType<typeof useScoreSync>

interface UseScoreSaveOptions {
  codigo: string
  isOnline: boolean
  scoreSync: ScoreSyncReturn
  /** Llamado al guardar exitosamente — UI feedback: haptic + save check visible */
  onSaveSuccess?: () => void
  /** Llamado cuando supabase reporta que la ronda ya fue finalizada */
  onRondaFinalized?: () => void
}

export interface UseScoreSaveResult {
  saveScores: (jugadorId: string, holeScores: Record<number, number>) => Promise<void>
  saveStatus: SaveStatus
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>
  hasUnsaved: boolean
  setHasUnsaved: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Encapsula toda la logica de guardado del scorer:
 * - Guardado local optimista SIEMPRE antes de tocar supabase
 * - Manejo offline con saveStatus='offline'
 * - Validacion de estado de ronda antes de update
 * - Retry loop (3 intentos) ante fallo de red
 * - Callbacks para UI feedback (onSaveSuccess) y navegacion (onRondaFinalized)
 *
 * NOTE: setSaveStatus se expone en el resultado para que el auto-sync useEffect
 * en page.tsx pueda actualizar el status al sincronizar scores pendientes
 * (opcion a — minimo cambio, evita mover el useEffect al hook).
 */
export function useScoreSave(opts: UseScoreSaveOptions): UseScoreSaveResult {
  const { codigo, isOnline, scoreSync, onSaveSuccess, onRondaFinalized } = opts

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const retryCountRef = useRef(0)

  const saveScores = useCallback(async (jugadorId: string, holeScores: Record<number, number>) => {
    setSaveStatus('saving')
    // Guardar localmente SIEMPRE primero (funciona sin internet)
    scoreSync.guardarLocal(holeScores)
    lsSave(codigo, jugadorId, holeScores)

    if (!isOnline) { setSaveStatus('offline'); return }

    // Validate ronda is still en_curso before saving (admin may have closed/deleted it)
    const supabaseCheck = createClient()
    const { data: rondaCheck } = await supabaseCheck.from('rondas_libres').select('estado').eq('codigo', codigo).single()
    if (!rondaCheck || rondaCheck.estado === 'finalizada') {
      setSaveStatus('error')
      addToast({ type: 'warning', title: 'Ronda finalizada', message: 'El administrador cerro esta ronda. Tus scores estan guardados en tu dispositivo.', duration: 8000 })
      onRondaFinalized?.()
      return
    }

    const scoresObj: Record<string, number> = {}
    for (const [k, v] of Object.entries(holeScores)) scoresObj[String(k)] = v  // Explicit string keys for JSONB

    let success = false
    let rondaFinalizedRpc = false
    retryCountRef.current = 0
    while (!success && retryCountRef.current < 3) {
      const supabase = createClient()
      // Audit 2026-05-17 P0 #1: RPC hace merge atómico server-side (`scores || delta`)
      // en vez del UPDATE completo que perdía hoyos si el estado React quedaba stale.
      const { error } = await supabase.rpc('upsert_ronda_libre_scores', {
        p_jugador_id: jugadorId,
        p_codigo: codigo,
        p_delta: scoresObj,
      })
      if (!error) { success = true; retryCountRef.current = 0 }
      else if (error.code === 'P0002') { rondaFinalizedRpc = true; break }
      else retryCountRef.current++
    }

    if (rondaFinalizedRpc) {
      setSaveStatus('error')
      addToast({ type: 'warning', title: 'Ronda finalizada', message: 'El administrador cerro esta ronda. Tus scores estan guardados en tu dispositivo.', duration: 8000 })
      onRondaFinalized?.()
      return
    }
    if (!success) {
      setSaveStatus('error')
      addToast({ type: 'error', title: 'Error al guardar', message: 'No se pudo conectar despues de 3 intentos. Tus scores estan guardados en tu dispositivo.', duration: 8000 })
    } else {
      setSaveStatus('saved'); setHasUnsaved(false)
      scoreSync.marcarSincronizado()
      // UI feedback delegado al caller (page.tsx) via onSaveSuccess
      onSaveSuccess?.()
      setTimeout(() => setSaveStatus('idle'), 1500)
    }
  }, [codigo, isOnline, scoreSync, onSaveSuccess, onRondaFinalized])

  return { saveScores, saveStatus, setSaveStatus, hasUnsaved, setHasUnsaved }
}
