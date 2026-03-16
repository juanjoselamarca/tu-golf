import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  strokesRecibidosEnHoyo,
  puntosStablefordHoyo,
} from '@/lib/scoring'
import type { JugadorGWIInput } from '@/lib/gwi'

interface DBHole { numero: number; par: number; stroke_index: number }
interface DBJugador {
  id: string; nombre: string; user_id: string | null
  scores: Record<string, number>
}
interface DBPattern {
  pattern_type: string; confidence: number; metadata: Record<string, number>; status: string
}

export async function GET(
  _req: Request,
  { params }: { params: { codigo: string } }
) {
  try {
    const supabase = await createClient()

    // Fetch ronda
    const { data: ronda } = await supabase
      .from('rondas_libres')
      .select('id, course_name, course_id, holes, modo_juego, ronda_libre_jugadores(id, nombre, user_id, scores)')
      .eq('codigo', params.codigo)
      .single()

    if (!ronda) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const modo      = (ronda.modo_juego as 'gross' | 'neto' | 'stableford') || 'gross'
    const totalHoyos = ronda.holes ?? 18
    const parTotal   = totalHoyos === 9 ? 36 : 72

    // Fetch course holes if linked
    let holes: DBHole[] = []
    if (ronda.course_id) {
      const { data: ch } = await supabase
        .from('course_holes')
        .select('numero, par, stroke_index')
        .eq('course_id', ronda.course_id)
        .order('numero')
      holes = (ch as DBHole[]) || []
    }
    // Fallback: default holes par 4, stroke_index = numero
    if (holes.length === 0) {
      for (let i = 1; i <= totalHoyos; i++) holes.push({ numero: i, par: 4, stroke_index: i })
    }

    const jugadores = ronda.ronda_libre_jugadores as DBJugador[]

    // Build GWI inputs
    const inputs: JugadorGWIInput[] = await Promise.all(
      jugadores.map(async (j) => {
        // Compute current score
        const scores = j.scores ?? {}
        let overUnderGross = 0, overUnderNeto = 0, totalStableford = 0
        let hoyosCompletados = 0
        let handicapIndex = 18  // default

        // Get handicap from profile if user linked
        if (j.user_id) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('indice')
            .eq('id', j.user_id)
            .single()
          handicapIndex = prof?.indice ?? 18
        }

        for (const h of holes) {
          const gross = scores[String(h.numero)]
          if (!gross) continue
          hoyosCompletados++
          overUnderGross  += gross - h.par
          const strokes    = strokesRecibidosEnHoyo(handicapIndex, h.stroke_index)
          overUnderNeto   += (gross - strokes) - h.par
          totalStableford += puntosStablefordHoyo(gross, h.par, handicapIndex, h.stroke_index)
        }

        const currentScore = modo === 'gross' ? overUnderGross
          : modo === 'neto'  ? overUnderNeto
          : totalStableford

        // Historical rounds
        let historicalAvg: number | null = null
        let historicalRoundsCount = 0
        let courseAvg: number | null = null
        let courseRoundsCount = 0

        if (j.user_id) {
          const { data: rounds } = await supabase
            .from('historical_rounds')
            .select('total_gross, course_name')
            .eq('user_id', j.user_id)
            .not('total_gross', 'is', null)
            .limit(30)

          if (rounds && rounds.length > 0) {
            historicalRoundsCount = rounds.length
            const avgGross = rounds.reduce((s: number, r: { total_gross: number }) => s + r.total_gross, 0) / rounds.length
            historicalAvg = Math.round((avgGross - parTotal) * 10) / 10

            const courseRounds = rounds.filter((r: { course_name: string }) => r.course_name === ronda.course_name)
            if (courseRounds.length > 0) {
              courseRoundsCount = courseRounds.length
              const ca = courseRounds.reduce((s: number, r: { total_gross: number }) => s + r.total_gross, 0) / courseRounds.length
              courseAvg = Math.round((ca - parTotal) * 10) / 10
            }
          }
        }

        // Patterns
        let patternData: JugadorGWIInput['patterns'] = null
        if (j.user_id) {
          const { data: pats } = await supabase
            .from('player_patterns')
            .select('pattern_type, confidence, metadata, status')
            .eq('user_id', j.user_id)
            .eq('status', 'active')

          if (pats && pats.length > 0) {
            patternData = {}
            for (const p of pats as DBPattern[]) {
              if (p.pattern_type === 'back_nine_collapse') {
                patternData.back9Collapse = {
                  confidence: p.confidence,
                  avgDiff:    p.metadata?.diff ?? 3,
                }
              }
              if (p.pattern_type === 'first_hole_anxiety') {
                patternData.postBogeySpiral = { confidence: p.confidence * 0.6 }
              }
            }
          }
        }

        return {
          id:                    j.id,
          nombre:                j.nombre,
          handicapIndex,
          currentScore,
          hoyosCompletados,
          modoJuego:             modo,
          historicalAvg,
          historicalRoundsCount,
          courseAvg,
          courseRoundsCount,
          patterns:              patternData,
        }
      })
    )

    return NextResponse.json({ inputs, totalHoyos, modoJuego: modo })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
