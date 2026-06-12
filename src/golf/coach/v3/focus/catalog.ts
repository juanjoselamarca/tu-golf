/**
 * Catálogo de candidatos a foco. Cada entrada liga un patrón detectable
 * (patterns.ts — gate anti-fantasía con umbrales ya validados en prod) a su
 * métrica baseline en escala PLAN_METRIC (golf/coach/metrics — el huérfano de
 * Ola 0 que acá se conecta al runtime) y a la acción concreta del coach.
 *
 * Es la INTERFAZ que Ola 3 reemplazará por un catálogo declarativo en DB
 * (`pattern_definitions`): cambiar la fuente no debe tocar a `selectFocus`.
 */
import {
  computeBack9MinusFront9,
  computeFirstHole,
  computePar3VsPar,
  computePostBogeyAvg,
  computeLast4MinusRest,
  computeCV,
  type ComputedMetric,
  type RoundData,
} from '@/golf/coach/metrics'

/** Valor agregado de una métrica per-ronda + tamaño de muestra (rondas con valor). */
export interface Baseline {
  valor: number
  muestra: number
}

export interface DetectInfo {
  confidence: number
  metadata: Record<string, unknown>
}

export interface MeasureCtx {
  rounds: RoundData[]
  detected: DetectInfo
}

export interface FocusCandidate {
  /** id en patterns.ts — fuente del gate (detected? confidence?). */
  patternId: string
  /** PLAN_METRIC asociado — continuidad con el motor de planes v2. */
  metricKey: string
  label: string
  accion: string
  /** Confianza mínima del detect() para que el candidato sea elegible. */
  minConfidence: number
  /** Muestra mínima (rondas con métrica no nula) para no rankear sobre ruido. */
  minSample: number
  /** Baseline en escala PLAN_METRIC, o null si no hay datos suficientes. */
  /** Origen del patrón (seed gen-0 | admin | discovered | imported). Default seed. */
  source?: string
  /** Peso default del catálogo (pattern_definitions.weight). cerebro_weights lo overridea. */
  defaultWeight?: number
  measure: (ctx: MeasureCtx) => Baseline | null
}

/** Promedio de una métrica per-ronda sobre las rondas con valor no nulo. */
function aggregate(
  rounds: RoundData[],
  fn: (r: RoundData) => ComputedMetric,
): Baseline | null {
  let sum = 0
  let n = 0
  for (const r of rounds) {
    const m = fn(r)
    if (m.value != null) {
      sum += m.value
      n++
    }
  }
  if (n === 0) return null
  return { valor: Math.round((sum / n) * 100) / 100, muestra: n }
}

/** Grosses válidos para CV (mismo criterio que patterns.ts: >0). */
function grosses(rounds: RoundData[]): number[] {
  return rounds
    .map((r) => r.total_gross)
    .filter((g): g is number => typeof g === 'number' && g > 0)
}

/** Lee un número de la metadata del detect() (para patrones sin métrica per-ronda). */
function fromMeta(detected: DetectInfo, key: string, sampleKey: string): Baseline | null {
  const v = detected.metadata[key]
  const s = detected.metadata[sampleKey]
  if (typeof v !== 'number') return null
  return { valor: Math.round(v * 100) / 100, muestra: typeof s === 'number' ? s : 0 }
}

export const FOCUS_CATALOG: FocusCandidate[] = [
  {
    patternId: 'post_bogey_spiral',
    metricKey: 'post_bogey_score_avg',
    label: 'Espiral post-bogey',
    accion:
      'Haz un reset de 4 pasos después de cada bogey: suelta el hoyo, respira, visualiza el próximo tiro y comprométete. El hoyo anterior no existe.',
    minConfidence: 0.5,
    minSample: 3,
    measure: ({ rounds }) => aggregate(rounds, computePostBogeyAvg),
  },
  {
    patternId: 'back_nine_collapse',
    metricKey: 'back9_minus_front9_strokes',
    label: 'Caída en back nine',
    accion: 'Cuida la energía: hidrátate, come algo en el hoyo 10 y haz un reset mental antes de arrancar el back nine.',
    minConfidence: 0.5,
    minSample: 3,
    measure: ({ rounds }) => aggregate(rounds, computeBack9MinusFront9),
  },
  {
    patternId: 'front_nine_struggles',
    metricKey: 'back9_minus_front9_strokes',
    label: 'Arranque lento',
    accion: 'Arma una rutina pre-ronda: 15 min en el putting green y unas respiraciones lentas (4-4-6) antes del primer tee.',
    minConfidence: 0.5,
    minSample: 3,
    // El front es el flojo: reportamos front−back (positivo = cuánto peor el front),
    // invirtiendo el signo de back9_minus_front9 para que el baseline no quede negativo.
    measure: ({ rounds }) => {
      const b = aggregate(rounds, computeBack9MinusFront9)
      return b ? { valor: Math.round(-b.valor * 100) / 100, muestra: b.muestra } : null
    },
  },
  {
    patternId: 'first_hole_anxiety',
    metricKey: 'avg_first_hole_score',
    label: 'Ansiedad en hoyo 1',
    accion: 'Antes del primer tee, ánclate en quién eres como jugador y define un plan claro para ese tiro. El hoyo 1 no define tu ronda.',
    minConfidence: 0.4,
    minSample: 3,
    measure: ({ rounds }) => aggregate(rounds, computeFirstHole),
  },
  {
    patternId: 'par_3_weakness',
    metricKey: 'par3_avg_vs_par',
    label: 'Debilidad en par 3',
    accion: 'Práctica deliberada con hierros largos. Foco en distancia de carry, no en resultado.',
    minConfidence: 0.5,
    minSample: 3,
    measure: ({ rounds }) => aggregate(rounds, computePar3VsPar),
  },
  {
    patternId: 'pressure_deterioration',
    metricKey: 'last4holes_minus_rest_strokes',
    label: 'Deterioro en el cierre',
    accion: 'Rutina pre-shot extendida en los últimos 4 hoyos. Respiración cuadrada antes del 15.',
    minConfidence: 0.5,
    minSample: 3,
    measure: ({ rounds }) => aggregate(rounds, computeLast4MinusRest),
  },
  {
    patternId: 'driving_inconsistency',
    metricKey: 'total_gross_cv',
    label: 'Alta dispersión total',
    accion: 'Jornada de range con foco en consistencia de driver — 60 bolas a un solo objetivo.',
    minConfidence: 0.5,
    minSample: 5,
    measure: ({ rounds }) => {
      const g = grosses(rounds)
      const m = computeCV(g)
      if (m.value == null) return null
      return { valor: Math.round(m.value * 1000) / 1000, muestra: g.length }
    },
  },
  {
    patternId: 'short_game_weakness',
    metricKey: 'short_game_strokes_per_round',
    label: 'Juego corto débil',
    accion: 'Dedicar 60% de práctica a chipping y approach. Menos driver, más wedges.',
    minConfidence: 0.45,
    minSample: 3,
    // Sin métrica per-ronda en metrics/ (requiere desglose por hoyo): usa la
    // evidencia del propio detect() como baseline.
    measure: ({ detected }) => fromMeta(detected, 'par4_avg_over', 'par4_count'),
  },
  {
    patternId: 'three_putt_frequency',
    metricKey: 'three_putts_per_round',
    label: 'Frecuencia de three-putts',
    accion: 'Práctica de lag putting — distancia antes que dirección. Objetivo: 0 three-putts.',
    minConfidence: 0.5,
    minSample: 3,
    measure: ({ detected }) => fromMeta(detected, 'three_putt_rate', 'total_greens'),
  },
]

/**
 * Binding de la matemática gen-0 por pattern_key. Cuando Ola 3 mueve el catálogo
 * a `pattern_definitions` (DB), la metadata (label/acción/umbrales/peso) sale de
 * la tabla pero la función `measure` (la matemática) sigue acá, ligada por key.
 * Patrones declarativos full (formula_payload interpretado) = Ola 5.
 */
export const MEASURE_BY_KEY: Record<string, FocusCandidate['measure']> = Object.fromEntries(
  FOCUS_CATALOG.map((c) => [c.patternId, c.measure]),
)
