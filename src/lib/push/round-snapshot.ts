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
import { isSharedBallFormat } from '@/golf/formats'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { buildRoundUpdatePlayers } from '@/golf/notifications/round-update-payload'
import { buildTeamRoundPlayers, type TeamHole } from '@/golf/notifications/team-round-payload'
import type { SpectatorPlayer } from '@/golf/notifications/spectator'

/** Quiénes pueden disparar el push de esta ronda. */
export interface RoundParticipants {
  creadorId: string | null
  adminUserId: string | null
  playerUserIds: string[]
  /** ids de ronda_libre_jugadores: un invitado sin cuenta prueba con el suyo. */
  playerIds: string[]
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
}

interface AccessRow {
  estado: string | null
  creador_id: string | null
  admin_user_id: string | null
  ronda_libre_jugadores: Array<{ id: string; user_id: string | null }> | null
}

function participantsOf(row: AccessRow): RoundParticipants {
  const jugadores = row.ronda_libre_jugadores ?? []
  return {
    creadorId: row.creador_id ?? null,
    adminUserId: row.admin_user_id ?? null,
    playerUserIds: jugadores.map(j => j.user_id).filter((id): id is string => !!id),
    playerIds: jugadores.map(j => j.id),
  }
}

export async function loadRoundAccess(admin: SupabaseClient, codigo: string): Promise<RoundPushAccess | null> {
  const { data } = await admin
    .from('rondas_libres')
    .select('estado, creador_id, admin_user_id, ronda_libre_jugadores(id, user_id)')
    .eq('codigo', codigo)
    .maybeSingle()
  if (!data) return null
  const row = data as unknown as AccessRow
  return { estado: row.estado ?? 'en_curso', participants: participantsOf(row) }
}

interface RondaRow {
  id: string
  codigo: string
  course_name: string | null
  course_id: string | null
  holes: number | null
  estado: string | null
  formato_juego: string | null
  modo_juego: string | null
  creador_id: string | null
  admin_user_id: string | null
  recorridos: string[] | null
  ronda_libre_jugadores: Array<{ id: string; nombre: string | null; user_id: string | null; scores: Record<string, number> | null }> | null
}

export async function loadRoundForPush(admin: SupabaseClient, codigo: string): Promise<RoundPushSnapshot | null> {
  const { data } = await admin
    .from('rondas_libres')
    .select('id, codigo, course_name, course_id, holes, estado, formato_juego, modo_juego, creador_id, admin_user_id, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores)')
    .eq('codigo', codigo)
    .maybeSingle()
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
  const teamHoles: TeamHole[] = hoyosDeLaVuelta(catalogo, holes)
    .map(h => ({ numero: h.numero, par: h.par, stroke_index: h.stroke_index }))
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
    players = buildRoundUpdatePlayers({ jugadores, scores, parMap, totalHoles: holes })
  }

  return {
    codigo: ronda.codigo,
    courseName: ronda.course_name ?? 'Cancha',
    holes,
    estado: ronda.estado ?? 'en_curso',
    players,
    participants: participantsOf(ronda),
  }
}

/** Creador, admin de grupo o jugador con cuenta: los únicos que anotan en la ronda. */
export function isRoundParticipant(access: RoundPushAccess, userId: string): boolean {
  const p = access.participants
  return p.creadorId === userId || p.adminUserId === userId || p.playerUserIds.includes(userId)
}

/** Un invitado sin cuenta prueba pertenencia con el id de su fila de jugador (misma prueba que la RPC de guardado). */
export function isRoundPlayer(access: RoundPushAccess, jugadorId: string): boolean {
  return access.participants.playerIds.includes(jugadorId)
}
