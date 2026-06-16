import type { RoundData } from '@/golf/coach/metrics'
import type { CerebroWeight } from '@/lib/cerebro/weights'
import type { FocusCandidate } from './catalog'
import type { PatternVerdict } from '../pattern-validator'

/** Meta del jugador + handicap actual, ya resueltos por el orquestador. */
export interface FocusTarget {
  currentHandicap: number | null
  targetHandicap: number | null
  targetDeadline: string | null
}

export interface SelectFocusInput {
  rounds: RoundData[]
  /** Pesos vivos (parameter_type='pattern') leídos de cerebro_weights en runtime. */
  weights: CerebroWeight[]
  target: FocusTarget | null
  /** Catálogo de candidatos. Por defecto el de código; Ola 3 lo carga de DB. */
  catalog?: FocusCandidate[]
  /** Veredicto del validador anti-fantasía por patrón (Ola 3 chunk 2). */
  validation?: Record<string, PatternVerdict>
  /**
   * Priors externos por metricKey (capa A, Ola 1b), pre-cargados por el
   * orquestador para el bucket de hándicap del jugador. Si está presente, el
   * valor reportado de cada métrica se ajusta por shrinkage (cold-start).
   * Ausente ⇒ comportamiento idéntico a pre-1b.
   */
  priors?: Record<string, import('../priors/readers').InternalPrior>
}

/** El foco elegido: la palanca de mayor impacto hacia la meta, con evidencia. */
export interface Focus {
  kind: 'focus'
  patternId: string
  /** PLAN_METRIC asociado — continuidad con el motor de planes v2. */
  metricKey: string
  label: string
  accion: string
  /** confianza × peso (× nada más): ganancia esperada de handicap al enfocarse acá. */
  impacto: number
  /** Confianza del detect() de patterns.ts (severidad ya calibrada, 0..1). */
  confianza: number
  /** Peso vivo del patrón usado en el rankeo (cerebro_weights). */
  peso: number
  /** Baseline en escala PLAN_METRIC, computado con las funciones de golf/coach/metrics. */
  metrica: { key: string; valor: number; muestra: number }
  /** Metadata del detect() — los números que justifican el foco. */
  evidencia: Record<string, unknown>
  /** Evidencia estadística del validador (Ola 3 chunk 2), o null si no se evaluó. */
  validacion?: { n: number; effectSize: number | null; r2: number | null; meanDeltaStrokes: number | null } | null
  deltaVsTarget: number | null
}

/** No hay foco confiable: nunca se inventa. Se devuelve identidad honesta. */
export interface FocusFallback {
  kind: 'fallback'
  reason: 'cold_start' | 'no_pattern_passed_gate'
  handicap: number | null
  deltaVsTarget: number | null
}

export type FocusResult = Focus | FocusFallback
