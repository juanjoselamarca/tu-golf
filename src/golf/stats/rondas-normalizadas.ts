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
 * Una ronda sin ningún hoyo marcado pero con total (carga manual "solo total") entra a promedios y mejor ronda con su total, nunca al conteo hoyo a hoyo.
 * Sin hoyos ni total, se omite.
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

  /**
   * 251 rondas en prod (11 usuarios sin ninguna otra) tienen total y no tarjeta. Sin
   * esto, esos usuarios veían "Aún no tienes rondas" en stats y un historial sin resumen.
   * bucket por holes_played (solo 9 o 18 exactos); par: el del catálogo si la cancha
   * tiene sus 18 pares y la ronda es de 18; si no, estándar 72/36.
   */
  function rondaSoloTotal(raw: RawStatsRound, courseId: string | null): RondaNormalizada | null {
    if (raw.total_gross == null) return null
    const bucket: 18 | 9 | null = raw.holes_played === 18 ? 18 : raw.holes_played === 9 ? 9 : null
    const catalogo = courseId ? courseParMap.get(courseId) ?? null : null
    // Array.from y no slice: el mapa del catálogo es DISPERSO (indexado por `numero`) y
    // every/reduce se saltan los huecos; una cancha sin el hoyo 7 sumaba par 68.
    const pares18 = Array.from({ length: 18 }, (_, i) => catalogo?.[i])
    const parCatalogo = bucket === 18 && pares18.every(p => typeof p === 'number' && p >= 3 && p <= 6)
      ? (pares18 as number[]).reduce((a, b) => a + b, 0)
      : null
    const totalPar = bucket == null ? null : parCatalogo ?? (bucket === 18 ? 72 : 36)
    const vsPar = totalPar != null ? raw.total_gross - totalPar : null
    return {
      id: raw.id,
      course_name: raw.course_name,
      played_at: raw.played_at,
      scores: [],
      total_gross: raw.total_gross,
      holes_played: raw.holes_played ?? 0,
      import_source: raw.import_source,
      parPerHole: null,
      vsPar,
      tarjeta: [],
      pares: [],
      hoyosEstimados: [],
      bucket,
      fueraDePromedios: motivoFueraDeNumeros(raw, raw.total_gross, raw.holes_played ?? 0, bucket),
      cuentaHoyoAHoyo: false,
    }
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
    if (jugadas.length === 0) {
      const soloTotal = rondaSoloTotal(raw, findCourseId(raw.course_name, raw.course_id))
      if (soloTotal) rondas.push(soloTotal)
      continue
    }
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
    // Sin par real: par estándar solo para una ronda de EXACTAMENTE 9 o 18 hoyos. Una de
    // 27 sin par contra 72 daría +60 dentro del promedio de 18: mejor sin vsPar (no promedia).
    if (totalPar == null && (scores.length === 18 || scores.length === 9)) totalPar = scores.length === 18 ? 72 : 36
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

/**
 * El bucket de hoyos del que habla una pantalla de stats: el que tiene MÁS rondas que
 * cuentan (empate → 18). Una sola regla para cifras, gráfico, mejores rondas y tendencia:
 * con 2 de 18 y 7 de 9, el jugador juega 9 hoyos y eso es lo que se le muestra.
 * null si ninguna ronda cuenta.
 */
export function bucketPrincipal(rondas: RondaNormalizada[]): 18 | 9 | null {
  let n18 = 0
  let n9 = 0
  for (const r of rondas) {
    if (!cuentaEnNumeros(r)) continue
    if (r.bucket === 18) n18++
    else if (r.bucket === 9) n9++
  }
  if (n18 === 0 && n9 === 0) return null
  return n18 >= n9 ? 18 : 9
}

/**
 * EL predicado de "entra a los números": sin motivo de exclusión y con vsPar. Una de
 * 27 hoyos sin par real no tiene vsPar: sumarla como 0 (o como total − 72) contaminaba
 * promedio, mejor ronda, breakdown y tendencia.
 */
function cuentaEnNumeros(r: RondaNormalizada): r is RondaNormalizada & { vsPar: number } {
  return r.fueraDePromedios == null && r.vsPar != null
}

/** Las rondas que entran a promedios, mejores rondas y gráfico, del bucket pedido. */
export function rondasQueCuentan(rondas: RondaNormalizada[], bucket: 18 | 9): (RondaNormalizada & { vsPar: number })[] {
  return rondas.filter((r): r is RondaNormalizada & { vsPar: number } => cuentaEnNumeros(r) && r.bucket === bucket)
}

const redondear1 = (n: number) => Math.round(n * 10) / 10

/** Promedio vs par de rondas que ya pasaron por rondasQueCuentan. */
export function promedioVsPar(rondas: (RondaNormalizada & { vsPar: number })[]): number | null {
  return rondas.length > 0 ? redondear1(rondas.reduce((s, r) => s + r.vsPar, 0) / rondas.length) : null
}

/** vsPar más bajo; en empate gana la primera en el orden recibido. */
export function mejorRonda(rondas: (RondaNormalizada & { vsPar: number })[]): BestRound | null {
  let best: BestRound | null = null
  for (const r of rondas) {
    if (!best || r.vsPar < best.vsPar) {
      best = { score: r.total_gross, course: r.course_name, date: r.played_at, vsPar: r.vsPar, roundId: r.id ?? null }
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
    const roundVsPar = r.vsPar
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
  /** Y del gráfico: vsPar de la ronda, en la escala de su propio bucket (sin duplicar). */
  vsPar: number
}

/**
 * Puntos del gráfico en orden CRONOLÓGICO (más antigua primero), sea cual sea el
 * orden de entrada. Solo rondas que cuentan, del MISMO bucket que la cifra héroe:
 * mezclar 9h (×2) con 18h dibujaba una escala que contradecía el promedio.
 */
export function serieScoreVsPar(rondas: RondaNormalizada[], bucket: 18 | 9): PuntoScoreVsPar[] {
  return rondasQueCuentan(rondas, bucket)
    .map(r => ({ id: r.id, played_at: r.played_at, vsPar: r.vsPar }))
    .sort((a, b) => (a.played_at < b.played_at ? -1 : a.played_at > b.played_at ? 1 : 0))
}
