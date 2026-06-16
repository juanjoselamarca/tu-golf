import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedWeights } from '@/lib/cerebro/weights-cache'
import { loadFocusRounds, loadFocusTarget } from '@/lib/data/focus'
import type { RoundData } from '@/golf/coach/metrics'
import type { CerebroWeight } from '@/lib/cerebro/weights'
import { selectFocus } from './select-focus'
import { loadFocusCatalog } from './catalog-db'
import type { FocusCandidate } from './catalog'
import { handicapToBucket } from '../priors/buckets'
import { getInternalPrior, type InternalPrior } from '../priors/readers'
import type { FocusResult, FocusTarget } from './types'
import { loadObservationPairs } from '@/lib/data/pattern-observations'
import { validatePattern, type PatternVerdict } from '../pattern-validator'

/** Puertos de datos del motor de foco. Inyectables para test headless. */
export interface GetFocusDeps {
  loadRounds: (userId: string) => Promise<RoundData[]>
  loadTarget: (userId: string) => Promise<FocusTarget>
  /** Lee cerebro_weights en runtime (cache TTL + Realtime). Paramétrico vivo. */
  loadWeights: () => Promise<CerebroWeight[]>
  /** Catálogo de patrones desde pattern_definitions (Ola 3); fallback a código. */
  loadCatalog: () => Promise<FocusCandidate[]>
  /** Veredicto del validador anti-fantasía por patrón (Ola 3 chunk 2). */
  loadValidation: (userId: string) => Promise<Record<string, PatternVerdict>>
  /**
   * Priors externos (capa A, Ola 1b) para el bucket del jugador. handicapIndex
   * null ⇒ bucket por defecto conservador. Sólo devuelve los metricKeys con
   * benchmark mapeado en METRIC_PRIOR_MAP.
   */
  loadPriors?: (
    handicapIndex: number | null,
    metricKeys: string[],
  ) => Promise<Record<string, InternalPrior>>
}

/** Deps reales sobre el cliente autenticado del request + cache de pesos. */
export function defaultFocusDeps(supabase: SupabaseClient): GetFocusDeps {
  return {
    loadRounds: (userId) => loadFocusRounds(supabase, userId),
    loadTarget: (userId) => loadFocusTarget(supabase, userId),
    loadWeights: () => getCachedWeights(),
    loadCatalog: () => loadFocusCatalog(supabase),
    loadValidation: (userId) => loadValidationFor(supabase, userId),
    loadPriors: (handicapIndex, metricKeys) => loadPriorsFor(supabase, handicapIndex, metricKeys),
  }
}

/** Bucket por defecto cuando no conocemos el índice (conservador, medio-alto). */
const DEFAULT_BUCKET = '20-28' as const

/**
 * Carga los priors externos (capa A) para el bucket del jugador. Degradación
 * conservadora (CERO FALLOS): si algo falla, devuelve {} y el motor opera sin
 * shrinkage (idéntico a pre-1b). Sólo consulta los metricKeys con mapeo.
 */
async function loadPriorsFor(
  supabase: SupabaseClient,
  handicapIndex: number | null,
  metricKeys: string[],
): Promise<Record<string, InternalPrior>> {
  try {
    const bucket = handicapIndex != null ? handicapToBucket(handicapIndex) : DEFAULT_BUCKET
    const out: Record<string, InternalPrior> = {}
    for (const key of metricKeys) {
      const prior = await getInternalPrior(supabase, bucket, key)
      if (prior) out[key] = prior
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Punto de entrada estable del motor de foco. Compone historial + target + pesos
 * vivos y delega la decisión en `selectFocus` (puro). Ola 3 podrá cambiar la
 * fuente de patrones sin tocar este contrato.
 */
/**
 * Corre el validador anti-fantasía por patrón sobre las observaciones del
 * usuario. Degradación conservadora (CERO FALLOS): si la carga falla, devuelve
 * {} — por las reglas del gate, {} deja a los patrones seed en su comportamiento
 * Ola 2 (gate de detect) y excluye a los no-seed. Nunca rompe el chat.
 */
async function loadValidationFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, PatternVerdict>> {
  try {
    const pairs = await loadObservationPairs(supabase, userId)
    const out: Record<string, PatternVerdict> = {}
    for (const [key, ps] of Object.entries(pairs)) out[key] = validatePattern(ps)
    return out
  } catch {
    return {}
  }
}
export async function getFocus(userId: string, deps: GetFocusDeps): Promise<FocusResult> {
  const [rounds, target, weights, catalog, validation] = await Promise.all([
    deps.loadRounds(userId),
    deps.loadTarget(userId),
    deps.loadWeights(),
    deps.loadCatalog(),
    deps.loadValidation(userId),
  ])
  // Cascada de bucket (cold-start): índice WHS → meta de onboarding → default.
  const hcpIndex = target?.currentHandicap ?? target?.targetHandicap ?? null
  const priors = deps.loadPriors
    ? await deps.loadPriors(hcpIndex, catalog.map((c) => c.metricKey))
    : undefined
  return selectFocus({ rounds, weights, target, catalog, validation, priors })
}
