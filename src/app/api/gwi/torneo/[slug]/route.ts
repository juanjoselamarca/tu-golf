import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  strokesRecibidosEnHoyo,
  puntosStablefordHoyo,
} from '@/golf/core/scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { parTotalEstandar } from '@/golf/core/round-score'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import { inferHoles } from '@/golf/core/holes'

export const dynamic = 'force-dynamic'

interface DBHole   { numero: number; par: number; stroke_index: number }
interface DBHScore { hole_number: number; gross_score: number | null }
interface DBPattern { pattern_type: string; confidence: number; metadata: Record<string, number> }

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = await createClient()

    // Fetch tournament
    const { data: rawT } = await supabase
      .from('tournaments')
      .select('id, name, hole_count, modo_juego, formato_juego, courses(id, par_total)')
      .eq('slug', params.slug)
      .single()

    if (!rawT) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const t = rawT as unknown as {
      id: string; name: string; hole_count: number; modo_juego: string | null; formato_juego: string | null
      courses: { id: string; par_total: number } | null
    }

    const modo       = (t.modo_juego as 'gross' | 'neto') || 'gross'
    const formato    = (t.formato_juego as 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome') || 'stroke_play'
    const totalHoyos = t.hole_count ?? 18
    const parTotal   = t.courses?.par_total ?? (totalHoyos === 9 ? 36 : 72)

    // Course holes
    let holes: DBHole[] = []
    if (t.courses?.id) {
      const { data: ch } = await supabase
        .from('course_holes')
        .select('numero, par, stroke_index')
        .eq('course_id', t.courses.id)
        .order('numero')
      holes = (ch as DBHole[]) || []
    }
    if (holes.length === 0) {
      for (let i = 1; i <= totalHoyos; i++) holes.push({ numero: i, par: 4, stroke_index: i })
    }

    // Players with rounds
    const { data: rawPlayers } = await supabase
      .from('players')
      .select(`
        id, user_id, handicap_at_registration,
        profiles(name, indice),
        rounds(id, status, total_gross, total_net, total_points,
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
      profiles: { name: string; indice: number | null } | null
      rounds: { id: string; total_gross: number; hole_scores: DBHScore[] }[]
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
      const hcp       = p.handicap_at_registration ?? (p.profiles?.indice ?? 18)
      const round     = p.rounds?.[0]
      const holeScores = round?.hole_scores ?? []

      let overUnderGross = 0, overUnderNeto = 0, totalStableford = 0, hoyosCompletados = 0
      // SI normalizado sobre los hoyos del round (idempotente). `totalHoyos` evita
      // rankear sobre 18 cuando la cancha tiene 18 filas pero el torneo es de 9h.
      const siAlloc = normalizedStrokeIndexByHole(holes, totalHoyos)

      for (const hs of holeScores) {
        if (!hs.gross_score) continue
        const hole = holes.find(h => h.numero === hs.hole_number)
        if (!hole) continue
        hoyosCompletados++
        const siHoyo = siAlloc[hole.numero] ?? hole.stroke_index
        overUnderGross  += hs.gross_score - hole.par
        overUnderNeto   += (hs.gross_score - strokesRecibidosEnHoyo(hcp, siHoyo, totalHoyos)) - hole.par
        totalStableford += puntosStablefordHoyo(hs.gross_score, hole.par, hcp, siHoyo, totalHoyos)
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
      const targetHoles = totalHoyos <= 9 ? 9 : 18
      const allHistRounds = histByUser.get(p.user_id)?.slice(0, 40) ?? []
      const histRounds = allHistRounds.filter(r => {
        const inferred = inferHoles(r as { holes_played?: number | null; scores?: number[] | null })
        return inferred === targetHoles
      }).slice(0, 20)
      if (histRounds.length > 0) {
        historicalRoundsCount = histRounds.length
        const avg = histRounds.reduce((s, r) => s + r.total_gross, 0) / histRounds.length
        historicalAvg = Math.round((avg - parTotal) * 10) / 10
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
    console.error('[GWI/torneo] Error interno:', err)
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500 })
  }
}
