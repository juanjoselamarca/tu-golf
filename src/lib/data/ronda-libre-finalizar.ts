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
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { ajustarTarjetaParaHistorial, hoyosNoJugadosEstimados, type HoyoEstimado } from '@/golf/core/ajuste-whs'
import { isSharedBallFormat, isTeamFormat } from '@/golf/formats'
import { hoyosNoJugadosDelMatch, resultadoDesdePerspectiva } from '@/golf/formats/match-play'
import { matchDeLaRonda } from '@/golf/ronda-libre/match-de-la-ronda'
import {
  armarTarjetaHistorica,
  filaHistorialRondaLibre,
  type RatingsDelTee,
  type ScoresDeTarjeta,
  type TarjetaHistorica,
} from '@/golf/ronda-libre/tarjeta-historica'
import { teeDelJugador } from '@/golf/ronda-libre/tee-del-jugador'
import { courseHandicapsDeRonda } from '@/lib/data/ronda-libre'
import { cargarHoyosDelScorer } from '@/lib/data/ronda-libre-scorer'
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
  /** PostgREST rechazó el INSERT, o falló una lectura previa (red): `Error`. */
  | { status: 'error'; tarjeta: TarjetaHistorica; error: PostgrestError | Error }

export interface GuardarTarjetaInput {
  ronda: RondaLibre
  jugador: Pick<Jugador, 'id' | 'tees'>
  /** Dueño del historial: siempre quien guarda, y sólo su propia tarjeta (`esMiTarjeta`). */
  userId: string
  /** Golpes de la tarjeta que se guarda (la del equipo en bola compartida). */
  scores: ScoresDeTarjeta
  /** Golpes de TODOS los jugadores (id → hoyo → golpes): el match necesita al rival. */
  scoresPorJugador: Record<string, ScoresDeTarjeta | null | undefined>
  /** Hoyos de la ronda en orden de juego (`hoyosDeLaRonda`). */
  hoyos: readonly number[]
  parMap: Record<number, number>
  ratingsPorTee: RatingsPorTee
  /**
   * `true` devuelve el id de la fila (`.select('id')`) para disparar el coach
   * (plan-outcome, post-round). Desde el 01-oct ambos finalizadores insertan sólo
   * la tarjeta propia (`esMiTarjeta`), así que pedir el id ya no choca con RLS.
   */
  conId: boolean
}

/**
 * Guarda UNA tarjeta en `historical_rounds`. FUENTE ÚNICA para los tres caminos
 * (scorer individual, scorer de grupo y "Guardar en mi historial"), así ninguno
 * se salta un paso: resultado del match y equipo (`contextoDeTarjeta`), ajuste
 * WHS de los hoyos que no se terminaron (concedidos, ganados sin terminar, no
 * jugados tras decidirse el match), tarjeta canónica, ratings, diferencial e
 * INSERT. Idempotente: si la fila ya existe (23505: el jugador la cerró desde su
 * teléfono, o es un reintento) devuelve `duplicada` y la primera queda. No lanza
 * por errores de PostgREST.
 */
export async function guardarTarjetaEnHistorial(
  // Cliente completo: el match resuelve hoyos y course handicaps con las mismas
  // funciones que el scorer (`cargarHoyosDelScorer`, `courseHandicapsDeRonda`).
  supabase: SupabaseClient,
  input: GuardarTarjetaInput,
): Promise<ResultadoGuardarTarjeta> {
  // Nunca lanza: una lectura que falla (red) vuelve como `error` y el que llama
  // ofrece reintentar; un throw dejaba el botón "Guardando…" colgado para siempre.
  try {
    return await guardarTarjeta(supabase, input)
  } catch (e) {
    const tarjeta = armarTarjetaHistorica({ scores: input.scores, hoyos: input.hoyos, roundHoles: input.ronda.holes ?? 18, parMap: input.parMap })
    return { status: 'error', tarjeta, error: e instanceof Error ? e : new Error(String(e)) }
  }
}

async function guardarTarjeta(supabase: SupabaseClient, input: GuardarTarjetaInput): Promise<ResultadoGuardarTarjeta> {
  const { ronda, jugador } = input
  const roundHoles = ronda.holes ?? 18
  const contexto = await contextoDeTarjeta(supabase, {
    ronda, jugadorId: jugador.id, scores: input.scores, scoresPorJugador: input.scoresPorJugador,
    hoyos: input.hoyos, parMap: input.parMap,
  })
  const tarjeta = armarTarjetaHistorica({ scores: contexto.scores, hoyos: input.hoyos, roundHoles, parMap: input.parMap })
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
    hoyosNoJugados: hoyosNoJugadosEstimados(contexto.estimados),
    ratings,
    bolaCompartida: isSharedBallFormat(ronda.formato_juego),
  })
  const fila = filaHistorialRondaLibre({
    ronda, userId: input.userId, jugadorId: jugador.id, tarjeta, tee, ratings, diferencial,
    matchResult: contexto.matchResult, teamName: contexto.teamName, estimados: contexto.estimados,
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

/** SQLSTATE de Postgres: `insufficient_privilege`. Determinista: no se reintenta. */
export const PG_INSUFFICIENT_PRIVILEGE = '42501'

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
    // Sin permiso (42501) es determinista: reintentar no cambia nada. Se
    // reporta de inmediato con los intentos que realmente se hicieron.
    if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
      reportar(error, attempt + 1)
      return false
    }
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

export interface ContextoDeTarjeta {
  /** Golpes listos para el historial (con los hoyos sin terminar ya estimados). */
  scores: ScoresDeTarjeta
  /** "Ganó 3&2" / "Perdió 1 UP" / "Empate" / "Sin terminar (2 UP)"; `null` fuera de match play. */
  matchResult: string | null
  teamName: string | null
  /** Hoyos cuyo score es una estimación WHS (van a `metadata.estimados`). */
  estimados: HoyoEstimado[]
}

/**
 * Lo que la tarjeta necesita de la RONDA y no sólo de los golpes del jugador:
 * el match play (mismo cálculo que el scorer: `matchDeLaRonda` con los hoyos de
 * la vuelta y el course handicap de scoring), el ajuste WHS de los hoyos que no
 * terminó (`ajustarTarjetaParaHistorial`) y el nombre del equipo. Sólo el match
 * play tiene hoyos concedidos: en el resto de formatos la tarjeta pasa tal cual.
 */
export async function contextoDeTarjeta(
  supabase: SupabaseClient,
  input: {
    ronda: RondaLibre
    jugadorId: string
    scores: ScoresDeTarjeta
    scoresPorJugador: Record<string, ScoresDeTarjeta | null | undefined>
    hoyos: readonly number[]
    parMap: Record<number, number>
  },
): Promise<ContextoDeTarjeta> {
  const { ronda, jugadorId, scoresPorJugador, hoyos, parMap } = input
  const teamName = isTeamFormat(ronda.formato_juego)
    ? await fetchNombreDeEquipoDelJugador(supabase, ronda.id, jugadorId)
    : null
  if (ronda.formato_juego !== 'match_play') {
    return { scores: input.scores, matchResult: null, teamName, estimados: [] }
  }

  const { holeDataMap, finalParTotal } = await cargarHoyosDelScorer(supabase, ronda)
  const { courseHcpMap, sinIndice } = await courseHandicapsDeRonda(supabase, ronda, finalParTotal)
  const hoyosConSi = Object.values(holeDataMap).map(h => ({ numero: h.numero, par: h.par, stroke_index: h.stroke_index }))
  const match = matchDeLaRonda({
    ronda, scoresPorJugador: { ...scoresPorJugador, [jugadorId]: input.scores }, hoyos: hoyosConSi,
    courseHcpPorJugador: courseHcpMap, perspectivaId: jugadorId,
  })
  const rival = ronda.ronda_libre_jugadores.find(j => j.id !== jugadorId)
  const ajuste = ajustarTarjetaParaHistorial({
    scores: input.scores,
    hoyos,
    parMap,
    siPorHoyo: normalizedStrokeIndexByHole(hoyosConSi, ronda.holes ?? 18, hoyos),
    courseHcp: sinIndice.has(jugadorId) ? null : (courseHcpMap[jugadorId] ?? 0),
    totalHoyos: ronda.holes ?? 18,
    rival: rival ? { scores: scoresPorJugador[rival.id] ?? {}, courseHcp: courseHcpMap[rival.id] ?? 0 } : null,
    hoyosNoJugados: match ? hoyosNoJugadosDelMatch(match) : [],
  })
  return {
    scores: ajuste.scores,
    matchResult: match ? resultadoDesdePerspectiva(match, 'a') : null,
    teamName,
    estimados: ajuste.estimados,
  }
}

/**
 * Avisa al coach que hay una ronda nueva en el historial (no bloquea): el plan
 * aprende del resultado (plan-outcome, Cerebro v2) y se dispara el análisis
 * post-ronda. Fuente única para los dos finalizadores.
 */
export function avisarAlCoachRondaNueva(historicalRoundId: string, userId: string): void {
  void fetch('/api/coach/plan-outcome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ historical_round_id: historicalRoundId }),
  }).catch(() => {})
  void fetch('/api/coach/post-round-trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roundId: historicalRoundId, userId }),
  }).catch(() => {})
}

/**
 * ¿La tarjeta de este jugador de ronda libre ya está en el historial de quien
 * consulta? Busca por `metadata.ronda_libre_jugador_id` (índice único). La RLS
 * own_rounds sólo deja ver lo propio. `null` si la lectura falló.
 */
export async function tarjetaYaEnMiHistorial(supabase: Client, jugadorId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('historical_rounds')
    .select('id')
    .eq('metadata->>ronda_libre_jugador_id', jugadorId)
    .limit(1)
  if (error) return null
  return (data ?? []).length > 0
}

