'use client'

import { useEffect, useRef, useState } from 'react'
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
 *   Deja de pedirla para ese jugador (solo relee) cuando repetir no cambia nada: 401, 403 o un 409 definitivo
 *   (retirado/descalificado, torneo cerrado). Con `round_not_in_play` sigue pidiendo: la ronda se abre.
 *
 * Devuelve `sinSesionDe`: el jugador para el que la ruta respondió 401. La pantalla lo usa para ofrecer
 * "Iniciar sesión" en el aviso de ronda cerrada (si no, el jugador quedaba esperando una ronda que nunca
 * le iba a aparecer).
 */
export function useSondeoRoster(args: {
  activo: boolean
  pedirTarjeta: { slug: string; playerId: string; guestId: string | null; guestToken: string | null } | null
  reloadRoster: () => Promise<boolean>
}) {
  const ultimo = useRef(args)
  useEffect(() => { ultimo.current = args })
  const enCurso = useRef(false)
  /** Jugador para el que repetir no cambia nada (401, 403, 409 definitivo): no se le vuelve a pedir. */
  const sinPedirPara = useRef<string | null>(null)
  const [sinSesionDe, setSinSesionDe] = useState<string | null>(null)

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
            if (r === 'sin_sesion' || r === 'sin_permiso' || r === 'rechazo_definitivo') sinPedirPara.current = pedirTarjeta.playerId
            if (r === 'sin_sesion') setSinSesionDe(pedirTarjeta.playerId)
          }
          await reloadRoster()
        } finally {
          enCurso.current = false
        }
      })()
    }, INTERVALO_SONDEO_ROSTER_MS)
    return () => clearInterval(id)
  }, [args.activo])

  return { sinSesionDe }
}
