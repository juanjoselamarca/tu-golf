import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  strokesRecibidosEnHoyo,
  puntosStablefordHoyo,
} from '@/golf/core/scoring'

import type { JugadorGWIInput } from '@/golf/stats/gwi'

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

export async function GET(
  _req: Request,
  { params }: { params: { codigo: string } }
) {
  try {
    const supabase = await createClient()

    // Fetch ronda
    const { data: ronda } = await supabase
      .from('rondas_libres')
      .select('id, course_name, course_id, holes, modo_juego, ronda_libre_jugadores(id, nombre, user_id, scores, handicap)')
      .eq('codigo', params.codigo)
      .single()

    if (!ronda) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

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

    // Batch: fetch all profiles, historical rounds, and patterns in 3 queries instead of N+1
    const userIds = jugadores.map(j => j.user_id).filter(Boolean) as string[]

    const [{ data: allProfiles }, { data: allHist }, { data: allPatterns }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, indice')
        .in('id', userIds.length > 0 ? userIds : ['']),
      supabase
        .from('historical_rounds')
        .select('user_id, total_gross, course_name, holes_played')
        .in('user_id', userIds.length > 0 ? userIds : [''])
        .not('total_gross', 'is', null)
        .order('played_at', { ascending: false }),
      supabase
        .from('player_patterns')
        .select('user_id, pattern_type, confidence, metadata, status')
        .in('user_id', userIds.length > 0 ? userIds : [''])
        .eq('status', 'active'),
    ])

    const profileByUser = new Map<string, { indice: number | null }>()
    for (const p of (allProfiles ?? [])) {
      profileByUser.set(p.id as string, p as { indice: number | null })
    }

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
    const inputs: JugadorGWIInput[] = jugadores.map((j) => {
      // Compute current score
      const scores = j.scores ?? {}
      let overUnderGross = 0, overUnderNeto = 0, totalStableford = 0
      let hoyosCompletados = 0
      // Priority: 1) handicap stored in ronda_libre_jugadores, 2) profile indice, 3) default 18
      let handicapIndex = j.handicap ?? 18
      if (handicapIndex === 18 && j.user_id) {
        const prof = profileByUser.get(j.user_id)
        if (prof?.indice != null) handicapIndex = prof.indice
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

      // Historical rounds (from batch)
      let historicalAvg: number | null = null
      let historicalRoundsCount = 0
      let courseAvg: number | null = null
      let courseRoundsCount = 0

      if (j.user_id) {
        // Filtrar histórico al mismo tipo de ronda (9 o 18 hoyos)
        const allRounds = histByUser.get(j.user_id)?.slice(0, 60) ?? []
        const rounds = allRounds.filter(r => {
          const h = (r as Record<string, unknown>).holes_played as number | null
          return !h || (totalHoyos <= 9 ? h <= 9 : h >= 18)
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

    return NextResponse.json({ inputs, totalHoyos, modoJuego: modo })
  } catch {
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500 })
  }
}
