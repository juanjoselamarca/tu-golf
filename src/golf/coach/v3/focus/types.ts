import type { RoundData } from '@/golf/coach/metrics'
import type { CerebroWeight } from '@/lib/cerebro/weights'
import type { FocusCandidate } from './catalog'

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
