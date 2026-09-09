'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type React from 'react'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ jugadorId: string; holeScores: Record<number, number> } | null>(null)

  // Cleanup: si el componente se desmonta con un save pendiente, disparar
  // inmediatamente para no perder el último tap (CERO FALLOS).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    // Flush: si hay data pendiente, enviar al server ahora
    const pending = pendingSaveRef.current
    if (pending) {
      pendingSaveRef.current = null
      // Fire-and-forget — el componente ya se desmontó, no podemos actualizar state.
      // Pero el score se guardó localmente en saveScores(), así que si el RPC falla
      // se re-sincroniza al volver (useScoreSync).
      const supabase = createClient()
      const scoresObj: Record<string, number> = {}
      for (const [k, v] of Object.entries(pending.holeScores)) scoresObj[String(k)] = v
      supabase.rpc('upsert_ronda_libre_scores', {
        p_jugador_id: pending.jugadorId,
        p_codigo: codigo,
        p_delta: scoresObj,
      }).then(() => { /* ok */ }, () => { /* silent — local backup existe */ })
    }
  }, [])

  // executeSave: la lógica real de guardado (local + RPC + retries).
  const executeSave = useCallback(async (jugadorId: string, holeScores: Record<number, number>) => {
    setSaveStatus('saving')
    // Local ya se guardó en saveScores (debounce wrapper) — acá solo va al server.

    if (!isOnline) { setSaveStatus('offline'); return }

    // La validación de estado (en_curso vs finalizada) la hace el RPC server-side
    // (error P0002). Antes había una query SELECT previa que añadía 100-200ms de
    // latencia en cada score. Eliminada: el RPC ya cubre ese caso.

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
      else {
        // Backoff exponencial: 400ms, 800ms. Alineado con score-grupo.
        if (retryCountRef.current < 2) {
          await new Promise(r => setTimeout(r, 400 * (retryCountRef.current + 1)))
        }
        retryCountRef.current++
      }
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

  // saveScores: debounce 500ms — si el usuario toca +/- rápido, solo el último
  // valor se envía al servidor. El guardado local es inmediato (dentro de executeSave).
  // Alineado con score-grupo que ya tiene debounce de 500ms.
  const saveScores = useCallback((jugadorId: string, holeScores: Record<number, number>): Promise<void> => {
    pendingSaveRef.current = { jugadorId, holeScores }
    setHasUnsaved(true)

    // Guardar localmente inmediato (funciona sin internet)
    scoreSync.guardarLocal(holeScores)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const pending = pendingSaveRef.current
      if (pending) {
        pendingSaveRef.current = null
        void executeSave(pending.jugadorId, pending.holeScores)
      }
    }, 500)

    return Promise.resolve()
  }, [scoreSync, executeSave])

  return { saveScores, saveStatus, setSaveStatus, hasUnsaved, setHasUnsaved }
}
