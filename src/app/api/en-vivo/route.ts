import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { calcularScoreRonda } from '@/golf/core/round-score'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { hoyosDeBolaCompartida, isSharedBallFormat, totalesBolaCompartida } from '@/golf/formats'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import { cargarHoyosDelScorer, type HoyosDelScorer } from '@/lib/data/ronda-libre-scorer'
import { fetchEquiposDeRondas } from '@/lib/data/ronda-libre'
import type { Equipo } from '@/app/ronda-libre/[codigo]/types'
import { captureError } from '@/lib/error-tracking'
import type { FormatoJuego, Jugador, RondaLibre } from '@/types/ronda'
import { SITE_URL } from '@/lib/site-url'

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
  created_at: string
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
  /**
   * ronda_id → equipos, leídos en UNA query para las rondas de bola compartida del
   * feed. `null` = esa lectura falló: las rondas de bola compartida salen del feed
   * (aislamiento por ronda) en vez de publicarse vacías como "Thru 0".
   */
  equipos: Map<string, Equipo[]> | null
}

/** Fila del feed: un jugador, o un equipo en scramble/foursome. */
interface FilaEnVivo {
  id: string
  nombre: string
  holesCompleted: number
  totalGross: number
  vsPar: number
  stablefordPts: number | null
  totalHoles: number
}

/**
 * Scramble / foursome: el puntaje vive en `ronda_equipos`, no en los jugadores
 * (que quedan con `scores` vacío toda la ronda). Antes el feed los listaba a
 * ellos: Thru 0 y "sin hoyos" en un scramble que iba en el 7, y el botón
 * "Seguir" del feed no avisaba. Una fila por equipo con el motor de la tarjeta
 * del scorer (`totalesBolaCompartida`) sobre los hoyos de ESTA ronda (10..18 en
 * un 9h desde el 10) con el par del scorer. El push (`buildTeamRoundPlayers`)
 * llega al mismo bruto y vs-par por los standings de equipos.
 */
function filasDeEquipos(formato: 'scramble' | 'foursome', hoyos: readonly number[], hoyosRonda: HoyosDelScorer, equipos: Equipo[], totalHoles: number): FilaEnVivo[] {
  const holes = hoyosDeBolaCompartida(hoyos, hoyosRonda.parMap, hoyosRonda.holeDataMap)
  return equipos.map(eq => {
    const t = totalesBolaCompartida(formato, eq, holes)
    return {
      id: eq.id,
      nombre: eq.nombre,
      holesCompleted: t.holesPlayed,
      totalGross: t.totalGross,
      // Bruto vs par del equipo: el feed nunca publica un neto.
      vsPar: t.overUnderGross,
      stablefordPts: null,
      totalHoles,
    }
  })
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
 * no usa; par y SI no dependen de él. Tampoco lleva `hoyo_inicio` porque
 * `rondaParaElScorer` no lo pasa (los respaldos sin catálogo son par 4 y SI =
 * número de hoyo, iguales para cualquier inicio): si algún día se pasa, hay que
 * sumarlo a la clave o dos rondas sin catálogo con distinto inicio compartirían
 * el memo.
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
  const formato = ronda.formato_juego ?? 'stroke_play'
  if (isSharedBallFormat(formato) && memos.equipos == null) {
    throw new Error('equipos no disponibles: la ronda de bola compartida sale del feed en vez de publicarse vacía')
  }
  const jugadores: FilaEnVivo[] = isSharedBallFormat(formato)
    ? filasDeEquipos(formato, hoyos, hoyosRonda, memos.equipos?.get(ronda.id) ?? [], totalHoles)
    : (ronda.ronda_libre_jugadores ?? []).map(j => {
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
  const totalJugadores = (ronda.ronda_libre_jugadores ?? []).length

  return {
    id: ronda.id,
    codigo: ronda.codigo,
    course_name: ronda.course_name ?? 'Cancha',
    tees: ronda.tees,
    holes: totalHoles,
    fecha: ronda.fecha,
    // Hora real de inicio. `fecha` es un DATE (medianoche UTC = 21:00 del día anterior en Chile):
    // con él, el "Hace Xh" del feed decía "Hace 12h" de una ronda empezada hace minutos.
    inicio: ronda.created_at,
    hoyo_inicio: ronda.hoyo_inicio ?? 1,
    formato_juego: ronda.formato_juego ?? 'stroke_play',
    /** false en Stableford neto: la ronda se muestra con golpes brutos, sin puntos. */
    muestra_puntos: muestraPuntos,
    /** Una fila por jugador; en scramble/foursome una por equipo (el puntaje es del equipo). */
    jugadores,
    maxHolesCompleted: jugadores.reduce((m, j) => Math.max(m, j.holesCompleted), 0),
    /** Personas en la ronda (no filas): en un scramble de 2 equipos sigue siendo 4. */
    totalJugadores,
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
    /** Tope de rondas del feed. Si se alcanza, las más antiguas quedan fuera: `completo: false`. */
    const LIMITE_FEED = 50
    const cutoffEnVivo = new Date(Date.now() - VENTANA_EN_VIVO_HORAS * 3_600_000).toISOString()
    const cutoffDemo = new Date(Date.now() - VENTANA_DEMO_HORAS * 3_600_000).toISOString()

    let query = supabase
      .from('rondas_libres')
      .select(`
        id, codigo, course_name, course_id, tees, holes,
        fecha, created_at, estado, hoyo_inicio, formato_juego, modo_juego, recorridos,
        ronda_libre_jugadores ( id, nombre, user_id, scores, handicap, tees )
      `)
      .eq('estado', 'en_curso')
      .or(`created_at.gte.${cutoffEnVivo},and(es_demo.eq.true,created_at.gte.${cutoffDemo})`)
      .order('created_at', { ascending: false })
      .limit(LIMITE_FEED)

    // El filtro por cancha va en la query y no en memoria: con el `limit`,
    // filtrar después podría dejar fuera rondas de esa cancha que sí existen.
    if (cancha?.trim() && cancha.trim().length >= 2) {
      query = query.ilike('course_name', `%${cancha.trim()}%`)
    }

    const { data, error } = await query
    if (error) throw error

    const rondasRaw = (data ?? []) as unknown as RondaRow[]
    // Equipos sólo de las rondas que los usan, en una query (no una por ronda).
    const idsBolaCompartida = rondasRaw.filter(r => isSharedBallFormat(r.formato_juego ?? 'stroke_play')).map(r => r.id)
    const equipos = await fetchEquiposDeRondas(supabase, idsBolaCompartida).catch(err => {
      void captureError(err, { context: 'api.en-vivo.equipos', level: 'warning', meta: { rondas: idsBolaCompartida.length } })
      return null
    })
    const memos: Memos = { hoyos: new Map(), equipos }

    // Rondas que están en juego pero NO van en `rondas` por un error nuestro. La
    // página borra de "seguidas" (y des-suscribe del push en el servidor) toda
    // ronda que no viene en el feed; sin esta lista, un statement timeout en
    // ronda_equipos dejaría de seguir todos los scramble para siempre.
    const omitidas: string[] = []

    // Aislamiento por ronda: si una falla, se registra y SALE del feed; el resto se
    // muestra. No se publica con un número de relleno (un "0 pts" sería falso).
    const resultados = await Promise.all(rondasRaw.map(async ronda => {
      // Sin equipos por error ya registrado (api.en-vivo.equipos): un solo log, no uno por ronda.
      if (equipos == null && isSharedBallFormat(ronda.formato_juego ?? 'stroke_play')) {
        omitidas.push(ronda.codigo)
        return null
      }
      try {
        return await rondaDelFeed(supabase, ronda, memos)
      } catch (err) {
        void captureError(err, { context: 'api.en-vivo.ronda', level: 'warning', meta: { codigo: ronda.codigo } })
        omitidas.push(ronda.codigo)
        return null
      }
    }))
    const rondas = resultados.filter((r): r is NonNullable<typeof r> => r != null)

    return NextResponse.json({
      rondas,
      total: rondas.length,
      omitidas,
      // false = el feed vino cortado por el tope: hay rondas en juego que no están ni en
      // `rondas` ni en `omitidas`, así que la página no debe des-seguir nada.
      completo: rondasRaw.length < LIMITE_FEED,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Access-Control-Allow-Origin': SITE_URL,
        // Una respuesta parcial no se reparte 30 s desde el CDN a todos los espectadores.
        'Cache-Control': omitidas.length > 0 ? 'no-store' : 'public, s-maxage=10, stale-while-revalidate=20',
      },
    })
  } catch (err) {
    void captureError(err, { context: 'api.en-vivo' })
    return NextResponse.json({ error: 'Error al obtener rondas' }, { status: 500 })
  }
}
