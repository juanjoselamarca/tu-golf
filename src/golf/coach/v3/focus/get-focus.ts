import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedWeights } from '@/lib/cerebro/weights-cache'
import { loadFocusRounds, loadFocusTarget } from '@/lib/data/focus'
import type { RoundData } from '@/golf/coach/metrics'
import type { CerebroWeight } from '@/lib/cerebro/weights'
import { selectFocus } from './select-focus'
import type { FocusResult, FocusTarget } from './types'

/** Puertos de datos del motor de foco. Inyectables para test headless. */
export interface GetFocusDeps {
  loadRounds: (userId: string) => Promise<RoundData[]>
  loadTarget: (userId: string) => Promise<FocusTarget>
  /** Lee cerebro_weights en runtime (cache TTL + Realtime). Paramétrico vivo. */
  loadWeights: () => Promise<CerebroWeight[]>
}

/** Deps reales sobre el cliente autenticado del request + cache de pesos. */
export function defaultFocusDeps(supabase: SupabaseClient): GetFocusDeps {
  return {
    loadRounds: (userId) => loadFocusRounds(supabase, userId),
    loadTarget: (userId) => loadFocusTarget(supabase, userId),
    loadWeights: () => getCachedWeights(),
  }
}

/**
 * Punto de entrada estable del motor de foco. Compone historial + target + pesos
 * vivos y delega la decisión en `selectFocus` (puro). Ola 3 podrá cambiar la
 * fuente de patrones sin tocar este contrato.
 */
export async function getFocus(userId: string, deps: GetFocusDeps): Promise<FocusResult> {
  const [rounds, target, weights] = await Promise.all([
    deps.loadRounds(userId),
    deps.loadTarget(userId),
    deps.loadWeights(),
  ])
  return selectFocus({ rounds, weights, target })
}
