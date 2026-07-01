// src/golf/coach/v3/priors/field-context.ts
// Composición PURA del contexto de campo (Ola 1b §5.2). Toma los insumos ya
// leídos (valor del jugador, benchmark del bucket, percentil poblacional, normas
// de cancha) y arma la salida en claves LEGIBLES que el coach verbaliza en las 6
// piezas. Sin I/O: testeable sin DB. El wiring server-side vive en el tool.
import type { BenchmarkPoint } from './readers'

/** Una capa puede estar disponible (con su payload) o degradar con motivo. */
export type Layer<T> = (T & { disponible: true }) | { disponible: false; motivo: string }

export interface VsHandicap {
  tu_valor: number
  normal_para_tu_handicap: number
  /** "mejor que X% de jugadores de tu hándicap" (0–100), o null si no se pudo estimar. */
  mejor_que_pct: number | null
  interpretacion: string
}

export interface RankingPoblacional {
  indice: number
  mejor_que_pct: number
  interpretacion: string
}

export interface DificultadCancha {
  cancha: string
  par: number | null
  slope: number | null
  course_rating: number | null
  banda_referencia: { slope: number | null; course_rating: number | null }
  relativa: string
}

export interface FieldContextResult {
  metrica: string
  vs_handicap: Layer<VsHandicap>
  ranking_poblacional: Layer<RankingPoblacional>
  dificultad_cancha: Layer<DificultadCancha>
}

/**
 * Percentil del valor del jugador dentro del benchmark del bucket: "mejor que
 * X% de tu hándicap". Los `points` vienen en la MISMA escala que `value`
 * (interna, ya convertida por METRIC_PRIOR_MAP). `lowerIsBetter` = menos es
 * mejor (scores vs par). Devuelve null si hay <2 puntos (no se puede interpolar).
 *
 * Saturación honesta en los extremos: por debajo del percentil más bajo conocido
 * se reporta ese percentil (ej "top 10%"), nunca se extrapola a 0/100 inventando.
 */
export function betterThanPct(
  points: BenchmarkPoint[],
  value: number,
  lowerIsBetter: boolean,
): number | null {
  const sorted = [...points].sort((a, b) => a.value - b.value)
  if (sorted.length < 2) return null
  let pBelow: number // % de la población con valor <= value
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (value <= first.value) {
    pBelow = first.percentile
  } else if (value >= last.value) {
    pBelow = last.percentile
  } else {
    let a = first
    let b = last
    for (let i = 0; i < sorted.length - 1; i++) {
      if (value >= sorted[i].value && value <= sorted[i + 1].value) {
        a = sorted[i]
        b = sorted[i + 1]
        break
      }
    }
    const span = b.value - a.value
    pBelow = span === 0 ? a.percentile : a.percentile + ((b.percentile - a.percentile) * (value - a.value)) / span
  }
  const betterThan = lowerIsBetter ? 100 - pBelow : pBelow
  return Math.round(Math.min(100, Math.max(0, betterThan)))
}

/**
 * Veredicto cualitativo del valor del jugador vs "lo normal" (mediana del
 * bucket), con banda de tolerancia para no exagerar diferencias chicas.
 */
export function classifyVsNormal(
  value: number,
  median: number,
  lowerIsBetter: boolean,
  tolerance: number,
): string {
  const diff = value - median
  if (Math.abs(diff) <= tolerance) return 'en línea con lo normal de tu índice'
  const mejor = lowerIsBetter ? diff < 0 : diff > 0
  return mejor
    ? 'mejor que lo normal de tu índice'
    : 'por encima de lo normal de tu índice — hay margen de mejora ahí'
}

/**
 * Dificultad relativa de la cancha vs la banda de referencia de su par. Se apoya
 * primero en el slope (el indicador de dificultad para el jugador medio); el
 * course rating desempata. Devuelve frase legible.
 */
export function classifyCourseDifficulty(
  courseSlope: number | null,
  bandSlope: number | null,
): string {
  if (courseSlope == null || bandSlope == null) return 'dificultad estándar (sin banda de referencia para comparar)'
  const diff = courseSlope - bandSlope
  if (diff >= 8) return 'más difícil que una cancha de referencia de su par'
  if (diff <= -8) return 'más fácil que una cancha de referencia de su par'
  return 'dificultad similar a una cancha de referencia de su par'
}

export interface BuildFieldContextInput {
  metricLabel: string
  /** Valor del jugador en escala interna; null = sin datos suficientes. */
  playerValue: number | null
  /** Benchmark del bucket en escala INTERNA (ya convertida). [] = sin benchmark. */
  benchmarkInternal: BenchmarkPoint[]
  lowerIsBetter: boolean
  indice: number | null
  /** "mejor que X%" poblacional (capa B), ya calculado; null = sin distribución. */
  populationBetterThanPct: number | null
  course: {
    nombre: string
    par: number | null
    slope: number | null
    course_rating: number | null
  } | null
  band: { slope: number | null; course_rating: number | null } | null
}

/** Compone el resultado legible degradando cada capa de forma independiente. */
export function buildFieldContext(inp: BuildFieldContextInput): FieldContextResult {
  return {
    metrica: inp.metricLabel,
    vs_handicap: buildVsHandicap(inp),
    ranking_poblacional: buildRanking(inp),
    dificultad_cancha: buildDificultad(inp),
  }
}

function buildVsHandicap(inp: BuildFieldContextInput): Layer<VsHandicap> {
  if (inp.playerValue == null) {
    return { disponible: false, motivo: 'No hay rondas suficientes para medir tu valor en esta métrica.' }
  }
  const byP = new Map(inp.benchmarkInternal.map((p) => [p.percentile, p.value]))
  const median = byP.get(50)
  if (median == null) {
    return { disponible: false, motivo: 'No tengo un benchmark de tu índice para esta métrica.' }
  }
  const p25 = byP.get(25)
  const p75 = byP.get(75)
  const tolerance = p25 != null && p75 != null ? Math.abs(p75 - p25) * 0.15 : Math.abs(median) * 0.1
  return {
    disponible: true,
    tu_valor: round2(inp.playerValue),
    normal_para_tu_handicap: round2(median),
    mejor_que_pct: betterThanPct(inp.benchmarkInternal, inp.playerValue, inp.lowerIsBetter),
    interpretacion: classifyVsNormal(inp.playerValue, median, inp.lowerIsBetter, tolerance),
  }
}

function buildRanking(inp: BuildFieldContextInput): Layer<RankingPoblacional> {
  if (inp.indice == null) {
    return { disponible: false, motivo: 'El jugador no tiene índice registrado, no puedo ubicarlo en la población.' }
  }
  if (inp.populationBetterThanPct == null) {
    return { disponible: false, motivo: 'No tengo la distribución poblacional para ubicar tu índice.' }
  }
  return {
    disponible: true,
    indice: round2(inp.indice),
    mejor_que_pct: inp.populationBetterThanPct,
    interpretacion: `Tu índice está por encima del ${inp.populationBetterThanPct}% de los golfistas con hándicap.`,
  }
}

function buildDificultad(inp: BuildFieldContextInput): Layer<DificultadCancha> {
  if (!inp.course) {
    return { disponible: false, motivo: 'No tengo una cancha reciente del jugador para evaluar dificultad.' }
  }
  return {
    disponible: true,
    cancha: inp.course.nombre,
    par: inp.course.par,
    slope: inp.course.slope,
    course_rating: inp.course.course_rating,
    banda_referencia: { slope: inp.band?.slope ?? null, course_rating: inp.band?.course_rating ?? null },
    relativa: classifyCourseDifficulty(inp.course.slope, inp.band?.slope ?? null),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
