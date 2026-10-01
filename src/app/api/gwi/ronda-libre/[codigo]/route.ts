import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  strokesRecibidosEnHoyo,
  puntosStablefordHoyo,
} from '@/golf/core/scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'

import { redactarGWIParaPublico, type JugadorGWIInput } from '@/golf/stats/gwi'
import { inferHoles } from '@/golf/core/holes'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { courseHandicapsDeRonda } from '@/lib/data/ronda-libre'

// force-dynamic necesario porque createClient() usa cookies().
// Cache-Control headers en la respuesta permiten cache CDN.
export const dynamic = 'force-dynamic'

interface DBHole { numero: number; par: number; stroke_index: number }
interface DBJugador {
  id: string; nombre: string; user_id: string | null
  scores: Record<string, number>
  handicap: number | null
}
interface DBPattern {
  pattern_type: string; confidence: number; metadata: Record<string, number>; status: string
}

export async function GET(_req: Request, props: { params: Promise<{ codigo: string }> }) {
  const params = await props.params
  try {
    const supabase = await createClient()

    // Fetch ronda
    const { data: ronda } = await supabase
      .from('rondas_libres')
      .select('id, course_name, course_id, tees, holes, hoyo_inicio, modo_juego, formato_juego, creador_id, admin_user_id, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)')
      .eq('codigo', params.codigo)
      .single()

    if (!ronda) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const modo      = (ronda.modo_juego as 'gross' | 'neto') || 'gross'
    const formato   = (ronda.formato_juego as 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome') || 'stroke_play'
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
    // Los hoyos de la RONDA (fuente única `@/golf/courses/vueltas`): cubre la
    // cancha sin catálogo y la de 9 hoyos jugada a 18 (dos vueltas).
    // Sólo los hoyos DE ESTA RONDA (una de 9 desde el 10 juega 10..18).
    const hoyosJugados = hoyosDeLaRonda(ronda.hoyo_inicio, totalHoyos)
    const jugados = new Set(hoyosJugados)
    const hoyosDeLaCancha = hoyosDeLaVuelta(holes, totalHoyos)
    // Par de la CANCHA (no de la ronda): escala del rating para el course handicap.
    const parDeLaCancha = hoyosDeLaCancha.reduce((s, h) => s + h.par, 0)
    holes = hoyosDeLaCancha.filter(h => jugados.has(h.numero))

    const jugadores = ronda.ronda_libre_jugadores as DBJugador[]

    // Batch: historical rounds y patterns en 2 queries en vez de N+1 (el índice lo
    // resuelve courseHandicapsDeRonda).
    const userIds = jugadores.map(j => j.user_id).filter(Boolean) as string[]

    const [{ data: allHist }, { data: allPatterns }] = await Promise.all([
      supabase
        .from('historical_rounds')
        .select('user_id, total_gross, course_name, holes_played, scores')
        .in('user_id', userIds.length > 0 ? userIds : [''])
        .not('total_gross', 'is', null)
        .order('played_at', { ascending: false }),
      supabase
        .from('player_patterns')
        .select('user_id, pattern_type, confidence, metadata, status')
        .in('user_id', userIds.length > 0 ? userIds : [''])
        .eq('status', 'active'),
    ])

    const histByUser = new Map<string, { total_gross: number; course_name: string }[]>()
    for (const r of (allHist ?? [])) {
      const uid = r.user_id as string
      if (!histByUser.has(uid)) histByUser.set(uid, [])
      histByUser.get(uid)!.push(r as { total_gross: number; course_name: string })
    }

    const patternsByUser = new Map<string, DBPattern[]>()
    for (const p of (allPatterns ?? [])) {
      const uid = p.user_id as string
      if (!patternsByUser.has(uid)) patternsByUser.set(uid, [])
      patternsByUser.get(uid)!.push(p as unknown as DBPattern)
    }

    // Build GWI inputs
    const { courseHcpMap, indexByJugador } = await courseHandicapsDeRonda(
      supabase,
      ronda as unknown as Parameters<typeof courseHandicapsDeRonda>[1],
      parDeLaCancha || (totalHoyos <= 9 ? 36 : 72),
    )

    const inputs: JugadorGWIInput[] = jugadores.map((j) => {
      // Compute current score
      const scores = j.scores ?? {}
      let overUnderGross = 0, overUnderNeto = 0, totalStableford = 0
      let hoyosCompletados = 0
      // Índice y course handicap: la MISMA fuente que la vista en vivo. Los golpes
      // se reparten con el course handicap (slope, CR, mitad en 9 hoyos), no con el índice.
      const handicapIndex = indexByJugador[j.id] ?? 18
      const courseHcp = courseHcpMap[j.id] ?? Math.round(handicapIndex)

      const siAlloc = normalizedStrokeIndexByHole(holes, totalHoyos, hoyosJugados)
      for (const h of holes) {
        const gross = scores[String(h.numero)]
        if (!gross) continue
        hoyosCompletados++
        const siHoyo     = siAlloc[h.numero] ?? h.stroke_index
        overUnderGross  += gross - h.par
        const strokes    = strokesRecibidosEnHoyo(courseHcp, siHoyo, totalHoyos)
        overUnderNeto   += (gross - strokes) - h.par
        totalStableford += puntosStablefordHoyo(gross, h.par, courseHcp, siHoyo, totalHoyos)
      }

      const currentScore = formato === 'stableford' ? totalStableford
        : modo === 'neto'  ? overUnderNeto
        : overUnderGross

      // Historical rounds (from batch)
      let historicalAvg: number | null = null
      let historicalRoundsCount = 0
      let courseAvg: number | null = null
      let courseRoundsCount = 0

      if (j.user_id) {
        // Filtrar histórico al mismo tipo de ronda (9 o 18 hoyos). Usa
        // inferHoles para resolver holes_played NULL desde scores.length —
        // mezclar 9h con 18h en el avg contamina el GWI.
        const targetHoles = totalHoyos <= 9 ? 9 : 18
        const allRounds = histByUser.get(j.user_id)?.slice(0, 60) ?? []
        const rounds = allRounds.filter(r => {
          const inferred = inferHoles(r as { holes_played?: number | null; scores?: number[] | null })
          return inferred === targetHoles
        }).slice(0, 30)

        if (rounds.length > 0) {
          historicalRoundsCount = rounds.length
          const avgGross = rounds.reduce((s, r) => s + r.total_gross, 0) / rounds.length
          historicalAvg = Math.round((avgGross - parTotal) * 10) / 10

          const courseRounds = rounds.filter(r => r.course_name === ronda.course_name)
          if (courseRounds.length > 0) {
            courseRoundsCount = courseRounds.length
            const ca = courseRounds.reduce((s, r) => s + r.total_gross, 0) / courseRounds.length
            courseAvg = Math.round((ca - parTotal) * 10) / 10
          }
        }
      }

      // Patterns (from batch)
      let patternData: JugadorGWIInput['patterns'] = null
      if (j.user_id) {
        const pats = patternsByUser.get(j.user_id) ?? []

        if (pats.length > 0) {
          patternData = {}
          for (const p of pats) {
            if (p.pattern_type === 'back_nine_collapse') {
              patternData.back9Collapse = {
                confidence: p.confidence,
                avgDiff:    p.metadata?.diff ?? 3,
              }
            }
            if (p.pattern_type === 'post_bogey_spiral') {
              patternData.postBogeySpiral = { confidence: p.confidence }
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
        formatoJuego:          formato,
        historicalAvg,
        historicalRoundsCount,
        courseAvg,
        courseRoundsCount,
        patterns:              patternData,
      }
    })

    // Público para espectadores, pero el historial y los patrones de cada jugador
    // sólo los ve quien participa en la ronda (creador, admin o jugador con cuenta).
    const { data: { user } } = await supabase.auth.getUser()
    const participa = !!user && (
      ronda.creador_id === user.id ||
      ronda.admin_user_id === user.id ||
      jugadores.some(j => j.user_id === user.id)
    )
    return NextResponse.json(
      { inputs: participa ? inputs : redactarGWIParaPublico(inputs), totalHoyos, modoJuego: modo, formatoJuego: formato },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    )
  } catch {
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500 })
  }
}
