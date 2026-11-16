/**
 * Rondas normalizadas — FUENTE ÚNICA de cómo una ronda del historial entra (o no)
 * a los números del jugador. La consumen /perfil/historial (computeHistorialStats)
 * y /perfil/stats (useStatsDerived): las dos pantallas suman con el mismo código,
 * así que no pueden contradecirse (auditoría 16-nov-2026: stats mostraba un
 * scramble de 62 como mejor ronda y eagles con par 4 inventado).
 *
 * Dos pasos puros, sin I/O:
 *   normalizarRondas(raw, courses, holes) → una RondaNormalizada por ronda con al
 *     menos un hoyo marcado: pares reales por posición, bucket 9/18 y si queda
 *     fuera de los promedios (y por qué).
 *   agregarRondas(rondas) → conteo hoyo a hoyo, promedios vs par, mejores rondas
 *     y breakdown por cancha.
 *
 * PRESERVA el fix del bug inbox 2268163d / PR #254: los pares por cancha se arman
 * con buildCourseParMap (indexado por `numero`); nunca recalcularlos de otra forma.
 */

import { findBestCourseMatch, type CourseCandidate } from '@/golf/courses/matching'
import { buildCourseParMap } from '@/golf/courses/course-par-map'
import { resolveRoundParsArray } from '@/golf/coach/hole-pars'
import { isMatchPlayFormat, isSharedBallFormat } from '@/golf/formats'
import { isImpossibleScore } from '@/golf/core/index-window'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface StatsHistorialRound {
  id: string
  course_name: string
  played_at: string
  scores: number[]
  total_gross: number
  holes_played: number
  import_source: string | null
  parPerHole: number[] | null
  vsPar: number | null
}

export interface BestRound {
  score: number
  course: string
  date: string
  vsPar: number
  /** id de la historical_round que es PR — habilita tap-to-scroll en /perfil/historial (inbox e21e2a32). */
  roundId: string | null
}

export interface CourseBreakdownItem {
  courseName: string
  roundCount: number
  avgScore: number
  bestScore: number
  bestVsPar: number
}

/** Fila cruda de historical_rounds tal como la trae la capa de datos. */
export interface RawStatsRound {
  id: string
  course_name: string
  course_id: string | null
  played_at: string
  scores: (number | null)[] | null
  total_gross: number | null
  holes_played: number | null
  import_source: string | null
  /** Pares de la tarjeta que se jugó (Garmin / scorer), por POSICIÓN ("1" = scores[0]). Mandan sobre el catálogo. */
  par_per_hole?: unknown
  /** `hoyos[i]` = número real del hoyo de scores[i] (una de 9 desde el 10 son 10..18). */
  metadata?: { hoyos?: readonly number[]; estimados?: ReadonlyArray<{ hoyo: number }> } | null
  formato_juego?: string | null
}

/** Fila de course_holes (paginada determinísticamente en la capa de datos). */
export interface CourseHoleRow {
  course_id: string
  numero: number
  par: number
}

/** Por qué una ronda queda fuera de promedios, mejores rondas y gráfico. */
export type MotivoFueraDeNumeros = 'bola_compartida' | 'match_play' | 'parcial' | 'score_imposible'

export interface RondaNormalizada extends StatsHistorialRound {
  /** Tarjeta por POSICIÓN, con null donde no se marcó (no compactada, a diferencia de `scores`). */
  tarjeta: (number | null)[]
  /** Par real de cada posición de `tarjeta`; null donde no se sabe. */
  pares: (number | null)[]
  /** POSICIONES de `tarjeta` con score estimado (concedido / sin terminar): no cuentan hoyo a hoyo. */
  hoyosEstimados: number[]
  /** Hoyos jugados: 18 (18 o más marcados), 9 (exactamente 9) o null (parcial). */
  bucket: 18 | 9 | null
  /** vsPar llevado a escala de 18 hoyos: una de 9 vale el doble. null si no hay vsPar o bucket. */
  vsPar18: number | null
  fueraDePromedios: MotivoFueraDeNumeros | null
  /** Si sus hoyos suman al conteo eagle/birdie/par/bogey/doble+. */
  cuentaHoyoAHoyo: boolean
}

export interface ConteoHoyoAHoyo {
  eagles: number
  birdies: number
  pars: number
  bogeys: number
  doubles: number
}

export interface AgregadosDeRondas {
  totalRounds: number
  totalRounds18: number
  totalRounds9: number
  avgOverPar18: number | null
  avgOverPar9: number | null
  totalBirdies: number
  totalEagles: number
  totalPars: number
  totalBogeys: number
  totalDoubles: number
  bestRound18: BestRound | null
  bestRound9: BestRound | null
  courseBreakdown: CourseBreakdownItem[]
}

// ─── Normalización ────────────────────────────────────────────────────────────

/**
 * Par de cada POSICIÓN de la tarjeta (índice = scores[i]); null donde no se sabe.
 * Fuente única de la prioridad: resolveRoundParsArray (la tarjeta jugada pisa al
 * catálogo, que está sucio — inbox 4b73b0b6: La Planicie con pares de otra cancha
 * daba eagles falsos). El catálogo está indexado por número de hoyo, así que se
 * traduce con metadata.hoyos (una de 9 desde el 10 lee los pares del 10..18).
 */
function parsPorPosicion(raw: RawStatsRound, catalogPars: number[] | null, n: number): (number | null)[] {
  const hoyos = raw.metadata?.hoyos
  const catalogoPorPosicion = catalogPars
    ? Array.from({ length: n }, (_, i) => catalogPars[(hoyos?.[i] ?? i + 1) - 1] ?? null)
    : null
  return resolveRoundParsArray(raw.par_per_hole, catalogoPorPosicion, n)
}

/** Bola compartida > score imposible > match play > parcial: el primero que aplica. */
function motivoFueraDeNumeros(
  raw: RawStatsRound,
  totalGross: number,
  hoyosMarcados: number,
  bucket: 18 | 9 | null,
): MotivoFueraDeNumeros | null {
  // El score es del equipo, no del jugador (mismo criterio que cuentaParaIndice).
  if (isSharedBallFormat(raw.formato_juego)) return 'bola_compartida'
  // Menos de 3 golpes por hoyo marcado: error de carga (WHS 2.1). Se mide contra los
  // hoyos MARCADOS, no holes_played: una parcial guardada "de 18" no es imposible.
  if (isImpossibleScore({ total_gross: totalGross, holes_played: hoyosMarcados })) return 'score_imposible'
  // Match play no se mide contra el par (hoyos concedidos).
  if (isMatchPlayFormat(raw.formato_juego)) return 'match_play'
  if (bucket == null) return 'parcial'
  return null
}

/**
 * Normaliza las rondas crudas del historial, en el MISMO orden en que llegan.
 * Rondas sin ningún hoyo marcado se omiten.
 *
 * Pares: los de la tarjeta jugada mandan sobre el catálogo; sin par real el hoyo
 * no cuenta hoyo a hoyo (nunca par 4 inventado: un 2 en un par 3 sin catálogo se
 * contaba como eagle, inbox 4b73b0b6). vsPar de una ronda completa sin par real
 * usa par estándar (72/36).
 */
export function normalizarRondas(
  rawRounds: RawStatsRound[],
  allCourses: CourseCandidate[],
  allHoles: CourseHoleRow[],
): RondaNormalizada[] {
  // course_id → pares, INDEXADO por `numero` (no por orden de push). Bug inbox 2268163d.
  const courseParMap = buildCourseParMap(allHoles)
  const courseMatchCache = new Map<string, string | null>()

  function findCourseId(courseName: string, existingCourseId: string | null): string | null {
    if (existingCourseId && courseParMap.has(existingCourseId)) return existingCourseId
    if (courseMatchCache.has(courseName)) return courseMatchCache.get(courseName)!
    const matchedId = findBestCourseMatch(courseName, allCourses)?.id ?? null
    courseMatchCache.set(courseName, matchedId)
    return matchedId
  }

  const rondas: RondaNormalizada[] = []
  for (const raw of rawRounds) {
    // Se itera la tarjeta CON su posición (no compactada): un hoyo sin marcar no
    // corre los pares de los hoyos siguientes.
    const tarjeta = raw.scores ?? []
    const jugadas: number[] = []
    for (let i = 0; i < tarjeta.length; i++) {
      if (typeof tarjeta[i] === 'number') jugadas.push(i)
    }
    if (jugadas.length === 0) continue
    const scores = jugadas.map(i => tarjeta[i] as number)

    const totalGross = raw.total_gross ?? scores.reduce((a, b) => a + b, 0)
    const holesPlayed = raw.holes_played ?? scores.length

    const courseId = findCourseId(raw.course_name, raw.course_id)
    const catalogPars = courseId ? courseParMap.get(courseId) ?? null : null
    const pares = parsPorPosicion(raw, catalogPars, tarjeta.length)

    const hoyos = raw.metadata?.hoyos
    const estimados = new Set((raw.metadata?.estimados ?? []).map(e => e.hoyo))
    const hoyosEstimados = jugadas.filter(i => estimados.has(hoyos?.[i] ?? i + 1))

    // Lo que cuenta es cuántos hoyos se JUGARON, no lo que dice holes_played: una
    // ronda guardada "de 18" con 9 hoyos marcados entraba al promedio de 18 como +10.
    const bucket: 18 | 9 | null = scores.length >= 18 ? 18 : scores.length === 9 ? 9 : null

    const paresJugados = jugadas.map(i => pares[i])
    const parPerHole = paresJugados.every((p): p is number => p != null) ? (paresJugados as number[]) : null
    let totalPar: number | null = parPerHole ? parPerHole.reduce((a, b) => a + b, 0) : null
    // Sin par real: par estándar solo para el vs-par de una ronda completa.
    if (totalPar == null && bucket != null) totalPar = bucket === 18 ? 72 : 36
    const vsPar = totalPar != null ? totalGross - totalPar : null

    const fueraDePromedios = motivoFueraDeNumeros(raw, totalGross, scores.length, bucket)

    rondas.push({
      id: raw.id,
      course_name: raw.course_name,
      played_at: raw.played_at,
      scores,
      total_gross: totalGross,
      holes_played: holesPlayed,
      import_source: raw.import_source,
      parPerHole,
      vsPar,
      tarjeta,
      pares,
      hoyosEstimados,
      bucket,
      vsPar18: vsPar == null || bucket == null ? null : bucket === 9 ? vsPar * 2 : vsPar,
      fueraDePromedios,
      // Parcial y match play sí suman sus hoyos jugados; bola compartida (el golpe es
      // del equipo) y score imposible (error de carga) no.
      cuentaHoyoAHoyo: fueraDePromedios !== 'bola_compartida' && fueraDePromedios !== 'score_imposible',
    })
  }
  return rondas
}

/** La ronda en el formato liviano de la lista del historial (sin los campos de normalización). */
export function aRondaDeHistorial(r: RondaNormalizada): StatsHistorialRound {
  return {
    id: r.id,
    course_name: r.course_name,
    played_at: r.played_at,
    scores: r.scores,
    total_gross: r.total_gross,
    holes_played: r.holes_played,
    import_source: r.import_source,
    parPerHole: r.parPerHole,
    vsPar: r.vsPar,
  }
}

// ─── Agregación ───────────────────────────────────────────────────────────────

/** Eagle o mejor (el albatros es eagle) / birdie / par / bogey / doble o peor, solo con par real. */
export function contarHoyoAHoyo(rondas: RondaNormalizada[]): ConteoHoyoAHoyo {
  const c: ConteoHoyoAHoyo = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0 }
  for (const r of rondas) {
    if (!r.cuentaHoyoAHoyo) continue
    const estimados = new Set(r.hoyosEstimados)
    for (let i = 0; i < r.tarjeta.length; i++) {
      const s = r.tarjeta[i]
      const par = r.pares[i]
      if (typeof s !== 'number' || par == null || estimados.has(i)) continue
      const diff = s - par
      if (diff <= -2) c.eagles++
      else if (diff === -1) c.birdies++
      else if (diff === 0) c.pars++
      else if (diff === 1) c.bogeys++
      else c.doubles++
    }
  }
  return c
}

/** Las rondas que entran a promedios, mejores rondas y gráfico, del bucket pedido. */
export function rondasQueCuentan(rondas: RondaNormalizada[], bucket: 18 | 9): RondaNormalizada[] {
  return rondas.filter(r => r.fueraDePromedios == null && r.bucket === bucket)
}

const redondear1 = (n: number) => Math.round(n * 10) / 10

function promedioVsPar(rondas: RondaNormalizada[]): number | null {
  return rondas.length > 0 ? redondear1(rondas.reduce((s, r) => s + (r.vsPar ?? 0), 0) / rondas.length) : null
}

/** vsPar más bajo; en empate gana la primera en el orden recibido. */
export function mejorRonda(rondas: RondaNormalizada[]): BestRound | null {
  let best: BestRound | null = null
  for (const r of rondas) {
    if (!best || (r.vsPar !== null && r.vsPar < best.vsPar)) {
      best = { score: r.total_gross, course: r.course_name, date: r.played_at, vsPar: r.vsPar ?? 0, roundId: r.id ?? null }
    }
  }
  return best
}

/**
 * Agregados de un set de rondas normalizadas. Promedios, mejores rondas y
 * breakdown: solo rondas con fueraDePromedios == null, separadas 9/18.
 */
export function agregarRondas(rondas: RondaNormalizada[]): AgregadosDeRondas {
  const conteo = contarHoyoAHoyo(rondas)
  const rounds18 = rondasQueCuentan(rondas, 18)
  const rounds9 = rondasQueCuentan(rondas, 9)

  // Breakdown por cancha SOLO con 18h: un 45 de 9h con un 90 de 18h NO promedian a 67.5.
  const courseStats = new Map<string, { count: number; totalScore: number; bestScore: number; bestVsPar: number }>()
  for (const r of rounds18) {
    const roundVsPar = r.vsPar ?? (r.total_gross - 72)
    const existing = courseStats.get(r.course_name)
    if (existing) {
      existing.count++
      existing.totalScore += r.total_gross
      existing.bestScore = Math.min(existing.bestScore, r.total_gross)
      existing.bestVsPar = Math.min(existing.bestVsPar, roundVsPar)
    } else {
      courseStats.set(r.course_name, { count: 1, totalScore: r.total_gross, bestScore: r.total_gross, bestVsPar: roundVsPar })
    }
  }
  const courseBreakdown: CourseBreakdownItem[] = Array.from(courseStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, s]) => ({
      courseName: name,
      roundCount: s.count,
      avgScore: redondear1(s.totalScore / s.count),
      bestScore: s.bestScore,
      bestVsPar: s.bestVsPar,
    }))

  return {
    totalRounds: rondas.length,
    totalRounds18: rounds18.length,
    totalRounds9: rounds9.length,
    avgOverPar18: promedioVsPar(rounds18),
    avgOverPar9: promedioVsPar(rounds9),
    totalBirdies: conteo.birdies,
    totalEagles: conteo.eagles,
    totalPars: conteo.pars,
    totalBogeys: conteo.bogeys,
    totalDoubles: conteo.doubles,
    bestRound18: mejorRonda(rounds18),
    bestRound9: mejorRonda(rounds9),
    courseBreakdown,
  }
}

// ─── Serie "Tu score vs par" ──────────────────────────────────────────────────

export interface PuntoScoreVsPar {
  id: string
  played_at: string
  /** Y del gráfico: vsPar en escala de 18 hoyos. */
  vsPar18: number
  /** Ronda de 9 hoyos (se dibuja como punto hueco). */
  es9: boolean
}

/**
 * Puntos del gráfico en orden CRONOLÓGICO (más antigua primero), sea cual sea el
 * orden de entrada. Solo rondas que cuentan para los números; una de 9 entra con
 * su vsPar duplicado (escala 18).
 */
export function serieScoreVsPar(rondas: RondaNormalizada[]): PuntoScoreVsPar[] {
  return rondas
    .filter(r => r.fueraDePromedios == null && r.vsPar18 != null)
    .map(r => ({ id: r.id, played_at: r.played_at, vsPar18: r.vsPar18 as number, es9: r.bucket === 9 }))
    .sort((a, b) => (a.played_at < b.played_at ? -1 : a.played_at > b.played_at ? 1 : 0))
}
