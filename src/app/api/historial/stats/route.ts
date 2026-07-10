import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { findBestCourseMatch } from '@/golf/courses/matching'
import { buildCourseParMap } from '@/golf/courses/course-par-map'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistorialRound {
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

interface BestRound {
  score: number
  course: string
  date: string
  vsPar: number
  /** id de la historical_round que es PR — habilita tap-to-scroll en /perfil/historial (inbox e21e2a32). */
  roundId: string | null
}

interface CourseBreakdownItem {
  courseName: string
  roundCount: number
  avgScore: number
  bestScore: number
}

interface RoundsByMonth {
  month: string
  label: string
  rounds: HistorialRound[]
}

interface HistorialStats {
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

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })
  }

  // Fetch rounds + courses in parallel. course_holes se pagina (Supabase limita a
  // 1000 rows por request) — sin paginar, canchas con id alto quedaban fuera del
  // map y la query reportaba "0 birdies" aunque hubiera muchas rondas matcheadas.
  // Ver bug P12 (auditoría 22-abr-2026): 104 rondas → 0 birdies era artefacto
  // del límite default, no ausencia de birdies reales.
  const PAGE_SIZE = 1000
  const [roundsRes, coursesRes] = await Promise.all([
    supabase
      .from('historical_rounds')
      .select('id, course_name, course_id, played_at, scores, total_gross, holes_played, import_source, garmin_scorecard_id, metadata')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false }),
    supabase
      .from('courses')
      .select('id, nombre, fuente, canonical_course_id'),
  ])

  // Paginar course_holes.
  // CRÍTICO: ordenar por (course_id, numero) — clave ÚNICA — no solo por `numero`.
  // Con `.order('numero')` a secas, cientos de canchas comparten cada valor de
  // numero (todas tienen un hoyo 1, un hoyo 2…), formando grupos de empate que
  // Postgres NO ordena de forma estable entre requests `.range()` separados →
  // filas dropeadas/duplicadas al cruzar límites de página. El array de pares de
  // una cancha quedaba con 17 hoyos en vez de 18 y desalineado, y el conteo de
  // eagles/birdies/pares/bogeys salía mal (bug inbox 2268163d: "los eagles no me
  // calzan" — 11 mostrados vs 7 reales). (course_id, numero) es único → paginación
  // determinista, sin drops.
  const allHolesAcc: Array<{ course_id: string; numero: number; par: number }> = []
  let holesError: unknown = null
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('course_holes')
      .select('course_id, numero, par')
      .order('course_id')
      .order('numero')
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) { holesError = error; break }
    if (!data || data.length === 0) break
    allHolesAcc.push(...(data as Array<{ course_id: string; numero: number; par: number }>))
    if (data.length < PAGE_SIZE) break
  }

  if (roundsRes.error || holesError) {
    return NextResponse.json({ error: 'No pudimos cargar tu historial. Intenta de nuevo.' }, { status: 500 })
  }

  const rawRounds = (roundsRes.data ?? []) as Array<{
    id: string
    course_name: string
    course_id: string | null
    played_at: string
    scores: (number | null)[] | null
    total_gross: number | null
    holes_played: number | null
    import_source: string | null
    garmin_scorecard_id: string | null
    metadata: Record<string, unknown> | null
  }>

  const allCourses = (coursesRes.data ?? []) as Array<{ id: string; nombre: string; fuente?: string | null; canonical_course_id?: string | null }>
  const allHoles = allHolesAcc

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

  const rounds18: Array<{ round: HistorialRound; totalPar: number | null }> = []
  const rounds9: Array<{ round: HistorialRound; totalPar: number | null }> = []

  const processedRounds: HistorialRound[] = []

  // Course stats accumulator
  const courseStats = new Map<string, { count: number; totalScore: number; bestScore: number; bestVsPar: number }>()

  for (const raw of rawRounds) {
    const scores = (raw.scores ?? []).filter((s): s is number => s != null && typeof s === 'number')
    if (scores.length === 0) continue

    const totalGross = raw.total_gross ?? scores.reduce((a, b) => a + b, 0)
    const holesPlayed = raw.holes_played ?? scores.length

    // Find matching course and get pars
    const courseId = findCourseId(raw.course_name, raw.course_id)
    let parPerHole: number[] | null = null
    let vsPar: number | null = null
    let totalPar: number | null = null

    if (courseId && courseParMap.has(courseId)) {
      const coursePars = courseParMap.get(courseId)!
      // Match pars to the number of holes played
      if (coursePars.length >= scores.length) {
        parPerHole = coursePars.slice(0, scores.length)
        totalPar = parPerHole.reduce((a, b) => a + b, 0)
        vsPar = totalGross - totalPar

        // Count hole-by-hole stats with REAL pars
        for (let i = 0; i < scores.length; i++) {
          const score = scores[i]
          const par = parPerHole[i]
          const diff = score - par
          if (diff <= -2) totalEagles++
          else if (diff === -1) totalBirdies++
          else if (diff === 0) totalPars++
          else if (diff === 1) totalBogeys++
          else if (diff >= 2) totalDoubles++
        }
      }
    }

    // Fallback vsPar with standard par if no real pars
    if (vsPar === null) {
      const standardPar = holesPlayed <= 9 ? 36 : 72
      vsPar = totalGross - standardPar
      totalPar = standardPar
    }

    const histRound: HistorialRound = {
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

    if (holesPlayed >= 18 || scores.length >= 18) {
      rounds18.push({ round: histRound, totalPar })
    } else {
      rounds9.push({ round: histRound, totalPar })
    }

    // Course stats — solo acumular rondas de 18h. Mezclar 9h con 18h en
    // el promedio total_gross por cancha contamina (un 45 de 9h con un 90
    // de 18h NO promedian a 67.5). Para ver 9h, usar el endpoint separado
    // o exponer un breakdown 9h específico (backlog).
    if (holesPlayed === 18) {
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
  const monthMap = new Map<string, HistorialRound[]>()
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

  // ─── Response ──────────────────────────────────────────────────────────

  const stats: HistorialStats = {
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

  return NextResponse.json(stats)
}
