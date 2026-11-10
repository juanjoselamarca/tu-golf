'use client'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  barrerRespaldosViejos,
  claveDelRespaldo,
  leerRespaldoPendiente,
  marcarRespaldoSincronizado,
  type RespaldoLocal,
} from '@/lib/ronda/respaldo-local'

/**
 * Hook para persistir scores en localStorage como respaldo offline.
 * - Guarda cada cambio de score localmente ANTES de enviar al servidor
 * - Si el servidor falla, el score NO se pierde
 * - Al reconectar, sincroniza automáticamente los scores pendientes
 * - Barre los respaldos que ya no sirven (`barrerRespaldosViejos`)
 */
export function useScoreSync(codigoRonda: string, jugadorId: string | null) {
  const key = jugadorId ? claveDelRespaldo(codigoRonda, jugadorId) : ''
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
      } satisfies RespaldoLocal))
    } catch {
      // Falla silenciosamente en modo privado de Safari
    }
  }, [key, codigoRonda, jugadorId])

  /** Con `enviados`, marca sólo si el respaldo sigue siendo esa tarjeta: una más nueva queda pendiente. */
  const marcarSincronizado = useCallback((enviados?: Record<number, number>) => {
    if (jugadorId) marcarRespaldoSincronizado(codigoRonda, jugadorId, enviados)
  }, [codigoRonda, jugadorId])

  const obtenerLocal = useCallback((): Record<number, number> | null => {
    if (!key) return null
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const data: RespaldoLocal = JSON.parse(raw)
      return data.scores
    } catch { return null }
  }, [key])

  const tienePendientes = useCallback(
    (): boolean => !!jugadorId && leerRespaldoPendiente(codigoRonda, jugadorId) != null,
    [codigoRonda, jugadorId],
  )

  const obtenerTimestamp = useCallback((): number => {
    if (!key) return 0
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return 0
      const data: RespaldoLocal = JSON.parse(raw)
      return data.timestamp
    } catch { return 0 }
  }, [key])

  // Barre lo sincronizado hace más de 7 días y lo de rondas vistas cerradas hace más de 30.
  useEffect(() => { barrerRespaldosViejos() }, [])

  // Misma identidad entre renders: un efecto que depende de este objeto (el reenvío del respaldo) no corre en cada render.
  return useMemo(() => ({
    guardarLocal,
    marcarSincronizado,
    obtenerLocal,
    tienePendientes,
    obtenerTimestamp,
    syncInProgressRef,
  }), [guardarLocal, marcarSincronizado, obtenerLocal, tienePendientes, obtenerTimestamp])
}
