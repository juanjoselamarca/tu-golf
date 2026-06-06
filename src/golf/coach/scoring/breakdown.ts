// src/golf/coach/scoring/breakdown.ts
// Calculadora determinista de score. Funciones PURAS (sin I/O). Único lugar del
// coach autorizado a producir un número de score calculado. El LLM nunca calcula:
// emite la intención, esto emite el número que cierra exactamente.

export type HoleClass = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'triple'

export interface Distribution {
  eagle: number
  birdie: number
  par: number
  bogey: number
  double: number
  triple: number
}

export interface ProjectScoreInput {
  parTotal: number | null
  holes: number
  /** Modo 1: reparto explícito de hoyos. */
  distribution?: Partial<Distribution>
  /** Modo 2: objetivo en sobre-par; la fn construye un reparto que cierra. */
  targetOver?: number
}

export interface ProjectScoreResult {
  over: number
  absolute: number | null
  relativeLabel: string
  distribution: Distribution
}

const OVER_WEIGHTS: Record<HoleClass, number> = {
  eagle: -2, birdie: -1, par: 0, bogey: 1, double: 2, triple: 3,
}

function normalize(d?: Partial<Distribution>): Distribution {
  return {
    eagle: d?.eagle ?? 0, birdie: d?.birdie ?? 0, par: d?.par ?? 0,
    bogey: d?.bogey ?? 0, double: d?.double ?? 0, triple: d?.triple ?? 0,
  }
}

function overOf(d: Distribution): number {
  return (Object.keys(OVER_WEIGHTS) as HoleClass[]).reduce((acc, k) => acc + OVER_WEIGHTS[k] * d[k], 0)
}

/** Construye un reparto de `holes` hoyos cuyo sobre-par sea exactamente `over`. */
function buildDistribution(holes: number, over: number): Distribution {
  const d = normalize()
  if (over >= 0) {
    // Empezar todo bogey (máx +holes), luego subir bogeys a dobles/triples.
    let extra = over
    d.bogey = Math.min(over, holes)
    extra -= d.bogey
    // Subir hoyos a doble (+1 c/u) mientras quede sobre-par y haya bogeys.
    while (extra > 0 && d.bogey > 0) { d.bogey--; d.double++; extra--; }
    while (extra > 0 && d.double > 0) { d.double--; d.triple++; extra--; }
    // Si aún sobra (over > 3*holes), el caso es irreal para golf; clamp.
  } else {
    d.birdie = Math.min(-over, holes)
  }
  d.par = holes - (d.eagle + d.birdie + d.bogey + d.double + d.triple)
  if (d.par < 0) d.par = 0
  return d
}

export function projectScore(input: ProjectScoreInput): ProjectScoreResult {
  const { parTotal, holes } = input
  const dist = input.distribution
    ? normalize(input.distribution)
    : buildDistribution(holes, input.targetOver ?? 0)
  const over = overOf(dist)
  const absolute = parTotal != null ? parTotal + over : null
  const relativeLabel = `${over >= 0 ? '+' : ''}${over}`
  return { over, absolute, relativeLabel, distribution: dist }
}
