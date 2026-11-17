// src/lib/data/tournaments/editarHandicapInscrito.ts
//
// El organizador corrige el hándicap inscrito de un jugador (`players.handicap_at_registration`)
// desde Scoring → Resumen, antes o DESPUÉS de iniciar el torneo (decisión de producto 16-nov-2026:
// un jugador sin índice inicia con aviso y se corrige en juego). Con el torneo iniciado, el inicio
// derivó de ese número la fila de su tarjeta de grupo y, en scramble/foursome, el hándicap de su
// equipo: la corrección tiene que llegar a los tres, en una transacción.
//
//   leer → `planDeEdicion` (puro: lo MISMO que calcula el inicio) → RPC `editar_handicap_inscrito`
//
// La RPC solo escribe, con control optimista (re-verifica cada hándicap que el plan leyó). Si otro
// cambio llegó entre la lectura y la escritura, relee y replanifica (máx. 3); si lo que cambió es
// el hándicap del propio editado, es otro organizador corrigiéndolo: 'conflicto' y el panel recarga.
//
// Después de escribir se relee una vez más: si un inicio en paralelo enlazó la tarjeta o armó el
// equipo entre la lectura y la escritura, la estructura cambió y se vuelve a planificar con el
// valor ya escrito (la otra mitad de la carrera la cierra el inicio: relee los hándicaps antes de
// poner el torneo en juego).
//
// Hoyos ya jugados: NO se reescriben. `hole_scores.net_score`, `hole_scores.points` y
// `rounds.total_net`/`total_points` SÍ están persistidos (los escribe /api/game al anotar) y quedan
// con el hándicap viejo. Quien muestra el neto con detalle por hoyo lo DERIVA de los brutos con el
// hándicap actual (`build-from-legacy.ts`, rama con hoyos), así que el board, el Resumen y la tarjeta
// del grupo (`ronda_libre_jugadores.scores` es bruto) quedan bien. Solo la rama sin detalle por hoyo
// de `build-from-legacy` (rondas legadas) usa `total_net` almacenado.

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { isSharedBallFormat, resolveFormatoJuego } from '@/golf/formats'
import { filaDeHandicapDeTorneo } from '@/golf/ronda-libre/handicap-tarjeta-de-torneo'
import { leerHandicapDeEquipo } from '@/lib/draft/team-config-legacy'
import { fetchRoundPlayConfig } from './rounds'
import {
  fetchContextoHcpDeEquipos,
  START_PLAYER_SELECT,
  type ContextoHcpDeEquipos,
  type StartPlayer,
  type StartTournamentInfo,
} from './startTournament'
import { handicapsDeEquipoDelGrupo, isProducerTeamFormat } from './teamRounds'

/** Columnas de `tournaments` que necesita la edición (auth, rango, formato y contexto del equipo). */
export const TORNEO_PARA_EDITAR_SELECT =
  'id, organizer_id, status, format, formato_juego, modo_juego, hcp_pct, course_id, course_name, tees, ' +
  'hole_count, date_start, total_rounds, team_config, hcp_calc_mode, ' +
  'courses(nombre, slope_rating, course_rating, par_total)'

export interface TorneoParaEditar extends StartTournamentInfo {
  id: string
  organizer_id: string
  status: string
  course_id: string | null
  hole_count: number | null
  date_start: string | null
  total_rounds: number | null
  courses: {
    nombre?: string
    slope_rating: number | null
    course_rating: number | null
    par_total: number | null
  } | null
}

/** Lo que la edición lee del torneo en juego para planificar. */
export interface LecturaDeEdicion {
  editado: StartPlayer
  /** Su fila en la tarjeta del grupo (`tournament_group_players.jugador_ronda_id`), si el grupo ya se armó. */
  jugadorRondaId: string | null
  /** Su equipo materializado (scramble/foursome), con los miembros en el orden del inicio. */
  equipo: { id: string; miembros: StartPlayer[] } | null
}

/** Los argumentos de la RPC `editar_handicap_inscrito` (formato exacto: ver su migración). */
export interface PlanDeEdicion {
  p_player_id: string
  p_esperado: number | null
  p_valor: number
  p_tocar_tarjeta: boolean
  p_handicap_tarjeta: number | null
  p_base: Array<{ player_id: string; esperado: number | null }>
  p_equipos: Array<{ equipo_id: string; handicap_equipo: number | null; handicap_equipo_juego: number | null }>
}

/**
 * Qué escribe la corrección. PURA y con las MISMAS funciones que el inicio del torneo
 * (`materializeGroupScorecard`), para que corregir y haber inscrito bien desde el principio
 * den la misma tarjeta y el mismo equipo:
 *  - fila de la tarjeta: `filaDeHandicapDeTorneo`. Si devuelve `{}` (raw, individual con cuenta: la
 *    tarjeta toma el índice del perfil, lo inscrito es un course handicap) o el grupo no tiene
 *    tarjeta todavía, no se toca la tarjeta.
 *  - equipo: solo bola compartida, `handicapsDeEquipoDelGrupo` sobre los miembros materializados.
 *
 * `contexto` es obligatorio si hay equipo de bola compartida. Devuelve `{ error }` si el equipo no
 * tiene hándicap calculable (el inicio tampoco arma un equipo que puntuaría con 0 golpes).
 */
export function planDeEdicion(args: {
  torneo: Pick<TorneoParaEditar, 'format' | 'formato_juego' | 'hcp_calc_mode' | 'team_config'>
  lectura: LecturaDeEdicion
  esperado: number | null
  valor: number
  contexto: { hcp: ContextoHcpDeEquipos; holeCount: number } | null
}): PlanDeEdicion | { error: 'equipo-sin-contexto' | 'equipo-incalculable' } {
  const { torneo, lectura, esperado, valor, contexto } = args
  const formato = resolveFormatoJuego(torneo)
  const corregido: StartPlayer = { ...lectura.editado, handicap_at_registration: valor }

  // raw, individual con cuenta → `{}`: la tarjeta toma el índice del perfil y escribir lo inscrito
  // (un course handicap) lo convertiría dos veces. Decidido: no se toca; la tarjeta raw es el #809.
  const fila = filaDeHandicapDeTorneo(corregido, torneo.hcp_calc_mode, isProducerTeamFormat(formato))
  const tocarTarjeta = lectura.jugadorRondaId != null && 'handicap' in fila

  const plan: PlanDeEdicion = {
    p_player_id: lectura.editado.id,
    p_esperado: esperado,
    p_valor: valor,
    p_tocar_tarjeta: tocarTarjeta,
    p_handicap_tarjeta: tocarTarjeta && 'handicap' in fila ? fila.handicap : null,
    p_base: [],
    p_equipos: [],
  }

  if (lectura.equipo && isSharedBallFormat(formato)) {
    if (!contexto) return { error: 'equipo-sin-contexto' }
    const miembros = lectura.equipo.miembros.map((m) => (m.id === corregido.id ? corregido : m))
    const hcp = handicapsDeEquipoDelGrupo({
      formato,
      members: miembros,
      handicap: leerHandicapDeEquipo(torneo.team_config),
      ctx: contexto.hcp.ctx,
      parTotal: contexto.hcp.parTotal,
      holeCount: contexto.holeCount,
      parDe18Hoyos: contexto.hcp.parDe18Hoyos,
    })
    if (hcp.completo === null) return { error: 'equipo-incalculable' }
    plan.p_base = lectura.equipo.miembros
      .filter((m) => m.id !== corregido.id)
      .map((m) => ({ player_id: m.id, esperado: m.handicap_at_registration ?? null }))
    plan.p_equipos = [{ equipo_id: lectura.equipo.id, handicap_equipo: hcp.completo, handicap_equipo_juego: hcp.juego }]
  }
  return plan
}

/** Lo que define QUÉ escribe la corrección (no con qué número): si cambia, hay que replanificar. */
export function estructuraDeEdicion(lectura: LecturaDeEdicion): string {
  const miembros = lectura.equipo?.miembros.map((m) => m.id).join(',') ?? ''
  return `${lectura.jugadorRondaId ?? ''}|${lectura.equipo?.id ?? ''}|${miembros}`
}

/** El hándicap leído de la base (numeric llega como number; por si acaso, string → number). */
function numeroONull(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function mismoHandicap(a: number | null, b: number | null): boolean {
  return a === null || b === null ? a === b : Math.abs(a - b) < 1e-9
}

function normalizar(p: StartPlayer): StartPlayer {
  return { ...p, handicap_at_registration: numeroONull(p.handicap_at_registration) }
}

/**
 * Lee el editado, su fila de tarjeta y (bola compartida) su equipo con los miembros materializados.
 * 'inconsistente' = un miembro del equipo todavía no está enlazado a su inscrito: pasa a mitad del
 * inicio (los miembros se insertan antes de enlazar `tournament_group_players`); el caller reintenta.
 */
export async function leerEdicion(
  svc: SupabaseClient,
  torneo: TorneoParaEditar,
  playerId: string,
): Promise<LecturaDeEdicion | 'no-existe' | 'inconsistente'> {
  const { data: player, error: pErr } = await svc
    .from('players')
    .select(START_PLAYER_SELECT)
    .eq('id', playerId)
    .eq('tournament_id', torneo.id)
    .maybeSingle()
  if (pErr) throw pErr
  if (!player) return 'no-existe'
  const editado = normalizar(player as unknown as StartPlayer)

  const { data: enlaces, error: eErr } = await svc
    .from('tournament_group_players')
    .select('jugador_ronda_id')
    .eq('player_id', playerId)
    .not('jugador_ronda_id', 'is', null)
  if (eErr) throw eErr
  const jugadorRondaId = ((enlaces ?? []) as Array<{ jugador_ronda_id: string }>)[0]?.jugador_ronda_id ?? null

  if (!jugadorRondaId || !isSharedBallFormat(resolveFormatoJuego(torneo))) {
    return { editado, jugadorRondaId, equipo: null }
  }

  const { data: suEquipo, error: sErr } = await svc
    .from('ronda_equipo_jugadores')
    .select('equipo_id')
    .eq('jugador_id', jugadorRondaId)
    .maybeSingle()
  if (sErr) throw sErr
  const equipoId = (suEquipo as { equipo_id: string } | null)?.equipo_id ?? null
  if (!equipoId) return { editado, jugadorRondaId, equipo: null }

  const { data: filas, error: fErr } = await svc
    .from('ronda_equipo_jugadores')
    .select('jugador_id, orden')
    .eq('equipo_id', equipoId)
    .order('orden', { ascending: true })
  if (fErr) throw fErr
  const jugadorIds = ((filas ?? []) as Array<{ jugador_id: string }>).map((f) => f.jugador_id)

  const { data: tgps, error: tErr } = await svc
    .from('tournament_group_players')
    .select('player_id, jugador_ronda_id')
    .in('jugador_ronda_id', jugadorIds)
  if (tErr) throw tErr
  const playerDe = new Map(
    ((tgps ?? []) as Array<{ player_id: string; jugador_ronda_id: string }>).map((t) => [t.jugador_ronda_id, t.player_id]),
  )
  const playerIds = jugadorIds.map((j) => playerDe.get(j))
  if (playerIds.some((id) => !id)) return 'inconsistente'

  const { data: miembrosRaw, error: mErr } = await svc
    .from('players')
    .select(START_PLAYER_SELECT)
    .in('id', playerIds as string[])
  if (mErr) throw mErr
  const porId = new Map(((miembrosRaw ?? []) as unknown as StartPlayer[]).map((m) => [m.id, normalizar(m)]))
  const miembros = (playerIds as string[]).map((id) => porId.get(id))
  if (miembros.some((m) => !m)) return 'inconsistente'
  return { editado, jugadorRondaId, equipo: { id: equipoId, miembros: miembros as StartPlayer[] } }
}

export type ResultadoEdicion =
  | { ok: true; valor: number }
  | { ok: false; motivo: 'no-existe' | 'conflicto' | 'error' }

/** Reintentos cuando otro cambio (un compañero de equipo corregido a la vez) gana la carrera. */
export const MAX_REINTENTOS_EDICION = 3

/** Espera entre reintentos por lectura inconsistente (un inicio a medio enlazar), en ms × intento. */
const ESPERA_INCONSISTENTE_MS = 300

/** Copy del 409: otro cambio del mismo hándicap llegó primero (el panel recarga). */
export const ERROR_OTRO_CAMBIO = 'Otro cambio llegó primero. Recargamos los datos: revisa y vuelve a intentarlo.'

/**
 * Corrige el hándicap inscrito de `playerId` de `valor` esperando que hoy sea `esperado` (lo que vio
 * el organizador). El caller ya validó sesión, organizador y rango.
 */
export async function editarHandicapInscrito(
  svc: SupabaseClient,
  torneo: TorneoParaEditar,
  playerId: string,
  esperado: number | null,
  valor: number,
  opciones: { esperaMs?: number } = {},
): Promise<ResultadoEdicion> {
  const meta = { tournamentId: torneo.id, playerId }
  const esperaMs = opciones.esperaMs ?? ESPERA_INCONSISTENTE_MS
  let escrita: string | null = null
  // Si algo falla DESPUÉS de haber escrito, el valor ya está en la base: 'conflicto' hace que el
  // panel recargue y muestre lo que quedó, en vez de un "no se pudo guardar" que no es cierto.
  const falla = (): ResultadoEdicion => ({ ok: false, motivo: escrita !== null ? 'conflicto' : 'error' })
  try {
    let contexto: { hcp: ContextoHcpDeEquipos; holeCount: number } | null | undefined
    const leerContexto = async () => {
      if (contexto !== undefined) return contexto
      const ronda1 = await fetchRoundPlayConfig(svc, torneo, 1)
      const hcp = await fetchContextoHcpDeEquipos(svc, torneo, ronda1)
      contexto = hcp ? { hcp, holeCount: ronda1.holeCount } : null
      return contexto
    }

    let esperadoAhora = esperado
    let reintentos = 0
    // Cada vuelta: leer → (ya escrito y nada cambió → listo) → planificar → escribir.
    // Tope = reintentos por conflicto + una vuelta de verificación por cada escritura.
    for (let vuelta = 0; vuelta < 2 * (MAX_REINTENTOS_EDICION + 1); vuelta++) {
      const lectura = await leerEdicion(svc, torneo, playerId)
      if (lectura === 'no-existe') return escrita !== null ? falla() : { ok: false, motivo: 'no-existe' }
      if (lectura === 'inconsistente') {
        if (++reintentos >= MAX_REINTENTOS_EDICION) {
          void captureError(new Error('editar-handicap-inscrito: equipo con un miembro sin enlazar'), { context: 'editar-handicap-inscrito.inconsistente', level: 'error', meta })
          return falla()
        }
        await new Promise((r) => setTimeout(r, esperaMs * reintentos))
        continue
      }
      const actual = lectura.editado.handicap_at_registration

      if (escrita !== null && escrita === estructuraDeEdicion(lectura)) return { ok: true, valor }
      if (!mismoHandicap(actual, esperadoAhora)) {
        if (mismoHandicap(actual, valor)) {
          // Ya tiene el valor pedido: un doble guardado (blur + Enter) o el reintento de una respuesta
          // que se perdió. No es un conflicto: se re-propaga a tarjeta y equipo con el valor actual.
          esperadoAhora = actual
        } else {
          // Otro lo corrigió a OTRO valor. Si ya escribimos lo nuestro, el cambio posterior es de
          // otro y manda el suyo.
          return escrita !== null ? { ok: true, valor } : { ok: false, motivo: 'conflicto' }
        }
      }

      const necesitaContexto = lectura.equipo != null && isSharedBallFormat(resolveFormatoJuego(torneo))
      const plan = planDeEdicion({
        torneo,
        lectura,
        esperado: esperadoAhora,
        valor,
        contexto: necesitaContexto ? await leerContexto() : null,
      })
      if ('error' in plan) {
        void captureError(new Error(`editar-handicap-inscrito: ${plan.error}`), { context: 'editar-handicap-inscrito.plan', level: 'error', meta })
        return falla()
      }

      const { data, error } = await svc.rpc('editar_handicap_inscrito', plan)
      if (error) {
        void captureError(error, { context: 'editar-handicap-inscrito.rpc', level: 'error', meta })
        return falla()
      }
      const res = data as { ok: boolean; motivo?: string } | null
      if (!res?.ok) {
        if (res?.motivo !== 'conflicto') return falla()
        if (++reintentos >= MAX_REINTENTOS_EDICION) return { ok: false, motivo: 'conflicto' }
        continue
      }
      escrita = estructuraDeEdicion(lectura)
      esperadoAhora = valor
    }
    // La estructura no dejó de cambiar (inicios y deshaceres en bucle): el panel recarga y muestra lo que quedó.
    void captureError(new Error('editar-handicap-inscrito: sin converger'), { context: 'editar-handicap-inscrito.bucle', level: 'error', meta })
    return { ok: false, motivo: 'conflicto' }
  } catch (err) {
    void captureError(err, { context: 'editar-handicap-inscrito', level: 'error', meta })
    return falla()
  }
}
