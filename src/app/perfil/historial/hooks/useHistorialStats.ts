/**
 * Hook que fetcha stats agregadas desde /api/historial/stats.
 * Es non-blocking — si falla, el componente cae al cálculo local.
 */
'use client'

import { useEffect, useState } from 'react'
import type { HistorialStats } from '../lib/types'

export function useHistorialStats(enabled: boolean): HistorialStats | null {
  const [apiStats, setApiStats] = useState<HistorialStats | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetch('/api/historial/stats')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && !cancelled) setApiStats(data as HistorialStats) })
      .catch(() => { /* non-blocking */ })
    return () => { cancelled = true }
  }, [enabled])

  return apiStats
}
