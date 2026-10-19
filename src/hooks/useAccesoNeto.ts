'use client'
import { useEntitlement } from '@/hooks/useEntitlement'
import type { NetoFeature } from '@/golf/billing/plans'

export interface AccesoNeto {
  /** El plan todavía no se resolvió. */
  loading: boolean
  /**
   * ¿Puede usar la feature de neto? Mientras carga responde `false` (el caller
   * no bloquea durante la carga). Si el plan NO se pudo leer (sin señal)
   * responde `true`: un Pro sin señal no puede quedar forzado a gross; decide
   * el servidor (503 si sigue sin poder leer, 403 si es free de verdad).
   */
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
    'match-play-neto': match.allowed || match.planDesconocido === true,
    'best-ball-neto': bestBall.allowed || bestBall.planDesconocido === true,
    'stableford-neto': stableford.allowed || stableford.planDesconocido === true,
  }
  return {
    loading: match.loading || bestBall.loading || stableford.loading,
    puedeUsar: feature => porFeature[feature] === true,
  }
}
