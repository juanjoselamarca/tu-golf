'use client'

import { useEffect, useRef } from 'react'
import { pedirTarjetaVigente } from '@/lib/data/tournaments/tarjeta-vigente'

export const INTERVALO_SONDEO_ROSTER_MS = 30_000

/**
 * ¿El organizador ya abrió una ronda posterior a `rondaActual`? Se ve en el roster: algún jugador tiene
 * tarjeta de una ronda mayor. Mientras no, el jugador está ENTRE RONDAS y pedir la tarjeta no sirve.
 */
export function rondaSiguienteYaAbierta(
  roster: ReadonlyArray<{ rounds?: ReadonlyArray<{ round_number?: number | null }> | null }>,
  rondaActual: number,
): boolean {
  return roster.some((p) => p.rounds?.some((r) => (r.round_number ?? 1) > rondaActual) ?? false)
}

/**
 * Sondeo del roster del scorer del torneo cada 30 s, solo con la pestaña visible y sin solaparse.
 *
 * - `activo`: hay algo que esperar (tarjeta cerrada con una ronda siguiente por abrir, o jugador sin
 *   tarjeta) y el torneo sigue recibiendo golpes.
 * - `pedirTarjeta`: además de releer, pide al servidor la tarjeta de la ronda vigente ANTES de releer.
 *   Es para el jugador con la ronda anterior cerrada al que `startNextRound` no le abrió la siguiente
 *   (alta en carrera con la apertura): sin esto quedaba mirando su ronda cerrada, sin botón. La ruta es
 *   idempotente. Quien llama la pasa SOLO cuando el roster ya muestra la ronda siguiente abierta (para
 *   otro jugador): entre rondas pedirla sería un POST con lock del torneo por jugador cada 30 s, todos 409.
 *   Tras un 401/403 deja de pedirla para ese jugador (repetir no cambia nada): solo relee.
 */
export function useSondeoRoster(args: {
  activo: boolean
  pedirTarjeta: { slug: string; playerId: string; guestId: string | null; guestToken: string | null } | null
  reloadRoster: () => Promise<boolean>
}) {
  const ultimo = useRef(args)
  useEffect(() => { ultimo.current = args })
  const enCurso = useRef(false)
  /** Jugador para el que la ruta ya respondió 401/403: no se le vuelve a pedir. */
  const sinPedirPara = useRef<string | null>(null)

  useEffect(() => {
    if (!args.activo) return
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (enCurso.current) return
      enCurso.current = true
      void (async () => {
        try {
          const { pedirTarjeta, reloadRoster } = ultimo.current
          if (pedirTarjeta && sinPedirPara.current !== pedirTarjeta.playerId) {
            const r = await pedirTarjetaVigente(pedirTarjeta)
            if (r === 'sin_sesion' || r === 'sin_permiso') sinPedirPara.current = pedirTarjeta.playerId
          }
          await reloadRoster()
        } finally {
          enCurso.current = false
        }
      })()
    }, INTERVALO_SONDEO_ROSTER_MS)
    return () => clearInterval(id)
  }, [args.activo])
}
