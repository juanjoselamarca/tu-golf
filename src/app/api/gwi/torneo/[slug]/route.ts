import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  strokesRecibidosEnHoyo,
  puntosStablefordHoyo,
} from '@/golf/core/scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { courseHandicapDeScoring } from '@/golf/core/hole-scoring'
import { parDeLaRondaDelTorneo } from '@/golf/core/course-handicap'
import { fetchCourseHoles, fetchLegacyHcpContext, fetchRoundContexts } from '@/lib/data/tournaments/leaderboard'
import { activeRoundOf } from '@/golf/tournament-rounds'
import { resolveFormatoJuego } from '@/golf/formats'
import { captureError } from '@/lib/error-tracking'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import type { RoundLeaderboardContext } from '@/golf/leaderboard/types'
import { inferHoles } from '@/golf/core/holes'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'

export const dynamic = 'force-dynamic'

interface DBHScore { hole_number: number; gross_score: number | null }
interface DBPattern { pattern_type: string; confidence: number; metadata: Record<string, number> }

export async function GET(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  try {
    const supabase = await createClient()

    // Fetch tournament
    const { data: rawT } = await supabase
      .from('tournaments')
      .select('id, name, hole_count, total_rounds, date_start, course_id, tees, hcp_calc_mode, modo_juego, formato_juego, format, courses(id, par_total)')
      .eq('slug', params.slug)
      .single()

    if (!rawT) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const t = rawT as unknown as {
      id: string; name: string; hole_count: number; total_rounds: number | null; date_start: string | null
      course_id: string | null; tees: string | null; hcp_calc_mode: string | null; modo_juego: string | null
      formato_juego: string | null; format: string | null
      courses: { id: string; par_total: number } | null
    }

    const modo       = (t.modo_juego as 'gross' | 'neto') || 'gross'
    // Predicado canónico del formato — el mismo que usan el scorer y el board.
    // El GWI decide con esto qué carrera modela (`currentScore` abajo); tenerlo
    // resuelto de otra forma que el resto era pedirle que corriera otra carrera.
    const formato    = resolveFormatoJuego(t) as 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome'
    const totalHoyos = t.hole_count ?? 18

    // ── Contexto de la ronda 1 (base) + el de las rondas en otra cancha. ──
    // EXACTAMENTE lo mismo que arma /torneo: `fetchCourseHoles` +
    // `fetchLegacyHcpContext` + `fetchRoundContexts`. Antes el GWI armaba su
    // propio contexto por ronda (tercera implementación del mismo concepto).
    const [catalogo, hcpCtx, roundContexts] = await Promise.all([
      t.course_id ? fetchCourseHoles(supabase, t.course_id) : Promise.resolve([]),
      fetchLegacyHcpContext(supabase, t.id),
      fetchRoundContexts(supabase, t),
    ])
    const base: RoundLeaderboardContext = {
      totalHoyos,
      courseHoles: hoyosDeLaVuelta(catalogo, totalHoyos),
      parTotal: parDeLaRondaDelTorneo(catalogo, totalHoyos, t.courses?.par_total),
      hcp: hcpCtx,
    }
    const parTotal = base.parTotal
    // SI normalizado por contexto, calculado una vez por ronda distinta.
    const siPorCtx = new Map<RoundLeaderboardContext, Record<number, number>>()
    const siDe = (ctx: RoundLeaderboardContext) => {
      let si = siPorCtx.get(ctx)
      if (!si) {
        si = normalizedStrokeIndexByHole(ctx.courseHoles, ctx.totalHoyos)
        siPorCtx.set(ctx, si)
      }
      return si
    }

    // Players with rounds
    const { data: rawPlayers } = await supabase
      .from('players')
      .select(`
        id, user_id, handicap_at_registration, tee_id, genero,
        profiles(name, indice),
        categories(default_tee_color, gender),
        rounds(id, status, round_number, total_gross, total_net, total_points,
          hole_scores(hole_number, gross_score))
      `)
      .eq('tournament_id', t.id)

    if (!rawPlayers || rawPlayers.length === 0) {
      return NextResponse.json({ inputs: [], totalHoyos, modoJuego: modo, formatoJuego: formato })
    }

    const typedPlayers = rawPlayers as unknown as {
      id: string
      user_id: string
      handicap_at_registration: number | null
      tee_id: string | null
      genero: string | null
      profiles: { name: string; indice: number | null } | null
      categories: { default_tee_color: string | null; gender: string | null } | null
      rounds: { id: string; status: string; round_number: number | null; total_gross: number; hole_scores: DBHScore[] }[]
    }[]

    // Batch: fetch all historical rounds and patterns in 2 queries instead of N+1
    const userIds = typedPlayers.map(p => p.user_id).filter(Boolean)

    const [{ data: allHist }, { data: allPatterns }] = await Promise.all([
      supabase
        .from('historical_rounds')
        .select('user_id, total_gross, holes_played, scores')
        .in('user_id', userIds)
        .not('total_gross', 'is', null)
        .order('played_at', { ascending: false }),
      supabase
        .from('player_patterns')
        .select('user_id, pattern_type, confidence, metadata')
        .in('user_id', userIds)
        .eq('status', 'active'),
    ])

    const histByUser = new Map<string, { total_gross: number }[]>()
    for (const r of (allHist ?? [])) {
      const uid = r.user_id as string
      if (!histByUser.has(uid)) histByUser.set(uid, [])
      histByUser.get(uid)!.push(r as { total_gross: number })
    }

    const patternsByUser = new Map<string, DBPattern[]>()
    for (const p of (allPatterns ?? [])) {
      const uid = p.user_id as string
      if (!patternsByUser.has(uid)) patternsByUser.set(uid, [])
      patternsByUser.get(uid)!.push(p as unknown as DBPattern)
    }

    const inputs: JugadorGWIInput[] = typedPlayers.map((p) => {
      // La ronda ACTIVA del jugador (no `rounds[0]`: orden de llegada) y el
      // contexto de la cancha en que se juega — par, SI y course handicap de
      // ESA ronda. Las rondas que repiten cancha usan el base.
      const round = activeRoundOf(p.rounds)
      const ctx = roundContexts.get(round?.round_number ?? 1) ?? base
      const holes = ctx.courseHoles
      const hoyosDeLaRonda = ctx.totalHoyos
      const siAlloc = siDe(ctx)

      // Dos números distintos, a propósito (misma separación que el board):
      // · `courseHcp` REPARTE los golpes — sale del gate por torneo.
      // · `hcp` es el ÍNDICE de skill, y el GWI lo usa para modelar la varianza
      //   del jugador. Ese sigue siendo el índice crudo.
      const hcp       = p.handicap_at_registration ?? (p.profiles?.indice ?? 18)
      const courseHcp = courseHandicapDeScoring({
        mode: ctx.hcp?.mode ?? null,
        player: {
          handicap_at_registration: p.handicap_at_registration ?? hcp,
          tee_id: p.tee_id ?? null,
          categories: p.categories,
          genero: p.genero,
        },
        tournament: { tees: ctx.hcp?.tees ?? null, courses: ctx.hcp?.course ?? null },
        courseTees: ctx.hcp?.courseTees ?? [],
        courseHoles: holes,
        holeCount: hoyosDeLaRonda,
      })
      const holeScores = round?.hole_scores ?? []

      let overUnderGross = 0, overUnderNeto = 0, totalStableford = 0, hoyosCompletados = 0

      for (const hs of holeScores) {
        if (!hs.gross_score) continue
        const hole = holes.find(h => h.numero === hs.hole_number)
        if (!hole) continue
        hoyosCompletados++
        const siHoyo = siAlloc[hole.numero] ?? hole.stroke_index
        overUnderGross  += hs.gross_score - hole.par
        overUnderNeto   += (hs.gross_score - strokesRecibidosEnHoyo(courseHcp, siHoyo, hoyosDeLaRonda)) - hole.par
        totalStableford += puntosStablefordHoyo(hs.gross_score, hole.par, courseHcp, siHoyo, hoyosDeLaRonda)
      }

      const currentScore = formato === 'stableford' ? totalStableford
        : modo === 'neto'  ? overUnderNeto
        : overUnderGross

      // Historical (from batch)
      let historicalAvg: number | null = null
      let historicalRoundsCount = 0

      // Filtrar histórico al mismo tipo de ronda (9 o 18 hoyos). Usa
      // inferHoles para resolver holes_played NULL desde scores.length —
      // mezclar 9h con 18h en el avg contamina el GWI del torneo.
      const targetHoles = hoyosDeLaRonda <= 9 ? 9 : 18
      const allHistRounds = histByUser.get(p.user_id)?.slice(0, 40) ?? []
      const histRounds = allHistRounds.filter(r => {
        const inferred = inferHoles(r as { holes_played?: number | null; scores?: number[] | null })
        return inferred === targetHoles
      }).slice(0, 20)
      if (histRounds.length > 0) {
        historicalRoundsCount = histRounds.length
        const avg = histRounds.reduce((s, r) => s + r.total_gross, 0) / histRounds.length
        // Contra el par de LA RONDA (`parDeLaRondaDelTorneo`): en 9 hoyos, 36
        // y no 72 — antes se usaba `courses.par_total` (18h) también para 9h.
        historicalAvg = Math.round((avg - ctx.parTotal) * 10) / 10
      }

      // Patterns (from batch)
      let patternData: JugadorGWIInput['patterns'] = null
      const pats = patternsByUser.get(p.user_id) ?? []

      if (pats.length > 0) {
        patternData = {}
        for (const pat of pats) {
          if (pat.pattern_type === 'back_nine_collapse') {
            patternData.back9Collapse = { confidence: pat.confidence, avgDiff: pat.metadata?.diff ?? 3 }
          }
        }
      }

      return {
        id:                    p.id,
        nombre:                p.profiles?.name ?? 'Jugador',
        handicapIndex:         hcp,
        currentScore,
        hoyosCompletados,
        modoJuego:             modo,
        formatoJuego:          formato,
        historicalAvg,
        historicalRoundsCount,
        courseAvg:             null,
        courseRoundsCount:     0,
        patterns:              patternData,
      }
    })

    return NextResponse.json({ inputs, totalHoyos, modoJuego: modo, formatoJuego: formato, parTotal })
  } catch (err) {
    void captureError(err, { context: 'api.gwi.torneo', meta: { slug: params.slug } })
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500 })
  }
}
