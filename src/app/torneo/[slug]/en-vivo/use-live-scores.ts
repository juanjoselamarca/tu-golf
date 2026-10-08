'use client'

// src/app/torneo/[slug]/en-vivo/use-live-scores.ts
// Polling del leaderboard live de torneos — único mecanismo de actualización
// desde que se sacó Supabase Realtime (incidente torneo Los Leones 04-oct-2026).
// refresh() ejecuta router.refresh(), que re-corre el server component sin perder
// el estado del cliente (tabs, filtros, scroll). `useLivePoll` no consulta en
// segundo plano, consulta al volver a primer plano y nunca solapa.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLivePoll } from '@/hooks/ronda/useLivePoll'

/** Cada cuánto se refresca el leaderboard de un torneo en vivo. */
export const INTERVALO_TORNEO_S = 30

export function useLiveRefresh(enabled: boolean) {
  const router = useRouter()
  const [lastUpdate, setLastUpdate] = useState(() => Date.now())
  /** Reloj de la vista (tick 1 s) para el countdown. */
  const [ahora, setAhora] = useState(0)

  const poll = useCallback(() => {
    router.refresh()
    setLastUpdate(Date.now())
  }, [router])

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

  return { lastUpdate, refresh, countdown }
}
