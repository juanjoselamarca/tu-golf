'use client'

// src/app/torneo/[slug]/en-vivo/use-live-scores.ts
// Polling del leaderboard live de torneos contra `/api/torneo/[slug]/live`, que el
// CDN de Vercel cachea → M espectadores ≈ 1 armado por torneo cada 10 s. Reemplaza
// a Supabase Realtime + router.refresh() (incidente torneo Los Leones 04-oct-2026):
// router.refresh() re-renderizaba la página por espectador (≥8 round-trips) y
// resolvía al instante, así que nada impedía solapes. Acá el fetch se ESPERA.
// `useLivePoll` no consulta en segundo plano, consulta al volver y nunca solapa.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLivePoll } from '@/hooks/ronda/useLivePoll'
import { loadTorneoEnVivo } from '@/lib/data/tournaments/en-vivo-api'
import type { TorneoEnVivo } from '@/lib/data/tournaments/en-vivo'

/** Cada cuánto se consulta el leaderboard de un torneo en vivo (el CDN cachea 10 s). */
export const INTERVALO_TORNEO_S = 15

/**
 * Los datos que llegan por la ruta pública no traen el nombre del PERFIL (no es
 * legible por anon); el render inicial sí (con la sesión de quien mira). Se
 * conserva ese nombre por id: un jugador no cambia de nombre durante la vuelta.
 */
export function conservarNombres(nuevo: TorneoEnVivo, nombres: ReadonlyMap<string, string>): TorneoEnVivo {
  return {
    ...nuevo,
    players: nuevo.players.map((p) => {
      const n = nombres.get(p.id)
      return n && n !== p.name ? { ...p, name: n } : p
    }),
  }
}

export function useTorneoEnVivo(slug: string, inicial: TorneoEnVivo, enabled: boolean) {
  const [data, setData] = useState<TorneoEnVivo>(inicial)
  const [lastUpdate, setLastUpdate] = useState(() => Date.now())
  /** Reloj de la vista (tick 1 s) para el countdown. */
  const [ahora, setAhora] = useState(0)
  const nombresRef = useRef(new Map(inicial.players.map((p) => [p.id, p.name])))

  const poll = useCallback(async () => {
    const res = await loadTorneoEnVivo(slug)
    // not_found / transient / error: se conserva el board que ya se mostraba.
    if (res.status !== 'ok') return
    const t = Date.now()
    setData(conservarNombres(res.data, nombresRef.current))
    // "Actualizado" = cuándo se armó el dato (descuenta lo que estuvo en el CDN).
    setLastUpdate(t - res.edadSegundos * 1000)
    setAhora(t)
  }, [slug])

  // immediate=false: la página recién llegó renderizada del servidor.
  const { pollNow, nextPollAt } = useLivePoll(poll, {
    intervalMs: INTERVALO_TORNEO_S * 1000,
    enabled,
    immediate: false,
  })

  useEffect(() => {
    if (!enabled) return
    const tick = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [enabled])

  const countdown = nextPollAt != null && ahora > 0
    ? Math.min(INTERVALO_TORNEO_S, Math.max(0, Math.ceil((nextPollAt - ahora) / 1000)))
    : INTERVALO_TORNEO_S

  const refresh = useCallback(() => { void pollNow() }, [pollNow])

  return { data, lastUpdate, refresh, countdown }
}
