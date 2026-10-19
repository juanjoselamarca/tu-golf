'use client'
import { useEntitlement } from '@/hooks/useEntitlement'
import type { NetoFeature } from '@/golf/billing/plans'

export interface AccesoNeto {
  /** El plan todavía no se resolvió (o no se pudo leer: sin señal). */
  loading: boolean
  /** ¿Tiene la feature de neto? Mientras carga responde `false`. */
  puedeUsar: (feature: NetoFeature) => boolean
}

/**
 * Qué modos neto deja jugar el plan del usuario. Se combina con
 * `modoPermitidoPorPlan` (`@/golf/billing/modo-por-plan`), que es la regla.
 */
export function useAccesoNeto(): AccesoNeto {
  const match = useEntitlement('match-play-neto')
  const bestBall = useEntitlement('best-ball-neto')
  const stableford = useEntitlement('stableford-neto')
  const porFeature: Record<NetoFeature, boolean> = {
    'match-play-neto': match.allowed,
    'best-ball-neto': bestBall.allowed,
    'stableford-neto': stableford.allowed,
  }
  return {
    loading: match.loading || bestBall.loading || stableford.loading,
    puedeUsar: feature => porFeature[feature] === true,
  }
}
