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
}

interface RondaRow {
  codigo: string
  course_name: string | null
  course_id: string | null
  holes: number | null
  estado: string | null
  recorridos: string[] | null
  ronda_libre_jugadores: Array<{ id: string; nombre: string | null; scores: Record<string, number> | null }> | null
}

export async function loadRoundForPush(admin: SupabaseClient, codigo: string): Promise<RoundPushSnapshot | null> {
  const { data } = await admin
    .from('rondas_libres')
    .select('codigo, course_name, course_id, holes, estado, recorridos, ronda_libre_jugadores(id, nombre, scores)')
    .eq('codigo', codigo)
    .maybeSingle()
  if (!data) return null

  const ronda = data as unknown as RondaRow
  const holes = ronda.holes ?? 18

  // Par por hoyo desde el catálogo (recorridos incluidos). Sin cancha ligada,
  // calcularScoreRonda usa par 4 — mismo fallback que /api/en-vivo.
  const parMap: Record<number, number> = {}
  if (ronda.course_id) {
    const hoyos = await fetchHoyosDeLaRonda(admin, ronda.course_id, ronda.recorridos, 'numero, par')
    for (const h of hoyos) parMap[h.numero] = h.par
  }

  const jugadores = (ronda.ronda_libre_jugadores ?? []).map(j => ({ id: j.id, nombre: j.nombre ?? 'Jugador' }))
  const scores: Record<string, Record<string, number>> = {}
  for (const j of ronda.ronda_libre_jugadores ?? []) scores[j.id] = j.scores ?? {}

  return {
    codigo: ronda.codigo,
    courseName: ronda.course_name ?? 'Cancha',
    holes,
    estado: ronda.estado ?? 'en_curso',
    players: buildRoundUpdatePlayers({ jugadores, scores, parMap, totalHoles: holes }),
  }
}
