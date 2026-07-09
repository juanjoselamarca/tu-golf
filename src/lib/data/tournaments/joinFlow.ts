/**
 * Capa de datos del flow de inscripcion al torneo (/torneo/[slug]/unirse).
 *
 * Por que vive aca y no en src/app/torneo/[slug]/unirse/:
 *   regla "el que toca, ordena" — la UI NO hace supabase.from() directo.
 *
 * Modelo de autorizacion:
 *   El slug es un identificador publico (derivable del nombre del torneo),
 *   NO una credencial. La credencial real es auth.uid() — validada en cada
 *   route handler antes de invocar estas funciones. La visibilidad de
 *   tournaments por status se re-implementa aca a mano (espejo de la RLS
 *   original, ver supabase/migrations/001_initial_schema.sql:249-251) porque
 *   usamos createAdminClient para bypassear el filtro RLS que rompia
 *   el caso "invitado autenticado intenta ver torneo open" — bug 5c739d82.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { enrollPlayer, isInscribibleStatus, type EnrollResult } from './enrollPlayer'

const PUBLIC_VISIBLE_STATUSES = ['open', 'in_progress', 'closed', 'published'] as const

type PublicStatus = (typeof PUBLIC_VISIBLE_STATUSES)[number]

export interface JoinInfoCourse {
  nombre: string
  ciudad: string
  slope_rating: number | null
  course_rating: number | null
  par_total: number | null
}

export interface JoinInfoTournament {
  id: string
  name: string
  slug: string
  format: string
  status: string
  organizer_id: string
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

function isVisibleToUser(t: { status: string; organizer_id: string }, userId: string): boolean {
  if ((PUBLIC_VISIBLE_STATUSES as readonly string[]).includes(t.status)) return true
  return t.organizer_id === userId
}

/**
 * ¿Un torneo en este estado acepta auto-inscripción? Fuente de verdad única
 * compartida con la UI (`/torneo/[slug]/unirse`) para que el botón nunca
 * contradiga al backend.
 */
export function esInscribible(status: string): boolean {
  return isInscribibleStatus(status)
}

export async function fetchJoinInfo(
  admin: SupabaseClient,
  slug: string,
  userId: string
): Promise<JoinInfoPayload | null> {
  const { data: tournament } = await admin
    .from('tournaments')
    .select(
      'id, name, slug, format, status, organizer_id, date_start, codigo, course_name, courses(nombre, ciudad, slope_rating, course_rating, par_total)'
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!tournament) return null
  const t = tournament as unknown as JoinInfoTournament
  if (!isVisibleToUser(t, userId)) return null

  const [{ data: profile }, { data: existing }] = await Promise.all([
    admin.from('profiles').select('name, indice').eq('id', userId).maybeSingle(),
    admin
      .from('players')
      .select('id')
      .eq('tournament_id', t.id)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  return {
    tournament: t,
    profile: (profile as JoinInfoProfile | null) ?? null,
    alreadyRegistered: !!existing,
  }
}

/** @deprecated Usar `EnrollResult` de `./enrollPlayer`. Alias por compatibilidad. */
export type RegisterResult = EnrollResult

/**
 * Inscripción self-service (jugador se anota solo desde `/torneo/[slug]/unirse`).
 * Wrapper delgado sobre la fuente única `enrollPlayer`: aplica el gate de status
 * ('open') y el cupo. El course handicap ya viene resuelto por el route handler
 * con `resolverCourseHandicap` (misma fórmula que usa el organizador).
 */
export async function registerPlayerAndRound(
  admin: SupabaseClient,
  args: {
    tournamentId: string
    tournamentStatus: string
    userId: string
    courseHandicap: number | null
  }
): Promise<RegisterResult> {
  return enrollPlayer(admin, {
    tournamentId: args.tournamentId,
    tournamentStatus: args.tournamentStatus,
    identity: { kind: 'registered', userId: args.userId },
    handicapAtRegistration: args.courseHandicap,
    enforceStatusGate: true,
  })
}
