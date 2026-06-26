'use client'

import { useEffect, useState } from 'react'
import type { ActivePlanSummary } from '@/golf/coach/intro'

interface UseTaigerIntroResult {
  opener: string | null
  /** setter expuesto para limpiar el opener al materializarlo en el primer turno. */
  setOpener: React.Dispatch<React.SetStateAction<string | null>>
  openerLoading: boolean
  /** Chips de arranque (preguntas sugeridas). Solo se muestran en el estado vacío. */
  chips: string[]
  /** Plan activo del jugador (D3) para surfacing en el estado vacío. null si no hay. */
  activePlan: ActivePlanSummary | null
}

/**
 * Opener proactivo: cuando la sesión está vacía, trae un saludo personalizado
 * desde /api/taiger/intro. No persiste en BD — si el usuario responde, se
 * materializa como primer turno dentro de handleSend (ver useTaigerChat).
 *
 * Comportamiento idéntico al useEffect original (page.tsx:90-100): fallback
 * silencioso si falla; no se dispara si ya hay mensajes o ya se cargó.
 */
export function useTaigerIntro(loadingSession: boolean, messagesLength: number): UseTaigerIntroResult {
  const [opener, setOpener] = useState<string | null>(null)
  const [openerLoading, setOpenerLoading] = useState(false)
  const [chips, setChips] = useState<string[]>([])
  const [activePlan, setActivePlan] = useState<ActivePlanSummary | null>(null)

  useEffect(() => {
    if (loadingSession) return
    if (messagesLength > 0) return
    if (opener || openerLoading) return
    setOpenerLoading(true)
    fetch('/api/taiger/intro', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.opener) setOpener(d.opener)
        if (Array.isArray(d?.chips)) setChips(d.chips.filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0))
        if (d?.active_plan && typeof d.active_plan === 'object') setActivePlan(d.active_plan as ActivePlanSummary)
      })
      .catch(() => { /* fallback silencioso: queda el espacio vacio */ })
      .finally(() => setOpenerLoading(false))
  }, [loadingSession, messagesLength, opener, openerLoading])

  return { opener, setOpener, openerLoading, chips, activePlan }
}
