/**
 * src/lib/push/round-snapshot.ts — la ronda como la ve el push, leída de la BD.
 *
 * /api/push/round-update NO confía en scores que mande el cliente: el scorer
 * mandaba un snapshot viejo (bug f6cca8e3) y cualquier usuario logueado podía
 * empujar puntajes inventados a los seguidores de una ronda ajena. Acá se lee
 * la verdad (rondas_libres + par por hoyo) y se calcula con la fuente única
 * (calcularScoreRonda vía buildRoundUpdatePlayers).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchHoyosDeLaRonda } from '@/lib/data/course-holes'
import { buildRoundUpdatePlayers } from '@/golf/notifications/round-update-payload'
import type { SpectatorPlayer } from '@/golf/notifications/spectator'

export interface RoundPushSnapshot {
  codigo: string
  courseName: string
  holes: number
  estado: string
  players: SpectatorPlayer[]
  /** Quiénes pueden disparar el push de esta ronda. */
  participants: {
    creadorId: string | null
    adminUserId: string | null
    playerUserIds: string[]
  }
}

interface RondaRow {
  codigo: string
  course_name: string | null
  course_id: string | null
  holes: number | null
  estado: string | null
  creador_id: string | null
  admin_user_id: string | null
  recorridos: string[] | null
  ronda_libre_jugadores: Array<{ id: string; nombre: string | null; user_id: string | null; scores: Record<string, number> | null }> | null
}

export async function loadRoundForPush(admin: SupabaseClient, codigo: string): Promise<RoundPushSnapshot | null> {
  const { data } = await admin
    .from('rondas_libres')
    .select('codigo, course_name, course_id, holes, estado, creador_id, admin_user_id, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores)')
    .eq('codigo', codigo)
    .maybeSingle()
  if (!data) return null

  const ronda = data as unknown as RondaRow
  const holes = ronda.holes ?? 18
  const jugadoresRaw = ronda.ronda_libre_jugadores ?? []

  // Par por hoyo desde el catálogo (recorridos incluidos). Sin cancha ligada,
  // calcularScoreRonda usa par 4 — mismo fallback que /api/en-vivo.
  const parMap: Record<number, number> = {}
  if (ronda.course_id) {
    const hoyos = await fetchHoyosDeLaRonda(admin, ronda.course_id, ronda.recorridos, 'numero, par')
    for (const h of hoyos) parMap[h.numero] = h.par
  }

  const jugadores = jugadoresRaw.map(j => ({ id: j.id, nombre: j.nombre ?? 'Jugador' }))
  const scores: Record<string, Record<string, number>> = {}
  for (const j of jugadoresRaw) scores[j.id] = j.scores ?? {}

  return {
    codigo: ronda.codigo,
    courseName: ronda.course_name ?? 'Cancha',
    holes,
    estado: ronda.estado ?? 'en_curso',
    players: buildRoundUpdatePlayers({ jugadores, scores, parMap, totalHoles: holes }),
    participants: {
      creadorId: ronda.creador_id ?? null,
      adminUserId: ronda.admin_user_id ?? null,
      playerUserIds: jugadoresRaw.map(j => j.user_id).filter((id): id is string => !!id),
    },
  }
}

/** Creador, admin de grupo o jugador con cuenta: los únicos que anotan en la ronda. */
export function isRoundParticipant(snapshot: RoundPushSnapshot, userId: string): boolean {
  const p = snapshot.participants
  return p.creadorId === userId || p.adminUserId === userId || p.playerUserIds.includes(userId)
}
