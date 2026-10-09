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
import { loadTorneoEnVivo, loadTorneoNeto } from '@/lib/data/tournaments/en-vivo-api'
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

/**
 * @param neto torneo neto: el neto sólo lo ve un visor con sesión (decisión de
 *             Juanjo 08-oct), así que se consulta la ruta privada `/neto` (armado
 *             compartido en el servidor) y no la pública, que en neto trae sólo gross.
 */
export function useTorneoEnVivo(slug: string, inicial: TorneoEnVivo, enabled: boolean, neto = false) {
  const [data, setData] = useState<TorneoEnVivo>(inicial)
  const [lastUpdate, setLastUpdate] = useState(() => Date.now())
  /** Reloj de la vista (tick 1 s) para el countdown. */
  const [ahora, setAhora] = useState(0)
  const nombresRef = useRef(new Map(inicial.players.map((p) => [p.id, p.name])))
  /** Torneo neto con la sesión vencida/cerrada: se deja de actualizar (sin caer a /live, que es sólo gross). */
  const [sinSesion, setSinSesion] = useState(false)
  /**
   * La tabla de equipos no se pudo armar en el servidor (`equiposNoDisponibles`):
   * `desde` = hora (ms) de la última tabla buena que se sigue mostrando; null si
   * nunca hubo una. undefined = equipos al día.
   */
  const [equiposFallaDesde, setEquiposFallaDesde] = useState<number | null | undefined>(
    inicial.equiposNoDisponibles ? null : undefined,
  )
  const ultimaTablaBuenaRef = useRef<{ teams: TorneoEnVivo['teams']; en: number } | null>(
    !inicial.equiposNoDisponibles && inicial.teams.length > 0 ? { teams: inicial.teams, en: Date.now() } : null,
  )

  const poll = useCallback(async () => {
    const res = neto ? await loadTorneoNeto(slug) : await loadTorneoEnVivo(slug)
    if (res.status === 'sin-sesion') setSinSesion(true)
    // not_found / sin-sesion / transient / error: se conserva el board que ya se mostraba.
    if (res.status !== 'ok') return
    setSinSesion(false)
    const t = Date.now()
    const armadoEn = t - res.edadSegundos * 1000
    if (res.data.equiposNoDisponibles) {
      // Respuesta degradada: NO se borra la tabla que ya se mostraba ni se da por
      // "actualizado"; se avisa desde cuándo es la tabla que se ve.
      const previa = ultimaTablaBuenaRef.current
      setData(conservarNombres({ ...res.data, teams: previa?.teams ?? [] }, nombresRef.current))
      setEquiposFallaDesde(previa ? previa.en : null)
      setAhora(t)
      return
    }
    if (res.data.teams.length > 0) ultimaTablaBuenaRef.current = { teams: res.data.teams, en: armadoEn }
    setEquiposFallaDesde(undefined)
    setData(conservarNombres(res.data, nombresRef.current))
    // "Actualizado" = cuándo se armó el dato (descuenta lo que estuvo en el CDN).
    setLastUpdate(armadoEn)
    setAhora(t)
  }, [slug, neto])

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

  return { data, lastUpdate, refresh, countdown, sinSesion, equiposFallaDesde }
}
