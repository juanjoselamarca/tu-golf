import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { calcularScoreRonda } from '@/golf/core/round-score'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import { cargarHoyosDelScorer, type HoyosDelScorer } from '@/lib/data/ronda-libre-scorer'
import { courseHandicapsDeRonda } from '@/lib/data/ronda-libre'
import { captureError } from '@/lib/error-tracking'
import type { CourseData } from '@/golf/core/course-handicap'
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

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Memos POR REQUEST. El feed lista hasta 50 rondas y en un día de torneo muchas
 * se juegan en la misma cancha: sin esto, cada ronda repetía las mismas lecturas
 * de hoyos y de ratings (N+1 en un endpoint público).
 */
interface Memos {
  /** `course_id|recorridos|hoyos` → hoyos de la ronda (par y stroke index). */
  hoyos: Map<string, Promise<HoyosDelScorer>>
  /** Lo arma `courseHandicapsDeRonda` con todo lo que entra a `resolverCourseData`. */
  courseData: Map<string, Promise<CourseData | null>>
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
 * Puntos Stableford de cada jugador con el motor de la vista en vivo
 * (`buildLeaderboard`, que aplica `handicapQueJuega`) y el course handicap por
 * tee del scorer (`courseHandicapsDeRonda`).
 *
 * Antes la ruta repartía golpes con el ÍNDICE redondeado: en 9 hoyos, el doble de
 * golpes (hallazgo 16, prueba de fuego Los Leones 04-oct-2026). El handicap sólo
 * se resuelve en neto — en gross no entra en juego y no cuesta queries.
 */
async function puntosStableford(
  supabase: Supabase,
  ronda: RondaRow,
  rondaScorer: RondaLibre,
  hoyos: HoyosDelScorer,
  memos: Memos,
): Promise<Record<string, number>> {
  const modo = (ronda.modo_juego ?? 'gross') as ModoJuego
  const courseHcpMap = modo === 'neto'
    ? (await courseHandicapsDeRonda(
        supabase,
        { ...rondaScorer, id: ronda.id } as Parameters<typeof courseHandicapsDeRonda>[1],
        hoyos.finalParTotal,
        memos.courseData,
      )).courseHcpMap
    : {}
  const siMap = Object.fromEntries(
    Object.values(hoyos.holeDataMap).map(h => [h.numero, h.stroke_index]),
  ) as Record<number, number>
  const entries = buildLeaderboard({
    jugadores: rondaScorer.ronda_libre_jugadores as unknown as Jugador[],
    holes: rondaScorer.holes,
    hoyoInicio: ronda.hoyo_inicio,
    parMap: hoyos.parMap,
    siMap,
    courseHcpMap,
    modoJuego: modo,
    formatoJuego: 'stableford' as FormatoJuego,
  })
  return Object.fromEntries(entries.map(e => [e.id, e.stablefordPts]))
}

async function rondaDelFeed(supabase: Supabase, ronda: RondaRow, memos: Memos) {
  const totalHoles = ronda.holes ?? 18
  const rondaScorer = rondaParaElScorer(ronda, totalHoles)
  const hoyosRonda = await hoyosDe(supabase, rondaScorer, memos)
  const puntos = ronda.formato_juego === 'stableford'
    ? await puntosStableford(supabase, ronda, rondaScorer, hoyosRonda, memos)
    : {}

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
      vsPar,
      stablefordPts: puntos[j.id] ?? 0,
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
    const memos: Memos = { hoyos: new Map(), courseData: new Map() }

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
