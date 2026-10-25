/**
 * Hoja de salida del organizador (`/organizador/[slug]/salida`): carga del
 * torneo + grupos, y el texto que se copia/comparte por WhatsApp.
 *
 * El nombre de la cancha sale de `courses.nombre` (el torneo creado desde el
 * catálogo deja `tournaments.course_name` en NULL — 25 torneos en prod al
 * 25-oct-2026). Sin cancha, la línea no empieza con un "·" suelto.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface TorneoHojaSalida {
  name: string
  course_name: string | null
  date_start: string | null
  tees: string
  hole_count: number
}

export interface GrupoHojaSalida {
  name: string
  tee_time: string | null
  players: Array<{ name: string; handicap: number | null }>
}

/** Traduce el valor crudo de tournaments.tees a etiqueta legible. */
function displayTees(tees: string): string {
  const LABELS: Record<string, string> = {
    per_player: 'por jugador',
    per_category: 'por categoría',
    manual: 'asignación manual',
    mixed: 'mixtos',
  }
  return LABELS[tees] ?? tees.charAt(0).toUpperCase() + tees.slice(1)
}

/** "Cancha · 9H · Tees Azul", omitiendo las partes vacías. */
export function lineaCanchaHojaSalida(t: TorneoHojaSalida): string {
  return [
    t.course_name?.trim(),
    t.hole_count ? `${t.hole_count}H` : null,
    t.tees ? `Tees ${displayTees(t.tees)}` : null,
  ].filter(Boolean).join(' · ')
}

/** Texto plano para copiar o compartir la hoja de salida. */
export function textoHojaSalida(t: TorneoHojaSalida, groups: GrupoHojaSalida[], siteDomain: string): string {
  const lines: string[] = []
  lines.push(t.name.toUpperCase())
  const cancha = lineaCanchaHojaSalida(t)
  if (cancha) lines.push(cancha)
  const dateStr = t.date_start ? new Date(t.date_start + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''
  if (dateStr) lines.push(dateStr)
  lines.push('')

  for (const g of groups) {
    const time = g.tee_time ? new Date(g.tee_time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''
    lines.push(`${time ? time + '  ' : ''}${g.name}`)
    for (const p of g.players) {
      lines.push(`  ${p.name}${p.handicap != null ? ` (${p.handicap})` : ''}`)
    }
    lines.push('')
  }
  lines.push(`Golfers+ · ${siteDomain}`)
  return lines.join('\n')
}

type Fila = Record<string, unknown>

function jugadorDe(profiles: unknown): { name: string; handicap: number | null } {
  const p = profiles as Fila | null | undefined
  return { name: (p?.name as string) || 'Jugador', handicap: (p?.indice as number | null) ?? null }
}

/** Torneo + grupos de salida. `null` si el torneo no existe. Sin grupos: todos los aprobados. */
export async function cargarHojaSalida(
  supabase: SupabaseClient,
  slug: string
): Promise<{ tournament: TorneoHojaSalida; groups: GrupoHojaSalida[] } | null> {
  const { data: t } = await supabase
    .from('tournaments')
    .select('id, name, course_name, date_start, tees, hole_count, courses(nombre)')
    .eq('slug', slug)
    .single()
  if (!t) return null

  const row = t as Fila
  const course = row.courses as { nombre?: string | null } | null
  const tournament: TorneoHojaSalida = {
    name: row.name as string,
    course_name: course?.nombre || (row.course_name as string | null) || null,
    date_start: row.date_start as string | null,
    tees: row.tees as string,
    hole_count: row.hole_count as number,
  }

  const { data: tGroups } = await supabase
    .from('tournament_groups')
    .select('name, tee_time, tournament_group_players(player_id, players(profiles(name, indice)))')
    .eq('tournament_id', row.id)
    .order('sort_order')

  if (tGroups && tGroups.length > 0) {
    return {
      tournament,
      groups: tGroups.map((g: Fila) => ({
        name: g.name as string,
        tee_time: g.tee_time as string | null,
        players: ((g.tournament_group_players as Fila[]) || []).map(gp => jugadorDe((gp.players as Fila | null)?.profiles)),
      })),
    }
  }

  const { data: players } = await supabase
    .from('players')
    .select('profiles(name, indice)')
    .eq('tournament_id', row.id)
    .eq('status', 'approved')

  return {
    tournament,
    groups: players && players.length > 0
      ? [{ name: 'Todos los jugadores', tee_time: null, players: players.map((p: Fila) => jugadorDe(p.profiles)) }]
      : [],
  }
}
