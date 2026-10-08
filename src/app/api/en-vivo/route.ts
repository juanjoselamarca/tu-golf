import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { calcularScoreRonda } from '@/golf/core/round-score'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import { cargarHoyosDelScorer } from '@/lib/data/ronda-libre-scorer'
import { courseHandicapsDeRonda } from '@/lib/data/ronda-libre'
import { captureError } from '@/lib/error-tracking'
import type { FormatoJuego, Jugador, ModoJuego, RondaLibre } from '@/types/ronda'

// force-dynamic necesario porque createClient() usa cookies().
// El cache se maneja vía Cache-Control headers (s-maxage=10) que Vercel CDN respeta.
export const dynamic = 'force-dynamic'

type RondaRow = {
  id: string
  codigo: string
  course_name: string | null
  course_id: string | null
  tees: string | null
  holes: number | null
  fecha: string
  hoyo_inicio: number | null
  formato_juego: string | null
  modo_juego: string | null
  recorridos: string[] | null
  ronda_libre_jugadores: Array<{
    id: string
    nombre: string | null
    user_id: string | null
    scores: Record<string, number> | null
    handicap: number | null
    tees: string | null
  }> | null
}

/**
 * Puntos Stableford de cada jugador, con la MISMA cadena que el scorer y la vista
 * en vivo: hoyos de la ronda (`cargarHoyosDelScorer`: recorridos de 27 hoyos y
 * cancha de 9 jugada a 18), course handicap por tee (`courseHandicapsDeRonda`) y
 * el motor del leaderboard (`buildLeaderboard`, que aplica `handicapQueJuega`).
 *
 * Antes la ruta repartía golpes con el ÍNDICE redondeado: en 9 hoyos, el doble de
 * golpes (hallazgo 16, prueba de fuego Los Leones 04-oct-2026). El handicap sólo
 * se resuelve en neto — en gross no entra en juego y no cuesta queries.
 */
async function puntosStablefordDeRonda(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ronda: RondaRow,
  totalHoles: number,
): Promise<Record<string, number>> {
  const rondaParaHoyos = {
    course_id: ronda.course_id,
    recorridos: ronda.recorridos,
    holes: totalHoles,
    tees: ronda.tees,
    ronda_libre_jugadores: (ronda.ronda_libre_jugadores ?? []).map(j => ({ ...j, scores: j.scores ?? {} })),
  } as unknown as RondaLibre
  const hoyos = await cargarHoyosDelScorer(supabase, rondaParaHoyos)
  const modo = (ronda.modo_juego ?? 'gross') as ModoJuego
  const courseHcpMap = modo === 'neto'
    ? (await courseHandicapsDeRonda(supabase, { ...rondaParaHoyos, id: ronda.id } as Parameters<typeof courseHandicapsDeRonda>[1], hoyos.finalParTotal)).courseHcpMap
    : {}
  const siMap = Object.fromEntries(
    Object.values(hoyos.holeDataMap).map(h => [h.numero, h.stroke_index]),
  ) as Record<number, number>
  const entries = buildLeaderboard({
    jugadores: rondaParaHoyos.ronda_libre_jugadores as unknown as Jugador[],
    holes: totalHoles,
    hoyoInicio: ronda.hoyo_inicio,
    parMap: hoyos.parMap,
    siMap,
    courseHcpMap,
    modoJuego: modo,
    formatoJuego: 'stableford' as FormatoJuego,
  })
  return Object.fromEntries(entries.map(e => [e.id, e.stablefordPts]))
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const cancha = searchParams.get('cancha')

    // "En vivo" = ronda en curso CON actividad reciente. Sin esto, una ronda que
    // nunca se finalizó queda en el feed público para siempre (visto: ronda de 7
    // días atrás listada como "1 ACTIVA"). rondas_libres no tiene updated_at, así
    // que usamos created_at como cota de frescura.
    // Demo rounds also expire (72h) — stale demos from weeks ago showing "Hace 974h"
    // as live rounds is worse than showing the empty state.
    const VENTANA_EN_VIVO_HORAS = 6
    const VENTANA_DEMO_HORAS = 72
    const cutoffEnVivo = new Date(Date.now() - VENTANA_EN_VIVO_HORAS * 3_600_000).toISOString()
    const cutoffDemo = new Date(Date.now() - VENTANA_DEMO_HORAS * 3_600_000).toISOString()

    let query = supabase
      .from('rondas_libres')
      .select(`
        id, codigo, course_name, course_id, tees, holes,
        fecha, estado, hoyo_inicio, formato_juego, modo_juego, recorridos,
        ronda_libre_jugadores ( id, nombre, user_id, scores, handicap, tees )
      `)
      .eq('estado', 'en_curso')
      .or(`created_at.gte.${cutoffEnVivo},and(es_demo.eq.true,created_at.gte.${cutoffDemo})`)
      .order('fecha', { ascending: false })
      .limit(50)

    if (cancha?.trim() && cancha.trim().length >= 2) {
      query = query.ilike('course_name', `%${cancha.trim()}%`)
    }

    const { data, error } = await query
    if (error) throw error

    const rondasRaw = (data ?? []) as unknown as RondaRow[]

    // Batch fetch course_holes for every ronda que tenga course_id (1 query)
    const courseIds = Array.from(
      new Set(rondasRaw.map(r => r.course_id).filter((id): id is string => !!id))
    )

    const parMapByCourse = new Map<string, Record<number, number>>()
    if (courseIds.length > 0) {
      const { data: holesData } = await supabase
        .from('course_holes')
        .select('course_id, numero, par')
        .in('course_id', courseIds)

      for (const row of (holesData ?? []) as Array<{ course_id: string; numero: number; par: number }>) {
        const pMap = parMapByCourse.get(row.course_id) ?? {}
        pMap[row.numero] = row.par
        parMapByCourse.set(row.course_id, pMap)
      }
    }

    const rondas = await Promise.all(rondasRaw.map(async ronda => {
      const totalHoles = ronda.holes ?? 18
      // parMap: si el curso no tiene datos cargados, fallback par 4 por hoyo
      const parMap: Record<number, number> =
        (ronda.course_id && parMapByCourse.get(ronda.course_id)) || {}
      if (Object.keys(parMap).length === 0) {
        for (let i = 1; i <= totalHoles; i++) parMap[i] = 4
      }
      const isStableford = ronda.formato_juego === 'stableford'
      const puntos = isStableford ? await puntosStablefordDeRonda(supabase, ronda, totalHoles) : {}

      // Hoyos DE ESTA RONDA: una de 9 desde el 10 juega 10..18, no 1..9.
      const hoyos = hoyosDeLaRonda(ronda.hoyo_inicio, totalHoles)
      const jugadores = (ronda.ronda_libre_jugadores ?? []).map(j => {
        const scores = (j.scores ?? {}) as Record<string, number>
        const { gross, vsPar, holesPlayed } = calcularScoreRonda({
          scores,
          roundHoles: totalHoles,
          parMap,
          hoyos,
        })
        const stablefordPts = puntos[j.id] ?? 0
        return {
          id: j.id,
          nombre: j.nombre ?? 'Jugador',
          holesCompleted: holesPlayed,
          totalGross: gross,
          vsPar,
          stablefordPts,
          totalHoles,
        }
      })

      return {
        id: ronda.id,
        codigo: ronda.codigo,
        course_name: ronda.course_name ?? 'Cancha',
        tees: ronda.tees,
        holes: totalHoles,
        fecha: ronda.fecha,
        hoyo_inicio: ronda.hoyo_inicio ?? 1,
        formato_juego: ronda.formato_juego ?? 'stroke_play',
        jugadores,
        maxHolesCompleted: jugadores.reduce((m, j) => Math.max(m, j.holesCompleted), 0),
        totalJugadores: jugadores.length,
      }
    }))

    const corsOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'

    return NextResponse.json({
      rondas,
      total: rondas.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
      },
    })
  } catch (err) {
    void captureError(err, { context: 'api.en-vivo' })
    return NextResponse.json({ error: 'Error al obtener rondas' }, { status: 500 })
  }
}
