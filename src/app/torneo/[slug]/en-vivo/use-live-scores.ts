'use client'

// src/app/torneo/[slug]/en-vivo/use-live-scores.ts
// Polling de fallback para el leaderboard live de torneos.
// El Realtime vive en useTorneoRealtime (Broadcast channel).
// Cuando realtimeConnected=true, el polling se desactiva.
// refresh() ejecuta router.refresh() que re-corre el server component
// sin perder client state (tabs, filtros, scroll).

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const POLL_INTERVAL_MS = 30_000

export function useLiveRefresh(realtimeConnected: boolean) {
  const router = useRouter()
  const [lastUpdate, setLastUpdate] = useState(Date.now())

  const refresh = useCallback(() => {
    router.refresh()
    setLastUpdate(Date.now())
  }, [router])

  // Polling fallback: solo cuando realtime desconectado
  useEffect(() => {
    if (realtimeConnected) return
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [realtimeConnected, refresh])

  return { lastUpdate, refresh }
}
