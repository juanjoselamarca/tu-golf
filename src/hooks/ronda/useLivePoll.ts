'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface LivePollOptions {
  /** Cada cuánto se consulta, en ms, contado desde que TERMINA la consulta anterior. */
  intervalMs: number
  /** false = no consulta (ni al volver a primer plano). */
  enabled?: boolean
  /** true (default) = consulta apenas se habilita, sin esperar el primer intervalo. */
  immediate?: boolean
}

export interface LivePoll {
  /** Consulta ya (botón "Actualizar"). Si hay una consulta en curso, espera esa: nunca dos a la vez. */
  pollNow: () => Promise<void>
  /** Hora (ms epoch) de la próxima consulta programada; null si no hay (deshabilitado, en segundo plano o al arrancar). */
  nextPollAt: number | null
}

/**
 * Polling para las vistas en vivo — el reemplazo de Supabase Realtime (incidente
 * torneo Los Leones 04-oct-2026). Pensado para consultar rutas cacheables en el
 * CDN: M espectadores ≈ 1 consulta a la base por intervalo.
 *
 * - Nunca solapa consultas: la siguiente se programa cuando termina la anterior,
 *   y `pollNow` durante una consulta en curso espera esa misma.
 * - En segundo plano (`document.hidden`: pantalla apagada, otra app) no consulta;
 *   al volver a primer plano consulta enseguida y retoma el intervalo.
 * - Un error de `poll` no corta el ciclo (el manejo del error es de quien llama).
 * - Al desmontar o deshabilitar, no queda ningún timer vivo.
 *
 * `poll` no necesita ser estable (ref interna): cambiar su identidad no reinicia el ciclo.
 */
export function useLivePoll(poll: () => unknown, { intervalMs, enabled = true, immediate = true }: LivePollOptions): LivePoll {
  const pollRef = useRef(poll)
  useEffect(() => { pollRef.current = poll })
  const enCursoRef = useRef<Promise<void> | null>(null)
  const [nextPollAt, setNextPollAt] = useState<number | null>(null)

  const runOnce = useCallback((): Promise<void> => {
    if (enCursoRef.current) return enCursoRef.current
    const p = (async () => {
      try {
        await pollRef.current()
      } catch {
        // El llamador decide qué hacer con sus errores; el ciclo sigue.
      } finally {
        enCursoRef.current = null
      }
    })()
    enCursoRef.current = p
    return p
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelado = false
    let timer: ReturnType<typeof setTimeout> | null = null
    // Declarada antes que `programar` (se llaman entre sí: consulta → programa la siguiente).
    let tick: () => Promise<void> = async () => {}
    const limpiar = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }
    const programar = () => {
      limpiar()
      if (cancelado) return
      if (document.visibilityState === 'hidden') {
        setNextPollAt(null)
        return
      }
      setNextPollAt(Date.now() + intervalMs)
      timer = setTimeout(tick, intervalMs)
    }
    tick = async () => {
      timer = null
      if (cancelado || document.visibilityState === 'hidden') return
      await runOnce()
      programar()
    }
    const alCambiarVisibilidad = () => {
      if (cancelado) return
      limpiar()
      if (document.visibilityState === 'hidden') {
        setNextPollAt(null)
      } else {
        void tick()
      }
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    // Arranque diferido (macrotarea): sin setState síncrono dentro del efecto.
    timer = setTimeout(tick, immediate ? 0 : intervalMs)
    return () => {
      cancelado = true
      limpiar()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [enabled, intervalMs, immediate, runOnce])

  return { pollNow: runOnce, nextPollAt: enabled ? nextPollAt : null }
}
