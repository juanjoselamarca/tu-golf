/**
 * src/lib/push/round-snapshot.ts — la ronda como la ve el push, leída de la BD.
 *
 * /api/push/round-update NO confía en scores que mande el cliente: el scorer
 * mandaba un snapshot viejo (bug f6cca8e3) y cualquier usuario logueado podía
 * empujar puntajes inventados a los seguidores de una ronda ajena. Acá se lee
 * la verdad (rondas_libres + par por hoyo) y se calcula con la fuente única
 * (calcularScoreRonda vía buildRoundUpdatePlayers; standings canónicos de
 * equipos para scramble/foursome, cuyo score vive en ronda_equipos).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchHoyosDeLaRonda } from '@/lib/data/course-holes'
import { fetchRondaEquipos } from '@/lib/data/ronda-libre'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { hoyosDelMotor, isSharedBallFormat } from '@/golf/formats'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { buildRoundUpdatePlayers } from '@/golf/notifications/round-update-payload'
import { buildTeamRoundPlayers, type TeamHole } from '@/golf/notifications/team-round-payload'
import type { SpectatorPlayer } from '@/golf/notifications/spectator'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { anotadoresDeEquipos } from '@/golf/ronda-libre/anotador-de-equipo'
import type { HandicapOrigen } from '@/golf/ronda-libre/equipos-de-club'

/** Quiénes pueden disparar el push de esta ronda. */
export interface RoundParticipants {
  creadorId: string | null
  adminUserId: string | null
  playerUserIds: string[]
  /** ids de ronda_libre_jugadores: un invitado sin cuenta prueba con el suyo. */
  playerIds: string[]
  /**
   * Cuentas que anotan un equipo desde su celular (un celular por equipo, `anotadoresDeEquipos`): no son jugadores
   * de la ronda pero escriben su equipo. Vacío en cualquier otra ronda.
   */
  teamScorerUserIds: string[]
}

/**
 * Lo mínimo para decidir si un request puede empujar la ronda: estado y
 * participantes. Se lee ANTES de cobrar el límite por ronda y de armar el
 * snapshot completo — un no-participante con el código no gasta el
 * presupuesto de push del que anota (review #449 M2).
 */
export interface RoundPushAccess {
  estado: string
  participants: RoundParticipants
}

export interface RoundPushSnapshot extends RoundPushAccess {
  codigo: string
  courseName: string
  holes: number
  players: SpectatorPlayer[]
  /** Timba y Skins no se ordenan por golpes en el aviso (`buildSpectatorNotification`). */
  formato: string | null
}

interface AccessRow {
  estado: string | null
  creador_id: string | null
  admin_user_id: string | null
  admin_mode: boolean | null
  formato_juego: string | null
  ronda_libre_jugadores: Array<{ id: string; user_id: string | null }> | null
  ronda_equipos: Array<{ id: string; handicap_origen: HandicapOrigen | null; anotador_user_id: string | null }> | null
}

/** Columnas de la ronda que deciden quién puede disparar el push, salvo los jugadores (las lee también el snapshot). */
const COLUMNAS_ACCESO = 'estado, creador_id, admin_user_id, admin_mode, formato_juego, ronda_equipos(id, handicap_origen, anotador_user_id)'

function participantsOf(row: AccessRow): RoundParticipants {
  const jugadores = row.ronda_libre_jugadores ?? []
  return {
    creadorId: row.creador_id ?? null,
    adminUserId: row.admin_user_id ?? null,
    playerUserIds: jugadores.map(j => j.user_id).filter((id): id is string => !!id),
    playerIds: jugadores.map(j => j.id),
    teamScorerUserIds: anotadoresDeEquipos(row, row.ronda_equipos ?? []),
  }
}

/**
 * Un error de la lectura NO es «la ronda no existe»: se lanza (los llamadores lo reportan con captureError y responden
 * 500). Antes se ignoraba y cualquier falla (p. ej. una columna de ronda_equipos que la base todavía no tiene)
 * terminaba en un 404 silencioso: el aviso a los seguidores dejaba de salir sin que nadie lo viera.
 */
function lanzarSiFallo(error: { message?: string; code?: string } | null, que: string): void {
  if (error) throw new Error(`${que}: ${error.code ?? ''} ${error.message ?? 'error de lectura'}`.trim())
}

export async function loadRoundAccess(admin: SupabaseClient, codigo: string): Promise<RoundPushAccess | null> {
  const { data, error } = await admin
    .from('rondas_libres')
    .select(`${COLUMNAS_ACCESO}, ronda_libre_jugadores(id, user_id)`)
    .eq('codigo', codigo)
    .maybeSingle()
  lanzarSiFallo(error, 'loadRoundAccess')
  if (!data) return null
  const row = data as unknown as AccessRow
  return { estado: row.estado ?? 'en_curso', participants: participantsOf(row) }
}

interface RondaRow extends AccessRow {
  id: string
  codigo: string
  course_name: string | null
  course_id: string | null
  holes: number | null
  hoyo_inicio: number | null
  estado: string | null
  formato_juego: string | null
  modo_juego: string | null
  creador_id: string | null
  admin_user_id: string | null
  recorridos: string[] | null
  ronda_libre_jugadores: Array<{ id: string; nombre: string | null; user_id: string | null; scores: Record<string, number> | null }> | null
}

export async function loadRoundForPush(admin: SupabaseClient, codigo: string): Promise<RoundPushSnapshot | null> {
  const { data, error } = await admin
    .from('rondas_libres')
    .select(`id, codigo, course_name, course_id, holes, hoyo_inicio, modo_juego, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores), ${COLUMNAS_ACCESO}`)
    .eq('codigo', codigo)
    .maybeSingle()
  lanzarSiFallo(error, 'loadRoundForPush')
  if (!data) return null

  const ronda = data as unknown as RondaRow
  const holes = ronda.holes ?? 18
  const jugadoresRaw = ronda.ronda_libre_jugadores ?? []

  // Los hoyos de la RONDA salen de la fuente única (src/golf/courses/vueltas):
  // cancha de 9 jugada a 18 = dos vueltas (el hoyo 12 tiene el par del 3), sin
  // catálogo = par 4 y SI = número. Antes se usaba el catálogo tal cual y una
  // ronda de 18 en cancha de 9 puntuaba la segunda vuelta a par 4 (review I-1).
  const catalogo = ronda.course_id
    ? await fetchHoyosDeLaRonda(admin, ronda.course_id, ronda.recorridos, 'numero, par, stroke_index')
    : []
  // Sólo los hoyos DE ESTA RONDA (una de 9 desde el 10 juega 10..18; hoyosDeLaVuelta
  // devuelve la cancha entera a propósito), con los MISMOS respaldos que el marcador
  // (hoyosDelMotor: par 4 y SI = número). Filtrar la vuelta por los hoyos jugados
  // dejaba vacío un scramble del back-9 sin catálogo (la vuelta neutra es 1..9) y el
  // push decía "Aún sin puntajes" toda la ronda (review PR #634, 2ª vuelta I-2).
  const hoyos = hoyosDeLaRonda(ronda.hoyo_inicio, holes)
  const porNumero = new Map(hoyosDeLaVuelta(catalogo, holes).map(h => [h.numero, h]))
  const teamHoles: TeamHole[] = hoyosDelMotor(hoyos, h => porNumero.get(h)?.par, h => porNumero.get(h)?.stroke_index)
  const parMap: Record<number, number> = {}
  for (const h of teamHoles) parMap[h.numero] = h.par

  const formato = (ronda.formato_juego ?? 'stroke_play') as FormatoJuego
  let players: SpectatorPlayer[]
  if (isSharedBallFormat(formato)) {
    const equipos = await fetchRondaEquipos(admin, ronda.id)
    players = buildTeamRoundPlayers({
      equipos,
      holes: teamHoles,
      formato,
      modo: (ronda.modo_juego ?? 'gross') as ModoJuego,
      totalHoles: holes,
    })
  } else {
    const jugadores = jugadoresRaw.map(j => ({ id: j.id, nombre: j.nombre ?? 'Jugador' }))
    const scores: Record<string, Record<string, number>> = {}
    for (const j of jugadoresRaw) scores[j.id] = j.scores ?? {}
    players = buildRoundUpdatePlayers({ jugadores, scores, parMap, totalHoles: holes, hoyos })
  }

  return {
    codigo: ronda.codigo,
    courseName: ronda.course_name ?? 'Cancha',
    holes,
    estado: ronda.estado ?? 'en_curso',
    players,
    formato: ronda.formato_juego,
    participants: participantsOf(ronda),
  }
}

/**
 * Creador, admin de grupo, jugador con cuenta o quien anota un equipo desde su celular: los únicos que anotan en la
 * ronda (`upsert_ronda_libre_scores` / `upsert_ronda_equipos_scores`). Una cuenta cualquiera con el código, no.
 */
export function isRoundParticipant(access: RoundPushAccess, userId: string): boolean {
  const p = access.participants
  return p.creadorId === userId || p.adminUserId === userId || p.playerUserIds.includes(userId)
    || p.teamScorerUserIds.includes(userId)
}

/** Un invitado sin cuenta prueba pertenencia con el id de su fila de jugador (misma prueba que la RPC de guardado). */
export function isRoundPlayer(access: RoundPushAccess, jugadorId: string): boolean {
  return access.participants.playerIds.includes(jugadorId)
}
