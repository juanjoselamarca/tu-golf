'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type React from 'react'
import { createClient } from '@/lib/supabase'
import { saveRondaLibreScores } from '@/lib/data/ronda-libre-scores'
import { addToast } from '@/hooks/useToast'
import type { SaveStatus } from '../types'
import type { useScoreSync } from '@/hooks/useScoreSync'
import { RONDA_ERRCODE } from '@/lib/data/ronda-libre-cierre'

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

/** Cómo terminó un guardado en el servidor (los avisos de finalizada/sin permiso ya los da el hook). */
export type ResultadoGuardado = 'guardado' | 'finalizada' | 'sin_permiso' | 'sin_conexion'

export interface UseScoreSaveResult {
  saveScores: (jugadorId: string, holeScores: Record<number, number>) => Promise<void>
  /**
   * Guarda YA (sin la espera del debounce) y espera la respuesta del servidor.
   * Para Finalizar: la ronda no se cierra ni se lee "fresca" con un hoyo en vuelo.
   * Antes espera el guardado que ya hubiera salido (si no, su reintento con la
   * tarjeta vieja podía aterrizar después y pisar el último golpe). Sin conexión o
   * ronda ya cerrada no avisa ni redirige: el que llama decide qué hacer.
   */
  guardarAhora: (jugadorId: string, holeScores: Record<number, number>) => Promise<ResultadoGuardado>
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
  // El guardado al servidor que está en curso (con sus reintentos), para que
  // guardarAhora no corra en paralelo con uno anterior.
  const enVueloRef = useRef<Promise<ResultadoGuardado> | null>(null)
  // Finalizar en curso: el guardado anterior que guardarAhora espera tampoco avisa ni redirige.
  const finalizandoRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ jugadorId: string; holeScores: Record<number, number> } | null>(null)

  // Cleanup: si el componente se desmonta con un save pendiente, disparar
  // inmediatamente para no perder el último tap (CERO FALLOS).
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
      saveRondaLibreScores(supabase, { codigo, jugadorId: pending.jugadorId, delta: scoresObj }).then(() => { /* ok */ }, () => { /* silent — local backup existe */ })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al desmontar; codigo es fijo por página
  }, [])

  // executeSave: la lógica real de guardado (local + RPC + retries).
  const ejecutarGuardado = useCallback(async (
    jugadorId: string,
    holeScores: Record<number, number>,
    paraFinalizar: boolean,
  ): Promise<ResultadoGuardado> => {
    setSaveStatus('saving')
    // Local ya se guardó en saveScores (debounce wrapper) — acá solo va al server.

    if (!isOnline) { setSaveStatus('offline'); return 'sin_conexion' }

    // La validación de estado (en_curso vs finalizada) la hace el RPC server-side
    // (error P0002). Antes había una query SELECT previa que añadía 100-200ms de
    // latencia en cada score. Eliminada: el RPC ya cubre ese caso.

    const scoresObj: Record<string, number> = {}
    for (const [k, v] of Object.entries(holeScores)) scoresObj[String(k)] = v  // Explicit string keys for JSONB

    let success = false
    let rondaFinalizedRpc = false
    let forbiddenRpc = false
    let intentos = 0
    while (!success && intentos < 3) {
      const supabase = createClient()
      // Audit 2026-05-17 P0 #1: RPC hace merge atómico server-side (`scores || delta`)
      // en vez del UPDATE completo que perdía hoyos si el estado React quedaba stale.
      const { error } = await saveRondaLibreScores(supabase, { codigo, jugadorId: jugadorId, delta: scoresObj })
      if (!error) { success = true }
      else if (error.code === RONDA_ERRCODE.FINALIZED) { rondaFinalizedRpc = true; break }
      // Sin permiso sobre esta tarjeta: reintentar no cambia nada.
      else if (error.code === RONDA_ERRCODE.FORBIDDEN) { forbiddenRpc = true; break }
      else {
        // Backoff exponencial: 400ms, 800ms. Alineado con score-grupo.
        if (intentos < 2) {
          await new Promise(r => setTimeout(r, 400 * (intentos + 1)))
        }
        intentos++
      }
    }

    if (rondaFinalizedRpc) {
      setSaveStatus('error')
      // Finalizar sigue por su cuenta (la tarjeta va igual al historial): ni aviso ni redirect.
      if (paraFinalizar || finalizandoRef.current) return 'finalizada'
      addToast({ type: 'warning', title: 'Ronda finalizada', message: 'El administrador cerro esta ronda. Tus scores estan guardados en tu dispositivo.', duration: 8000 })
      onRondaFinalized?.()
      return 'finalizada'
    }
    if (forbiddenRpc) {
      setSaveStatus('error')
      addToast({ type: 'error', title: 'No puedes anotar esta tarjeta', message: 'Inicia sesión con la cuenta del jugador o pídele a quien creó la ronda que anote. Tus scores están guardados en tu dispositivo.', duration: 8000 })
      return 'sin_permiso'
    }
    if (!success) {
      setSaveStatus('error')
      if (!paraFinalizar && !finalizandoRef.current) addToast({ type: 'error', title: 'Error al guardar', message: 'No se pudo conectar despues de 3 intentos. Tus scores estan guardados en tu dispositivo.', duration: 8000 })
      return 'sin_conexion'
    } else {
      setSaveStatus('saved'); setHasUnsaved(false)
      scoreSync.marcarSincronizado()
      // UI feedback delegado al caller (page.tsx) via onSaveSuccess
      onSaveSuccess?.()
      setTimeout(() => setSaveStatus('idle'), 1500)
      return 'guardado'
    }
  }, [codigo, isOnline, scoreSync, onSaveSuccess, onRondaFinalized])

  const executeSave = useCallback((
    jugadorId: string,
    holeScores: Record<number, number>,
    { paraFinalizar = false }: { paraFinalizar?: boolean } = {},
  ): Promise<ResultadoGuardado> => {
    const guardado = ejecutarGuardado(jugadorId, holeScores, paraFinalizar)
    enVueloRef.current = guardado
    void guardado.finally(() => { if (enVueloRef.current === guardado) enVueloRef.current = null })
    return guardado
  }, [ejecutarGuardado])

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

  const guardarAhora = useCallback(async (jugadorId: string, holeScores: Record<number, number>): Promise<ResultadoGuardado> => {
    // Lo que esperaba en el debounce queda contenido en esta tarjeta (es la más nueva).
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    pendingSaveRef.current = null
    setHasUnsaved(true)
    scoreSync.guardarLocal(holeScores)
    // El guardado que ya salió termina primero: el de Finalizar es el último en llegar.
    finalizandoRef.current = true
    try {
      await enVueloRef.current?.catch(() => {})
      return await executeSave(jugadorId, holeScores, { paraFinalizar: true })
    } finally {
      finalizandoRef.current = false
    }
  }, [scoreSync, executeSave])

  return { saveScores, guardarAhora, saveStatus, setSaveStatus, hasUnsaved, setHasUnsaved }
}
