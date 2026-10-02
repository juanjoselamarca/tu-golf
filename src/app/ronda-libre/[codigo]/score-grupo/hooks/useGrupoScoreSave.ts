'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import { createClient } from '@/lib/supabase'
import { saveRondaLibreScores } from '@/lib/data/ronda-libre-scores'
import { addToast } from '@/hooks/useToast'
import { haptic } from '@/lib/ronda/helpers'
import { saveGroupScores } from '@/lib/ronda/score-storage'
import type { RondaLibre } from '@/types/ronda'
import { limitarGolpes } from '@/golf/ronda-libre/golpes-por-hoyo'

export type GrupoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** A1 anti-toque: cuánto dura el pedido de "toca otra vez". */
export const PENDING_CONFIRM_MS = 2000
/** A3: ventana de ediciones libres sobre el mismo jugador/hoyo tras confirmar. */
export const EDIT_WINDOW_MS = 3000
/** A2: un save por jugador, tantos ms después del último tap. */
export const SAVE_DEBOUNCE_MS = 500
/** Reintentos del guardado (backoff 400ms × intento). */
export const SAVE_RETRIES = 3

export interface PendingScoreConfirm {
  jugadorId: string
  hole: number
}

export interface GrupoScoreSave {
  saveStatus: GrupoSaveStatus
  setSaveStatus: React.Dispatch<React.SetStateAction<GrupoSaveStatus>>
  hasUnsaved: boolean
  setHasUnsaved: React.Dispatch<React.SetStateAction<boolean>>
  /** A1: jugador/hoyo esperando el segundo tap. */
  pendingScoreConfirm: PendingScoreConfirm | null
  /** +/- sobre un jugador en un hoyo (con anti-toque, edit window y save debounced). */
  handleScoreChange: (jugadorId: string, hole: number, delta: number) => void
  /** Guarda TODAS las tarjetas (respaldo local primero, 3 reintentos, estado visible). */
  saveAllScores: (overrideScores?: Record<string, Record<number, number>>) => Promise<void>
}

/**
 * Entrada y guardado de golpes del scorer de GRUPO (un anotador, varias
 * tarjetas):
 *   - A1 anti-toque: cambiar un score ya existente pide 2 taps (2s).
 *   - A3 edit window: tras confirmar, 3s de ediciones libres sobre el mismo
 *     jugador/hoyo (correcciones iterativas 9→4 sin re-confirmar).
 *   - A2 save debounced: un save por jugador 500ms después del último tap,
 *     con 3 reintentos y toast si falla (el respaldo local ya está).
 * Todo guardado va por la capa de datos (merge server-side vía RPC — audit
 * 2026-05-17 P0 #1 — y aviso a quienes siguen la ronda).
 */
export function useGrupoScoreSave(input: {
  ronda: RondaLibre | null
  codigo: string
  currentHole: number
  scores: Record<string, Record<number, number>>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  parMap: Record<number, number>
}): GrupoScoreSave {
  const { ronda, codigo, currentHole, scores, setScores, parMap } = input

  const [saveStatus, setSaveStatus] = useState<GrupoSaveStatus>('idle')
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [pendingScoreConfirm, setPendingScoreConfirm] = useState<PendingScoreConfirm | null>(null)
  const pendingScoreConfirmRef = useRef<PendingScoreConfirm | null>(null)
  const pendingConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editWindowRef = useRef<PendingScoreConfirm | null>(null)
  const editWindowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Cleanup de timers al desmontar (A1 pending + A2 save debounce + A3 edit window) ── */
  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
      if (pendingConfirmTimeoutRef.current) clearTimeout(pendingConfirmTimeoutRef.current)
      if (editWindowTimeoutRef.current) clearTimeout(editWindowTimeoutRef.current)
    }
  }, [])

  /* ── Al cambiar de hoyo: limpiar pending score confirm + edit window ── */
  useEffect(() => {
    setPendingScoreConfirm(null)
    pendingScoreConfirmRef.current = null
    if (pendingConfirmTimeoutRef.current) { clearTimeout(pendingConfirmTimeoutRef.current); pendingConfirmTimeoutRef.current = null }
    editWindowRef.current = null
    if (editWindowTimeoutRef.current) { clearTimeout(editWindowTimeoutRef.current); editWindowTimeoutRef.current = null }
  }, [currentHole])

  /* ── Save all players ── */
  const saveAllScores = useCallback(async (overrideScores?: Record<string, Record<number, number>>) => {
    if (!ronda) return
    const toSave = overrideScores ?? scores
    // Backup local SIEMPRE primero — sobrevive offline y reload
    saveGroupScores(codigo, toSave)

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSaveStatus('error')
      return
    }

    setSaveStatus('saving')
    const supabase = createClient()
    let allOk = false
    let attempts = 0
    while (!allOk && attempts < SAVE_RETRIES) {
      const results = await Promise.all(ronda.ronda_libre_jugadores.map(j =>
        saveRondaLibreScores(supabase, { codigo, jugadorId: j.id, delta: toSave[j.id] ?? {} }),
      ))
      allOk = !results.some(r => r.error)
      attempts++
      if (!allOk && attempts < SAVE_RETRIES) await new Promise(r => setTimeout(r, 400 * attempts))
    }

    if (allOk) {
      setSaveStatus('saved')
      setHasUnsaved(false)
      haptic(20)
      setTimeout(() => setSaveStatus('idle'), 1500)
    } else {
      setSaveStatus('error')
      addToast({
        type: 'error',
        title: 'No se pudieron guardar los scores',
        message: 'Quedaron respaldados localmente. Se reintentará al recuperar la conexión.',
        duration: 6000,
      })
    }
  }, [ronda, scores, codigo])

  /* ── A2: debounced single-player save a DB con 3 retries ── */
  const saveSinglePlayer = useCallback(async (jugadorId: string, playerScores: Record<number, number>) => {
    setSaveStatus('saving')
    const supabase = createClient()
    let ok = false
    let attempts = 0
    while (!ok && attempts < SAVE_RETRIES) {
      const { error } = await saveRondaLibreScores(supabase, { codigo, jugadorId, delta: playerScores })
      if (!error) ok = true
      else {
        attempts++
        if (attempts < SAVE_RETRIES) await new Promise(r => setTimeout(r, 400 * attempts))
      }
    }
    if (ok) {
      setSaveStatus('saved')
      setHasUnsaved(false)
      setTimeout(() => setSaveStatus('idle'), 1200)
    } else {
      setSaveStatus('error')
      addToast({
        type: 'error',
        title: 'No se pudo guardar el score',
        message: 'Está guardado localmente — se reintentará al volver la conexión.',
        duration: 5000,
      })
    }
  }, [codigo])

  /* ── Score change ── */
  const handleScoreChange = useCallback((jugadorId: string, hole: number, delta: number) => {
    setScores(prev => {
      const existingScore = prev[jugadorId]?.[hole]
      const hasExisting = existingScore != null && existingScore > 0

      // A3 edit window: si acabamos de confirmar un cambio en este mismo
      // jugador/hoyo y estamos dentro de los 3s, saltamos la confirmación.
      const editWin = editWindowRef.current
      const inEditWindow = editWin?.jugadorId === jugadorId && editWin?.hole === hole

      // A1 anti-toque: si ya hay un score y NO estamos en edit window, exigir 2º tap.
      if (hasExisting && !inEditWindow) {
        const ref = pendingScoreConfirmRef.current
        const isConfirmed = ref?.jugadorId === jugadorId && ref?.hole === hole
        if (!isConfirmed) {
          // 1er tap → mostrar confirmación, NO cambiar nada
          const pending = { jugadorId, hole }
          setPendingScoreConfirm(pending)
          pendingScoreConfirmRef.current = pending
          haptic([15, 40, 15])
          if (pendingConfirmTimeoutRef.current) clearTimeout(pendingConfirmTimeoutRef.current)
          pendingConfirmTimeoutRef.current = setTimeout(() => {
            setPendingScoreConfirm(null)
            pendingScoreConfirmRef.current = null
          }, PENDING_CONFIRM_MS)
          return prev
        }
        // 2º tap → limpiar pending y proceder
        setPendingScoreConfirm(null)
        pendingScoreConfirmRef.current = null
        if (pendingConfirmTimeoutRef.current) {
          clearTimeout(pendingConfirmTimeoutRef.current)
          pendingConfirmTimeoutRef.current = null
        }
      }

      // A3: abrir/renovar edit window de 3s tras cada cambio commiteado.
      editWindowRef.current = { jugadorId, hole }
      if (editWindowTimeoutRef.current) clearTimeout(editWindowTimeoutRef.current)
      editWindowTimeoutRef.current = setTimeout(() => {
        editWindowRef.current = null
      }, EDIT_WINDOW_MS)

      // Aplicar el cambio
      const par = parMap[hole] ?? 4
      const base = existingScore ?? par
      const newScore = limitarGolpes(base + delta)
      const next = { ...prev, [jugadorId]: { ...(prev[jugadorId] ?? {}), [hole]: newScore } }
      setHasUnsaved(true)
      saveGroupScores(codigo, next)
      haptic(10)

      // A2: agendar save debounced (500ms) — rebatable por taps sucesivos
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
      const scoresSnapshot = next[jugadorId]
      saveDebounceRef.current = setTimeout(() => {
        saveSinglePlayer(jugadorId, scoresSnapshot)
      }, SAVE_DEBOUNCE_MS)

      return next
    })
  }, [parMap, codigo, saveSinglePlayer, setScores])

  return { saveStatus, setSaveStatus, hasUnsaved, setHasUnsaved, pendingScoreConfirm, handleScoreChange, saveAllScores }
}
