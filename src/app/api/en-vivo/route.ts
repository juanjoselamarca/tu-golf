import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { calcularScoreRonda } from '@/golf/core/round-score'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import { cargarHoyosDelScorer, type HoyosDelScorer } from '@/lib/data/ronda-libre-scorer'
import { captureError } from '@/lib/error-tracking'
import type { FormatoJuego, Jugador, RondaLibre } from '@/types/ronda'

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

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Memo POR REQUEST de los hoyos: el feed lista hasta 50 rondas y en un día de
 * torneo muchas se juegan en la misma cancha (sin esto, N+1 en un endpoint público).
 */
interface Memos {
  /** `course_id|recorridos|hoyos` → hoyos de la ronda (par y stroke index). */
  hoyos: Map<string, Promise<HoyosDelScorer>>
}

/**
 * ¿Se publican los puntos Stableford de esta ronda? SÓLO en gross.
 *
 * Decisión de producto (Juanjo, 08-oct-2026), "solo bruto": este feed es público y
 * el CDN lo cachea igual para todos, así que nunca lleva nada neto. En Stableford
 * NETO los puntos no se publican (con ellos y el bruto se deduce el handicap del
 * jugador, y de ahí su índice): la ronda se muestra con golpes brutos.
 */
function publicaPuntos(ronda: RondaRow): boolean {
  return ronda.formato_juego === 'stableford' && ronda.modo_juego !== 'neto'
}

function rondaParaElScorer(ronda: RondaRow, totalHoles: number): RondaLibre {
  return {
    course_id: ronda.course_id,
    recorridos: ronda.recorridos,
    holes: totalHoles,
    tees: ronda.tees,
    ronda_libre_jugadores: (ronda.ronda_libre_jugadores ?? []).map(j => ({ ...j, scores: j.scores ?? {} })),
  } as unknown as RondaLibre
}

/**
 * Par y stroke index de los hoyos DE LA RONDA: la MISMA fuente que el scorer
 * (`cargarHoyosDelScorer`: recorridos de un club de 27 hoyos, cancha de 9 jugada
 * a 18). Un solo par por ronda — el score vs par y los puntos salen de acá.
 *
 * La clave no lleva el tee: el tee sólo elige la columna de yardaje, que el feed
 * no usa; par y SI no dependen de él.
 */
function hoyosDe(supabase: Supabase, ronda: RondaLibre, memos: Memos): Promise<HoyosDelScorer> {
  const clave = `${ronda.course_id ?? '-'}|${((ronda.recorridos as string[] | null) ?? []).join(',')}|${ronda.holes}`
  let p = memos.hoyos.get(clave)
  if (!p) {
    p = cargarHoyosDelScorer(supabase, ronda)
    memos.hoyos.set(clave, p)
  }
  return p
}

/**
 * Puntos Stableford GROSS de cada jugador: el motor de la vista en vivo
 * (`buildLeaderboard`) en modo gross, que no reparte golpes (`handicapQueJuega`).
 * Por eso no hace falta ningún handicap ni índice.
 */
function puntosStablefordGross(ronda: RondaRow, rondaScorer: RondaLibre, hoyos: HoyosDelScorer): Record<string, number> {
  const siMap = Object.fromEntries(
    Object.values(hoyos.holeDataMap).map(h => [h.numero, h.stroke_index]),
  ) as Record<number, number>
  const entries = buildLeaderboard({
    jugadores: rondaScorer.ronda_libre_jugadores as unknown as Jugador[],
    holes: rondaScorer.holes,
    hoyoInicio: ronda.hoyo_inicio,
    parMap: hoyos.parMap,
    siMap,
    courseHcpMap: {},
    modoJuego: 'gross',
    formatoJuego: 'stableford' as FormatoJuego,
  })
  return Object.fromEntries(entries.map(e => [e.id, e.stablefordPts]))
}

async function rondaDelFeed(supabase: Supabase, ronda: RondaRow, memos: Memos) {
  const totalHoles = ronda.holes ?? 18
  const rondaScorer = rondaParaElScorer(ronda, totalHoles)
  const hoyosRonda = await hoyosDe(supabase, rondaScorer, memos)
  const muestraPuntos = publicaPuntos(ronda)
  const puntos = muestraPuntos ? puntosStablefordGross(ronda, rondaScorer, hoyosRonda) : {}

  // Hoyos DE ESTA RONDA: una de 9 desde el 10 juega 10..18, no 1..9.
  const hoyos = hoyosDeLaRonda(ronda.hoyo_inicio, totalHoles)
  const jugadores = (ronda.ronda_libre_jugadores ?? []).map(j => {
    const { gross, vsPar, holesPlayed } = calcularScoreRonda({
      scores: (j.scores ?? {}) as Record<string, number>,
      roundHoles: totalHoles,
      parMap: hoyosRonda.parMap,
      hoyos,
    })
    return {
      id: j.id,
      nombre: j.nombre ?? 'Jugador',
      holesCompleted: holesPlayed,
      totalGross: gross,
      // Score BRUTO vs par: es lo que se publica siempre (nunca un neto).
      vsPar,
      // null = la ronda no publica puntos (no es Stableford, o es Stableford neto).
      stablefordPts: muestraPuntos ? (puntos[j.id] ?? 0) : null,
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
    /** false en Stableford neto: la ronda se muestra con golpes brutos, sin puntos. */
    muestra_puntos: muestraPuntos,
    jugadores,
    maxHolesCompleted: jugadores.reduce((m, j) => Math.max(m, j.holesCompleted), 0),
    totalJugadores: jugadores.length,
  }
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

    // El filtro por cancha va en la query y no en memoria: con el `limit(50)`,
    // filtrar después podría dejar fuera rondas de esa cancha que sí existen.
    if (cancha?.trim() && cancha.trim().length >= 2) {
      query = query.ilike('course_name', `%${cancha.trim()}%`)
    }

    const { data, error } = await query
    if (error) throw error

    const rondasRaw = (data ?? []) as unknown as RondaRow[]
    const memos: Memos = { hoyos: new Map() }

    // Aislamiento por ronda: si una falla, se registra y SALE del feed; el resto se
    // muestra. No se publica con un número de relleno (un "0 pts" sería falso).
    const resultados = await Promise.all(rondasRaw.map(async ronda => {
      try {
        return await rondaDelFeed(supabase, ronda, memos)
      } catch (err) {
        void captureError(err, { context: 'api.en-vivo.ronda', level: 'warning', meta: { codigo: ronda.codigo } })
        return null
      }
    }))
    const rondas = resultados.filter((r): r is NonNullable<typeof r> => r != null)

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
