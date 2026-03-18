import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  strokesRecibidosEnHoyo,
  puntosStablefordHoyo,
} from '@/lib/scoring'
import type { JugadorGWIInput } from '@/lib/gwi'

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
      .select('id, name, hole_count, modo_juego, courses(id, par_total)')
      .eq('slug', params.slug)
      .single()

    if (!rawT) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const t = rawT as unknown as {
      id: string; name: string; hole_count: number; modo_juego: string | null
      courses: { id: string; par_total: number } | null
    }

    const modo       = (t.modo_juego as 'gross' | 'neto' | 'stableford') || 'gross'
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
      return NextResponse.json({ inputs: [], totalHoyos, modoJuego: modo })
    }

    const inputs: JugadorGWIInput[] = await Promise.all(
      (rawPlayers as unknown as {
        id: string
        user_id: string
        handicap_at_registration: number | null
        profiles: { name: string; indice: number | null } | null
        rounds: { id: string; total_gross: number; hole_scores: DBHScore[] }[]
      }[]).map(async (p) => {
        const hcp       = p.handicap_at_registration ?? (p.profiles?.indice ?? 18)
        const round     = p.rounds?.[0]
        const holeScores = round?.hole_scores ?? []

        let overUnderGross = 0, overUnderNeto = 0, totalStableford = 0, hoyosCompletados = 0

        for (const hs of holeScores) {
          if (!hs.gross_score) continue
          const hole = holes.find(h => h.numero === hs.hole_number)
          if (!hole) continue
          hoyosCompletados++
          overUnderGross  += hs.gross_score - hole.par
          overUnderNeto   += (hs.gross_score - strokesRecibidosEnHoyo(hcp, hole.stroke_index)) - hole.par
          totalStableford += puntosStablefordHoyo(hs.gross_score, hole.par, hcp, hole.stroke_index)
        }

        const currentScore = modo === 'gross' ? overUnderGross
          : modo === 'neto'  ? overUnderNeto
          : totalStableford

        // Historical
        let historicalAvg: number | null = null
        let historicalRoundsCount = 0

        const { data: histRounds } = await supabase
          .from('historical_rounds')
          .select('total_gross')
          .eq('user_id', p.user_id)
          .not('total_gross', 'is', null)
          .limit(20)

        if (histRounds && histRounds.length > 0) {
          historicalRoundsCount = histRounds.length
          const avg = histRounds.reduce((s: number, r: { total_gross: number }) => s + r.total_gross, 0) / histRounds.length
          historicalAvg = Math.round((avg - parTotal) * 10) / 10
        }

        // Patterns (by player user_id via profiles)
        let patternData: JugadorGWIInput['patterns'] = null
        const { data: pats } = await supabase
          .from('player_patterns')
          .select('pattern_type, confidence, metadata')
          .eq('user_id', p.user_id)
          .eq('status', 'active')

        if (pats && pats.length > 0) {
          patternData = {}
          for (const pat of pats as DBPattern[]) {
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
          historicalAvg,
          historicalRoundsCount,
          courseAvg:             null,
          courseRoundsCount:     0,
          patterns:              patternData,
        }
      })
    )

    return NextResponse.json({ inputs, totalHoyos, modoJuego: modo, parTotal })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
