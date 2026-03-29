'use client'
import { useCallback, useEffect, useRef } from 'react'

const STORAGE_PREFIX = 'golfers_score_'
const DIAS_PARA_LIMPIAR = 7

interface ScoreEntry {
  scores: Record<number, number>
  timestamp: number
  sincronizado: boolean
  codigoRonda: string
  jugadorId: string
}

/**
 * Hook para persistir scores en localStorage como respaldo offline.
 * - Guarda cada cambio de score localmente ANTES de enviar al servidor
 * - Si el servidor falla, el score NO se pierde
 * - Al reconectar, sincroniza automáticamente los scores pendientes
 * - Limpia entradas sincronizadas después de 7 días
 */
export function useScoreSync(codigoRonda: string, jugadorId: string | null) {
  const key = jugadorId ? `${STORAGE_PREFIX}${codigoRonda}_${jugadorId}` : ''
  const syncInProgressRef = useRef(false)

  const guardarLocal = useCallback((scores: Record<number, number>) => {
    if (!key) return
    try {
      localStorage.setItem(key, JSON.stringify({
        scores,
        timestamp: Date.now(),
        sincronizado: false,
        codigoRonda,
        jugadorId: jugadorId!,
      } satisfies ScoreEntry))
    } catch {
      // Falla silenciosamente en modo privado de Safari
    }
  }, [key, codigoRonda, jugadorId])

  const marcarSincronizado = useCallback(() => {
    if (!key) return
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const data: ScoreEntry = JSON.parse(raw)
      data.sincronizado = true
      localStorage.setItem(key, JSON.stringify(data))
    } catch { /* silencioso */ }
  }, [key])

  const obtenerLocal = useCallback((): Record<number, number> | null => {
    if (!key) return null
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const data: ScoreEntry = JSON.parse(raw)
      return data.scores
    } catch { return null }
  }, [key])

  const tienePendientes = useCallback((): boolean => {
    if (!key) return false
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return false
      const data: ScoreEntry = JSON.parse(raw)
      return !data.sincronizado && Object.keys(data.scores).length > 0
    } catch { return false }
  }, [key])

  const obtenerTimestamp = useCallback((): number => {
    if (!key) return 0
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return 0
      const data: ScoreEntry = JSON.parse(raw)
      return data.timestamp
    } catch { return 0 }
  }, [key])

  // Limpiar entradas antiguas ya sincronizadas (todas las del prefix)
  useEffect(() => {
    try {
      const ahora = Date.now()
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k || !k.startsWith(STORAGE_PREFIX)) continue
        const raw = localStorage.getItem(k)
        if (!raw) continue
        const data: ScoreEntry = JSON.parse(raw)
        const diasTranscurridos = (ahora - data.timestamp) / (1000 * 60 * 60 * 24)
        if (data.sincronizado && diasTranscurridos > DIAS_PARA_LIMPIAR) {
          localStorage.removeItem(k)
        }
      }
    } catch { /* silencioso */ }
  }, [])

  return {
    guardarLocal,
    marcarSincronizado,
    obtenerLocal,
    tienePendientes,
    obtenerTimestamp,
    syncInProgressRef,
  }
}
