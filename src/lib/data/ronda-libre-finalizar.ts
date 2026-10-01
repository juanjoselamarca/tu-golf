// ─── Capa de datos — cierre de una ronda libre (historial, índice, nivel) ───
//
// Lo que los dos finalizadores (`score/hooks/useFinalizeRonda` y
// `score-grupo/hooks/useFinalizeGrupo`) necesitan leer y escribir al cerrar
// una ronda, en UN solo lugar. Antes cada uno tenía su copia de: el guard de
// "¿ya está finalizada?", la búsqueda de ratings del tee (con fallback a la
// cancha y rating de 9 de la mitad jugada), el INSERT en `historical_rounds`
// (con su idempotencia por 23505) y el recálculo de índice y nivel.
//
// Cerrar la ronda en sí (`finalizarRondaLibre`) y descartarla
// (`descartarRondaLibre`) siguen en `ronda-libre-scores.ts` /
// `ronda-libre-cierre.ts`: son los únicos caminos que empujan el push.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { calcularNivel, diferencialDeTarjeta } from '@/lib/indice-golfers'
import { mitadJugada } from '@/golf/core/hoyos-jugados'
import { ratingsPublicadosDe9 } from '@/golf/core/course-handicap'
import { isSharedBallFormat } from '@/golf/formats'
import {
  armarTarjetaHistorica,
  filaHistorialRondaLibre,
  type RatingsDelTee,
  type ScoresDeTarjeta,
  type TarjetaHistorica,
} from '@/golf/ronda-libre/tarjeta-historica'
import { teeDelJugador } from '@/golf/ronda-libre/tee-del-jugador'
import { fetchHoyosDeLaRonda } from '@/lib/data/course-holes'
import type { Jugador, RondaLibre } from '@/types/ronda'

type Client = Pick<SupabaseClient, 'from' | 'rpc'>

/** Estado actual de la ronda (guard contra un cierre desde otro dispositivo). */
export async function fetchEstadoRondaLibre(supabase: Client, codigo: string): Promise<string | null> {
  const { data } = await supabase.from('rondas_libres').select('estado').eq('codigo', codigo).single()
  return (data?.estado as string | undefined) ?? null
}

/** Estado + tarjetas frescas de todos los jugadores (¿terminaron todos?). */
export async function fetchRondaParaCierre(
  supabase: Client,
  codigo: string,
): Promise<{ estado: string | null; jugadores: Array<{ id: string; scores: Record<string, number> | null }> } | null> {
  const { data } = await supabase
    .from('rondas_libres')
    .select('estado, ronda_libre_jugadores(id, scores)')
    .eq('codigo', codigo)
    .single()
  if (!data) return null
  return {
    estado: (data.estado as string | undefined) ?? null,
    jugadores: ((data.ronda_libre_jugadores ?? []) as Array<{ id: string; scores: Record<string, number> | null }>),
  }
}

/**
 * CR y slope del tee jugado. Primero el tee (`course_tees`, más preciso), y
 * si no publica rating/slope, los de la cancha. El rating de 9 es el de la
 * MITAD jugada (back 9 → back_*); un shotgun que cruza no tiene rating de 9.
 * Sin `courseId` o sin tee no hay nada que buscar.
 */
export async function fetchRatingsDelTee(
  supabase: Client,
  courseId: string | null | undefined,
  tee: string | null | undefined,
  hoyos: readonly number[],
): Promise<RatingsDelTee> {
  let slope: number | null = null
  let cr: number | null = null
  let nineHole: RatingsDelTee['nineHole'] = null
  if (!courseId) return { slope, cr, nineHole }

  if (tee) {
    const { data: teeData } = await supabase
      .from('course_tees')
      .select('rating, slope, front_course_rating, front_slope_rating, back_course_rating, back_slope_rating')
      .eq('course_id', courseId)
      .ilike('nombre', `${tee}%`)
      .limit(1)
      .single()
    if (teeData?.rating && teeData?.slope) { cr = teeData.rating; slope = teeData.slope }
    const mitad = mitadJugada(hoyos)
    if (mitad) nineHole = ratingsPublicadosDe9(teeData, mitad)
  }
  if (!slope || !cr) {
    const { data: cd } = await supabase.from('courses').select('slope_rating, course_rating').eq('id', courseId).single()
    slope = slope ?? cd?.slope_rating ?? null
    cr = cr ?? cd?.course_rating ?? null
  }
  return { slope, cr, nineHole }
}

/** Cache de ratings por tee para una misma finalización (varios jugadores, mismo tee). */
export type RatingsPorTee = Map<string, RatingsDelTee>

export type ResultadoGuardarTarjeta =
  | { status: 'sin_hoyos'; tarjeta: TarjetaHistorica }
  | { status: 'insertada'; tarjeta: TarjetaHistorica; id: string | null }
  | { status: 'duplicada'; tarjeta: TarjetaHistorica }
  | { status: 'error'; tarjeta: TarjetaHistorica; error: PostgrestError }

export interface GuardarTarjetaInput {
  ronda: Pick<RondaLibre, 'course_name' | 'course_id' | 'fecha' | 'formato_juego' | 'modo_juego' | 'holes' | 'hoyo_inicio' | 'tees'>
  jugador: Pick<Jugador, 'id' | 'tees'>
  /** Dueño del historial: el jugador si tiene cuenta, si no la sesión que anota por él. */
  userId: string
  scores: ScoresDeTarjeta
  /** Hoyos de la ronda en orden de juego (`hoyosDeLaRonda`). */
  hoyos: readonly number[]
  parMap: Record<number, number>
  ratingsPorTee: RatingsPorTee
  matchResult?: string | null
  teamName?: string | null
  /**
   * `true` devuelve el id de la fila (`.select('id')`) — lo necesita el scorer
   * individual para disparar el coach. El scorer de grupo inserta tarjetas de
   * OTROS usuarios: pedir el id ahí podría tropezar con RLS, así que no lo pide.
   */
  conId: boolean
}

/**
 * Guarda UNA tarjeta en `historical_rounds`: arma la tarjeta canónica, resuelve
 * ratings y diferencial, inserta. Idempotente: si la fila ya existe (23505:
 * el jugador la cerró desde su teléfono, o es un reintento) devuelve
 * `duplicada` y la primera queda. No lanza por errores de PostgREST.
 */
export async function guardarTarjetaEnHistorial(
  supabase: Client,
  input: GuardarTarjetaInput,
): Promise<ResultadoGuardarTarjeta> {
  const { ronda, jugador } = input
  const roundHoles = ronda.holes ?? 18
  const tarjeta = armarTarjetaHistorica({ scores: input.scores, hoyos: input.hoyos, roundHoles, parMap: input.parMap })
  if (tarjeta.holesPlayed === 0) return { status: 'sin_hoyos', tarjeta }

  const tee = teeDelJugador(jugador, ronda)
  let ratings = input.ratingsPorTee.get(tee)
  if (!ratings) {
    ratings = await fetchRatingsDelTee(supabase, ronda.course_id, tee, input.hoyos)
    input.ratingsPorTee.set(tee, ratings)
  }
  const diferencial = diferencialDeTarjeta({
    totalGross: tarjeta.totalGross,
    holesPlayed: tarjeta.holesPlayed,
    ratings,
    bolaCompartida: isSharedBallFormat(ronda.formato_juego),
  })
  const fila = filaHistorialRondaLibre({
    ronda, userId: input.userId, jugadorId: jugador.id, tarjeta, tee, ratings, diferencial,
    matchResult: input.matchResult, teamName: input.teamName,
  })

  if (input.conId) {
    const { data, error } = await supabase.from('historical_rounds').insert(fila).select('id').single()
    if (error?.code === '23505') return { status: 'duplicada', tarjeta }
    if (error) return { status: 'error', tarjeta, error }
    return { status: 'insertada', tarjeta, id: (data?.id as string | undefined) ?? null }
  }
  const { error } = await supabase.from('historical_rounds').insert(fila)
  if (error?.code === '23505') return { status: 'duplicada', tarjeta }
  if (error) return { status: 'error', tarjeta, error }
  return { status: 'insertada', tarjeta, id: null }
}

/** Índice actual del perfil (para el toast "tu índice bajó/subió"). */
export async function fetchIndiceDeUsuario(supabase: Client, userId: string): Promise<number | null> {
  const { data } = await supabase.from('profiles').select('indice').eq('id', userId).single()
  const v = data?.indice as number | null | undefined
  return v ?? null
}

export interface RecalcularIndiceOptions {
  /** Intentos en total (backoff 1s, 2s, …). Default 1. */
  reintentos?: number
  context?: string
  level?: 'error' | 'warning'
  /** Se suma a `{ historicalUserId, attempts }`. */
  meta?: Record<string, unknown>
}

/**
 * Recalcula el Índice Golfers+ (RPC `calcular_indice_golfers`). Con
 * `reintentos` > 1 reintenta con backoff exponencial (1s, 2s, …) y reporta
 * sólo si agota los intentos. Devuelve si alguna llamada tuvo éxito.
 *
 * El RPC es SECURITY DEFINER sin `EXCEPTION WHEN OTHERS`: sus errores llegan
 * acá y se reportan siempre, nunca se tragan.
 */
export async function recalcularIndiceGolfers(
  supabase: Client,
  userId: string,
  opts: RecalcularIndiceOptions = {},
): Promise<boolean> {
  const reintentos = Math.max(1, opts.reintentos ?? 1)
  const reportar = (error: PostgrestError, attempts: number) => {
    void captureError(error, {
      context: opts.context ?? 'finalize-ronda.calcular_indice_golfers',
      level: opts.level ?? 'error',
      meta: { historicalUserId: userId, attempts, ...(opts.meta ?? {}) },
    })
  }
  for (let attempt = 0; attempt < reintentos; attempt++) {
    const { error } = await supabase.rpc('calcular_indice_golfers', { p_user_id: userId })
    if (!error) return true
    if (attempt < reintentos - 1) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    } else {
      reportar(error, reintentos)
    }
  }
  return false
}

/**
 * Nivel del jugador = rondas de los últimos 90 días (`calcularNivel`), con
 * vigencia de 60 días. Los finalizadores lo disparan sin esperar.
 */
export async function actualizarNivelDelJugador(supabase: Client, userId: string): Promise<void> {
  const hace90 = new Date()
  hace90.setDate(hace90.getDate() - 90)
  const { count } = await supabase
    .from('historical_rounds')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('played_at', hace90.toISOString())
  const nivel = calcularNivel(count ?? 0)
  const expira = new Date()
  expira.setDate(expira.getDate() + 60)
  await supabase.from('profiles').update({
    nivel,
    nivel_updated_at: new Date().toISOString(),
    nivel_expires_at: expira.toISOString(),
  }).eq('id', userId)
}

/** Nombre del equipo del jugador en una ronda por equipos (va a `team_name`). */
export async function fetchNombreDeEquipoDelJugador(
  supabase: Client,
  rondaId: string,
  jugadorId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('ronda_equipo_jugadores')
    .select('ronda_equipos!inner(nombre)')
    .eq('jugador_id', jugadorId)
    .eq('ronda_equipos.ronda_id', rondaId)
    .limit(1)
    .single()
  const eq = data ? (data as Record<string, unknown>).ronda_equipos as { nombre?: string } | null : null
  return eq?.nombre ?? null
}

/**
 * Hoyos (número, par, SI) de la cancha para calcular el resultado del match
 * play al cerrar. Fuente única `fetchHoyosDeLaRonda`: la query inline que
 * había miraba sólo `course_id` y en un complejo de 27 hoyos devolvía 0 filas.
 */
export async function fetchHoyosParaMatchResult(
  supabase: Client,
  courseId: string,
  recorridos: string[] | null | undefined,
): Promise<Array<{ numero: number; par: number; stroke_index: number }>> {
  const holes = await fetchHoyosDeLaRonda(supabase, courseId, recorridos, 'numero, par, stroke_index')
  return holes.map(h => ({ numero: h.numero, par: h.par, stroke_index: h.stroke_index as number }))
}
