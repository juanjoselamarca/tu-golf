'use client'

// ─── Hook de GWI (probabilidad de ganar) para la vista live ─────────────────
// Extraído del componente monolítico [codigo]/page.tsx (job "Resultados v2").
// El cálculo de GWI vive en el endpoint /api/gwi/ronda-libre/[codigo]; este
// hook sólo trae los inputs y los expone. (El antiguo `_gwiResults` era dead
// code — se eliminó.)

import { useCallback, useEffect, useState } from 'react'
import { logError } from '@/lib/error-tracking'
import type { JugadorGWIInput } from '@/golf/stats/gwi'

export interface UseGWIResult {
  gwiInputs: JugadorGWIInput[]
  refetch: () => void
}

export function useGWI(codigo: string): UseGWIResult {
  const [gwiInputs, setGwiInputs] = useState<JugadorGWIInput[]>([])

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/gwi/ronda-libre/${codigo}`)
      if (!res.ok) return
      const json = await res.json()
      if (json.inputs) setGwiInputs(json.inputs)
    } catch (err) {
      logError(err, '[GWI fetch]')
    }
  }, [codigo])

  useEffect(() => { refetch() }, [refetch])

  return { gwiInputs, refetch }
}
