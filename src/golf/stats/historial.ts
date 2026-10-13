/**
 * Agregados del historial — FUENTE CANÓNICA del concepto "stats del historial".
 *
 * Movida pura desde src/app/api/historial/stats/route.ts (refactor "el que
 * toca, ordena"): la matemática de golf sale del route handler para que la
 * consuman DOS callers sin duplicarse (regla "un concepto, una fuente"):
 *   - el Server Component /perfil/historial (elimina el waterfall
 *     hidratar → auth → fetch /api/historial/stats), y
 *   - el route /api/historial/stats (que queda como wrapper delgado).
 *
 * PRESERVA el fix del bug inbox 2268163d / PR #254 ("los eagles no me calzan"):
 * los pares por cancha se arman con buildCourseParMap (indexado por `numero`,
 * order-independent) — NUNCA recalcular pares de otra forma. La paginación
 * determinista por (course_id, numero) vive en la capa de datos
 * (src/lib/data/historial.ts) y también es parte del mismo fix.
 *
 * Función pura: sin I/O, sin supabase, 100% testeable unit.
 */

import { findBestCourseMatch, type CourseCandidate } from '@/golf/courses/matching'
import { buildCourseParMap } from '@/golf/courses/course-par-map'
import { resolveRoundParsArray } from '@/golf/coach/hole-pars'
import { isMatchPlayFormat, isSharedBallFormat } from '@/golf/formats'

// ─── Tipos (canónicos — el cliente los re-exporta desde historial/lib/types) ──

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

export interface RoundsByMonth {
  month: string
  label: string
  rounds: StatsHistorialRound[]
}

export interface HistorialStats {
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
  roundsByMonth: RoundsByMonth[]
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function getMonthLabel(dateStr: string): string {
  const [year, monthStr] = dateStr.split('-')
  const monthIdx = parseInt(monthStr, 10) - 1
  return `${MONTH_NAMES[monthIdx]} ${year}`
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7) // "2026-03"
}

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

// ─── Cálculo ──────────────────────────────────────────────────────────────────

/**
 * Agrega el historial completo de un usuario: conteo hoyo-a-hoyo con pares
 * REALES (eagles/birdies/pares/bogeys/dobles+), promedios vs par 18h/9h,
 * mejores rondas, breakdown por cancha (solo 18h) y agrupación por mes.
 *
 * Pares: los de la tarjeta jugada mandan sobre el catálogo (parsPorPosicion);
 * sin par real el hoyo no se cuenta. Promedios y mejores rondas: solo rondas
 * completas (9 o 18 hoyos marcados) y no match play.
 *
 * Cualquier cambio acá impacta a la vez la página y el API (a propósito: una
 * sola fuente).
 */
export function computeHistorialStats(
  rawRounds: RawStatsRound[],
  allCourses: CourseCandidate[],
  allHoles: CourseHoleRow[],
): HistorialStats {
  // Build course_id -> pars map, INDEXADO por `numero` (no por orden de push).
  // Ver src/golf/courses/course-par-map.ts para el porqué (bug inbox 2268163d).
  const courseParMap = buildCourseParMap(allHoles)

  // Build course name matching cache
  const courseMatchCache = new Map<string, string | null>()

  function findCourseId(courseName: string, existingCourseId: string | null): string | null {
    if (existingCourseId && courseParMap.has(existingCourseId)) {
      return existingCourseId
    }
    if (courseMatchCache.has(courseName)) {
      return courseMatchCache.get(courseName)!
    }
    const match = findBestCourseMatch(courseName, allCourses)
    const matchedId = match ? match.id : null
    courseMatchCache.set(courseName, matchedId)
    return matchedId
  }

  // ─── Process each round ──────────────────────────────────────────────────

  let totalBirdies = 0
  let totalEagles = 0
  let totalPars = 0
  let totalBogeys = 0
  let totalDoubles = 0

  const rounds18: Array<{ round: StatsHistorialRound; totalPar: number | null }> = []
  const rounds9: Array<{ round: StatsHistorialRound; totalPar: number | null }> = []

  const processedRounds: StatsHistorialRound[] = []

  // Course stats accumulator
  const courseStats = new Map<string, { count: number; totalScore: number; bestScore: number; bestVsPar: number }>()

  for (const raw of rawRounds) {
    // Se itera la tarjeta CON su posición (no compactada): un hoyo sin marcar no
    // corre los pares de los hoyos siguientes.
    const tarjeta = raw.scores ?? []
    const jugadas: number[] = []
    for (let i = 0; i < tarjeta.length; i++) {
      const s = tarjeta[i]
      if (typeof s === 'number') jugadas.push(i)
    }
    if (jugadas.length === 0) continue
    const scores = jugadas.map(i => tarjeta[i] as number)

    const totalGross = raw.total_gross ?? scores.reduce((a, b) => a + b, 0)
    const holesPlayed = raw.holes_played ?? scores.length

    const courseId = findCourseId(raw.course_name, raw.course_id)
    const catalogPars = courseId ? courseParMap.get(courseId) ?? null : null
    const pares = parsPorPosicion(raw, catalogPars, tarjeta.length)

    // Bola compartida (scramble/foursome): el score es del equipo, no del jugador
    // (mismo criterio que cuentaParaIndice). Queda en la lista, fuera de los números.
    const esDelEquipo = isSharedBallFormat(raw.formato_juego)
    // Hoyos concedidos / sin terminar: la tarjeta trae un score estimado, no jugado.
    const estimados = new Set((raw.metadata?.estimados ?? []).map(e => e.hoyo))
    const hoyos = raw.metadata?.hoyos

    // Conteo hoyo-a-hoyo SOLO donde el par es real. Nunca par 4 inventado: un 2 en
    // un par 3 sin catálogo se contaba como eagle (inbox 4b73b0b6).
    for (const i of esDelEquipo ? [] : jugadas) {
      const par = pares[i]
      if (par == null || estimados.has(hoyos?.[i] ?? i + 1)) continue
      const diff = (tarjeta[i] as number) - par
      if (diff <= -2) totalEagles++
      else if (diff === -1) totalBirdies++
      else if (diff === 0) totalPars++
      else if (diff === 1) totalBogeys++
      else totalDoubles++
    }

    // Lo que cuenta es cuántos hoyos se JUGARON, no lo que dice holes_played: una
    // ronda guardada "de 18" con 9 hoyos marcados entraba al promedio de 18 como +10.
    const bucket: 18 | 9 | null = scores.length >= 18 ? 18 : scores.length === 9 ? 9 : null

    const paresJugados = jugadas.map(i => pares[i])
    const tieneParReal = paresJugados.every((p): p is number => p != null)
    const parPerHole = tieneParReal ? (paresJugados as number[]) : null
    let totalPar: number | null = parPerHole ? parPerHole.reduce((a, b) => a + b, 0) : null
    // Sin par real: par estándar solo para el vs-par de una ronda completa.
    if (totalPar == null && bucket != null) totalPar = bucket === 18 ? 72 : 36
    const vsPar = totalPar != null ? totalGross - totalPar : null

    const histRound: StatsHistorialRound = {
      id: raw.id,
      course_name: raw.course_name,
      played_at: raw.played_at,
      scores,
      total_gross: totalGross,
      holes_played: holesPlayed,
      import_source: raw.import_source,
      parPerHole,
      vsPar,
    }

    processedRounds.push(histRound)

    // Promedios, mejores rondas y breakdown: solo rondas completas del jugador.
    // Match play no se mide contra el par (hoyos concedidos).
    if (bucket == null || esDelEquipo || isMatchPlayFormat(raw.formato_juego)) continue

    if (bucket === 18) {
      rounds18.push({ round: histRound, totalPar })
    } else {
      rounds9.push({ round: histRound, totalPar })
    }

    // Course stats — solo acumular rondas de 18h. Mezclar 9h con 18h en
    // el promedio total_gross por cancha contamina (un 45 de 9h con un 90
    // de 18h NO promedian a 67.5). Para ver 9h, usar el endpoint separado
    // o exponer un breakdown 9h específico (backlog).
    if (bucket === 18) {
      const cName = raw.course_name
      const roundVsPar = vsPar ?? (totalGross - 72)
      const existing = courseStats.get(cName)
      if (existing) {
        existing.count++
        existing.totalScore += totalGross
        existing.bestScore = Math.min(existing.bestScore, totalGross)
        existing.bestVsPar = Math.min(existing.bestVsPar, roundVsPar)
      } else {
        courseStats.set(cName, { count: 1, totalScore: totalGross, bestScore: totalGross, bestVsPar: roundVsPar })
      }
    }
  }

  // ─── Aggregate stats ──────────────────────────────────────────────────

  const totalRounds = processedRounds.length
  const totalRounds18 = rounds18.length
  const totalRounds9 = rounds9.length

  // Average over par
  const avgOverPar18 = rounds18.length > 0
    ? Math.round((rounds18.reduce((sum, r) => sum + (r.round.vsPar ?? 0), 0) / rounds18.length) * 10) / 10
    : null

  const avgOverPar9 = rounds9.length > 0
    ? Math.round((rounds9.reduce((sum, r) => sum + (r.round.vsPar ?? 0), 0) / rounds9.length) * 10) / 10
    : null

  // Best rounds (lowest vsPar)
  let bestRound18: BestRound | null = null
  for (const { round } of rounds18) {
    if (!bestRound18 || (round.vsPar !== null && round.vsPar < bestRound18.vsPar)) {
      bestRound18 = {
        score: round.total_gross,
        course: round.course_name,
        date: round.played_at,
        vsPar: round.vsPar ?? 0,
        roundId: round.id ?? null,
      }
    }
  }

  let bestRound9: BestRound | null = null
  for (const { round } of rounds9) {
    if (!bestRound9 || (round.vsPar !== null && round.vsPar < bestRound9.vsPar)) {
      bestRound9 = {
        score: round.total_gross,
        course: round.course_name,
        date: round.played_at,
        vsPar: round.vsPar ?? 0,
        roundId: round.id ?? null,
      }
    }
  }

  // Course breakdown (top 5 most played)
  const courseBreakdown: CourseBreakdownItem[] = Array.from(courseStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, stats]) => ({
      courseName: name,
      roundCount: stats.count,
      avgScore: Math.round((stats.totalScore / stats.count) * 10) / 10,
      bestScore: stats.bestScore,
      bestVsPar: stats.bestVsPar,
    }))

  // Rounds grouped by month
  const monthMap = new Map<string, StatsHistorialRound[]>()
  for (const round of processedRounds) {
    const key = getMonthKey(round.played_at)
    if (!monthMap.has(key)) {
      monthMap.set(key, [])
    }
    monthMap.get(key)!.push(round)
  }

  const roundsByMonth: RoundsByMonth[] = Array.from(monthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0])) // newest first
    .map(([key, rounds]) => ({
      month: key,
      label: getMonthLabel(rounds[0].played_at),
      rounds,
    }))

  // ─── Resultado ──────────────────────────────────────────────────────────

  return {
    totalRounds,
    totalRounds18,
    totalRounds9,
    avgOverPar18,
    avgOverPar9,
    totalBirdies,
    totalEagles,
    totalPars,
    totalBogeys,
    totalDoubles,
    bestRound18,
    bestRound9,
    courseBreakdown,
    roundsByMonth,
  }
}
