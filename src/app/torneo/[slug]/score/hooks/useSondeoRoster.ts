'use client'

import { useEffect, useRef } from 'react'
import { pedirTarjetaVigente } from '@/lib/data/tournaments/tarjeta-vigente'

export const INTERVALO_SONDEO_ROSTER_MS = 30_000

/**
 * Sondeo del roster del scorer del torneo cada 30 s, solo con la pestaña visible y sin solaparse.
 *
 * - `activo`: hay algo que esperar (tarjeta cerrada con una ronda siguiente por abrir, o jugador sin
 *   tarjeta) y el torneo sigue recibiendo golpes.
 * - `pedirTarjeta`: además de releer, pide al servidor la tarjeta de la ronda vigente ANTES de releer.
 *   Es para el jugador con la ronda anterior cerrada al que `startNextRound` no le abrió la siguiente
 *   (alta en carrera con la apertura): sin esto quedaba mirando su ronda cerrada, sin botón. La ruta es
 *   idempotente; entre rondas responde 409 y no crea nada.
 */
export function useSondeoRoster(args: {
  activo: boolean
  pedirTarjeta: { slug: string; playerId: string; guestId: string | null; guestToken: string | null } | null
  reloadRoster: () => Promise<boolean>
}) {
  const ultimo = useRef(args)
  useEffect(() => { ultimo.current = args })
  const enCurso = useRef(false)

  useEffect(() => {
    if (!args.activo) return
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (enCurso.current) return
      enCurso.current = true
      void (async () => {
        try {
          const { pedirTarjeta, reloadRoster } = ultimo.current
          if (pedirTarjeta) await pedirTarjetaVigente(pedirTarjeta)
          await reloadRoster()
        } finally {
          enCurso.current = false
        }
      })()
    }, INTERVALO_SONDEO_ROSTER_MS)
    return () => clearInterval(id)
  }, [args.activo])
}
