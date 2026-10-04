// ─── GWI de una ronda libre (servidor) ──────────────────────────────────────
// Extraído de `/api/gwi/ronda-libre/[codigo]` (handler delgado). Arma los inputs
// del GWI — incluidos los privados (historial, patrones) cuando quien pregunta
// participa — calcula el GWI aquí y devuelve SOLO la respuesta pública.

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { parTotalEstandar } from '@/golf/core/round-score'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import {
  construirRespuestaGWI,
  marcadorEnCursoGWI,
  redactarGWIParaPublico,
  type GWIResponse,
  type JugadorGWIInput,
} from '@/golf/stats/gwi'
import { historialGWI, patronesGWI, SIN_HISTORIAL } from '@/golf/stats/gwi-historial'
import { fetchHoyosDeLaRonda } from './course-holes'
import { courseHandicapsDeRonda } from './ronda-libre'
import { fetchDatosPrivadosGWI } from './gwi'

interface DBHole { numero: number; par: number; stroke_index: number }
interface DBJugador {
  id: string; nombre: string; user_id: string | null
  scores: Record<string, number>
  handicap: number | null
}

/** Ventana del historial que mira el GWI de la ronda libre (más reciente primero). */
const VENTANA_HISTORIAL = { revisadas: 60, usadas: 30 } as const

/**
 * GWI de la ronda `codigo` para quien pregunta. `null` = la ronda no existe.
 * Historial y patrones de cada jugador sólo entran al cálculo si quien pregunta
 * participa (creador, admin o jugador con cuenta); igual nunca salen del servidor.
 */
export async function gwiDeRondaLibre(supabase: SupabaseClient, codigo: string): Promise<GWIResponse | null> {
  const { data: ronda } = await supabase
    .from('rondas_libres')
    .select('id, course_name, course_id, tees, holes, hoyo_inicio, modo_juego, formato_juego, creador_id, admin_user_id, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)')
    .eq('codigo', codigo)
    .single()

  if (!ronda) return null

  const modo = ((ronda.modo_juego as ModoJuego | null) || 'gross')
  const formato = ((ronda.formato_juego as FormatoJuego | null) || 'stroke_play')
  const totalHoyos = (ronda.holes as number | null) ?? 18
  const parTotal = parTotalEstandar(totalHoyos)

  // Misma fuente que la vista en vivo (`loadRondaLibre`): resuelve también los
  // complejos de 27 hoyos, donde los hoyos cuelgan de los recorridos hijos.
  const catalogo: DBHole[] = ronda.course_id
    ? ((await fetchHoyosDeLaRonda(supabase, ronda.course_id as string, (ronda.recorridos as string[] | null) ?? null, 'numero, par, stroke_index')) as unknown as DBHole[])
    : []
  // Los hoyos de la RONDA (fuente única `@/golf/courses/vueltas`): cubre la
  // cancha sin catálogo y la de 9 hoyos jugada a 18 (dos vueltas). Sólo los
  // hoyos DE ESTA RONDA (una de 9 desde el 10 juega 10..18).
  const hoyosJugados = hoyosDeLaRonda(ronda.hoyo_inicio as number | null, totalHoyos)
  const jugados = new Set(hoyosJugados)
  const hoyosDeLaCancha = hoyosDeLaVuelta(catalogo, totalHoyos)
  // Par de la CANCHA (no de la ronda): escala del rating para el course handicap.
  const parDeLaCancha = hoyosDeLaCancha.reduce((s, h) => s + h.par, 0)
  const holes = hoyosDeLaCancha.filter(h => jugados.has(h.numero))
  const siAlloc = normalizedStrokeIndexByHole(holes, totalHoyos, hoyosJugados)

  const jugadores = ronda.ronda_libre_jugadores as DBJugador[]

  const { data: { user } } = await supabase.auth.getUser()
  const participa = !!user && (
    ronda.creador_id === user.id ||
    ronda.admin_user_id === user.id ||
    jugadores.some(j => j.user_id === user.id)
  )

  // Índice y course handicap: la MISMA fuente que la vista en vivo. Los golpes se
  // reparten con el course handicap (slope, CR, mitad en 9 hoyos), no con el índice.
  const userIds = jugadores.map(j => j.user_id).filter(Boolean) as string[]
  const [privados, { courseHcpMap, indexByJugador }] = await Promise.all([
    // Al espectador ni siquiera se le consulta: su GWI se calcula "sin historia".
    fetchDatosPrivadosGWI(supabase, participa ? userIds : [], VENTANA_HISTORIAL.revisadas),
    courseHandicapsDeRonda(
      supabase,
      ronda as unknown as Parameters<typeof courseHandicapsDeRonda>[1],
      parDeLaCancha || parTotalEstandar(totalHoyos),
    ),
  ])

  const inputs: JugadorGWIInput[] = jugadores.map((j) => {
    const { overUnderGross, overUnderNeto, totalStableford, hoyosCompletados } = marcadorEnCursoGWI({
      scores: j.scores ?? {},
      hoyos: holes,
      siAlloc,
      courseHcp: courseHcpMap[j.id],
      totalHoyos,
    })
    const currentScore = formato === 'stableford' ? totalStableford
      : modo === 'neto' ? overUnderNeto
      : overUnderGross

    const historial = j.user_id
      ? historialGWI(privados.historialPorUsuario.get(j.user_id) ?? [], {
          totalHoyos, parTotal, ventana: VENTANA_HISTORIAL, cancha: { nombre: ronda.course_name as string | null },
        })
      : SIN_HISTORIAL

    return {
      id: j.id,
      nombre: j.nombre,
      handicapIndex: indexByJugador[j.id],
      currentScore,
      hoyosCompletados,
      modoJuego: modo,
      formatoJuego: formato,
      ...historial,
      patterns: j.user_id ? patronesGWI(privados.patronesPorUsuario.get(j.user_id) ?? []) : null,
    }
  })

  return construirRespuestaGWI(participa ? inputs : redactarGWIParaPublico(inputs), {
    totalHoyos, modoJuego: modo, formatoJuego: formato,
  })
}
