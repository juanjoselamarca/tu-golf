/**
 * Capa de datos del flow de inscripcion al torneo (/torneo/[slug]/unirse).
 *
 * Por que vive aca y no en src/app/torneo/[slug]/unirse/:
 * - regla "el que toca, ordena": la UI NO hace supabase.from() directo.
 * - El bug original (inbox 5c739d82) era RLS bloqueando SELECT a invitados.
 *   Movemos a server-side via createAdminClient (slug actua como credencial).
 *
 * Tipos exportados son el contrato BD <-> UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface JoinInfoCourse {
  nombre: string
  ciudad: string
  slope_rating: number
  course_rating: number
  par_total: number
}

export interface JoinInfoTournament {
  id: string
  name: string
  slug: string
  format: string
  date_start: string | null
  codigo: string | null
  course_name: string | null
  courses: JoinInfoCourse | null
}

export interface JoinInfoProfile {
  name: string
  indice: number | null
}

export interface JoinInfoPayload {
  tournament: JoinInfoTournament
  profile: JoinInfoProfile | null
  alreadyRegistered: boolean
}

export function calcCourseHandicap(
  indice: number,
  slope: number,
  rating: number,
  par: number
): number {
  return Math.round(indice * (slope / 113) + (rating - par))
}

export async function fetchJoinInfo(
  admin: SupabaseClient,
  slug: string,
  userId: string
): Promise<JoinInfoPayload | null> {
  const { data: tournament } = await admin
    .from('tournaments')
    .select(
      'id, name, slug, format, date_start, codigo, course_name, courses(nombre, ciudad, slope_rating, course_rating, par_total)'
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!tournament) return null

  const [{ data: profile }, { data: existing }] = await Promise.all([
    admin.from('profiles').select('name, indice').eq('id', userId).maybeSingle(),
    admin
      .from('players')
      .select('id')
      .eq('tournament_id', (tournament as { id: string }).id)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  return {
    tournament: tournament as unknown as JoinInfoTournament,
    profile: (profile as JoinInfoProfile | null) ?? null,
    alreadyRegistered: !!existing,
  }
}

export type RegisterResult =
  | { ok: true; playerId: string }
  | { ok: false; reason: 'duplicate' | 'permission' | 'invalid_data' | 'unknown'; message: string }

export async function registerPlayerAndRound(
  admin: SupabaseClient,
  args: { tournamentId: string; userId: string; courseHandicap: number | null }
): Promise<RegisterResult> {
  const { data: player, error: pErr } = await admin
    .from('players')
    .insert({
      tournament_id: args.tournamentId,
      user_id: args.userId,
      handicap_at_registration: args.courseHandicap,
      status: 'approved',
    })
    .select('id')
    .single()

  if (pErr || !player) {
    const msg = pErr?.message?.toLowerCase() || ''
    if (msg.includes('duplicate') || msg.includes('unique'))
      return { ok: false, reason: 'duplicate', message: 'Ya estás inscrito en este torneo.' }
    if (msg.includes('permission') || msg.includes('policy') || pErr?.code === '42501')
      return {
        ok: false,
        reason: 'permission',
        message: 'No tienes permiso para inscribirte. Contacta al organizador del torneo.',
      }
    if (msg.includes('violates check') || msg.includes('not-null'))
      return {
        ok: false,
        reason: 'invalid_data',
        message: 'Faltan datos en tu perfil. Verifica que tengas nombre y handicap configurados.',
      }
    return {
      ok: false,
      reason: 'unknown',
      message: `No se pudo completar la inscripción: ${pErr?.message || 'error desconocido'}. Intenta nuevamente.`,
    }
  }

  await admin.from('rounds').insert({
    tournament_id: args.tournamentId,
    player_id: (player as { id: string }).id,
    status: 'in_progress',
  })

  return { ok: true, playerId: (player as { id: string }).id }
}
