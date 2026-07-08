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

const PUBLIC_VISIBLE_STATUSES = ['open', 'in_progress', 'closed', 'published'] as const
const INSCRIBIBLE_STATUSES = ['open'] as const

type PublicStatus = (typeof PUBLIC_VISIBLE_STATUSES)[number]
type InscribibleStatus = (typeof INSCRIBIBLE_STATUSES)[number]

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

function isInscribibleStatus(status: string): status is InscribibleStatus {
  return (INSCRIBIBLE_STATUSES as readonly string[]).includes(status)
}

/**
 * ¿Un torneo en este estado acepta auto-inscripción? Fuente de verdad única
 * compartida con la UI (`/torneo/[slug]/unirse`) para que el botón nunca
 * contradiga al backend. Espejo booleano de `isInscribibleStatus`.
 */
export function esInscribible(status: string): boolean {
  return (INSCRIBIBLE_STATUSES as readonly string[]).includes(status)
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

export type RegisterResult =
  | { ok: true; playerId: string }
  | {
      ok: false
      reason: 'already_registered' | 'not_inscribible' | 'forbidden' | 'invalid_data' | 'tournament_full' | 'unknown'
      message: string
    }

export async function registerPlayerAndRound(
  admin: SupabaseClient,
  args: {
    tournamentId: string
    tournamentStatus: string
    userId: string
    courseHandicap: number | null
  }
): Promise<RegisterResult> {
  if (!isInscribibleStatus(args.tournamentStatus)) {
    return {
      ok: false,
      reason: 'not_inscribible',
      message:
        args.tournamentStatus === 'draft'
          ? 'Este torneo todavía no está disponible para inscripciones.'
          : 'Este torneo ya no admite nuevas inscripciones.',
    }
  }

  // Cupo máximo: si el torneo define `max_players`, no aceptar más inscritos que
  // el tope (el wizard configura "cupo máximo" y antes no se respetaba). Sólo
  // cuenta a los inscritos activos ('approved'); 'waitlist'/'withdrawn' no ocupan
  // cupo. Chequeo no-atómico: bajo concurrencia extrema podría colarse 1 de más,
  // despreciable a la cadencia de inscripción de un torneo (TODO ola 4: constraint DB).
  const { data: tRow } = await admin
    .from('tournaments')
    .select('max_players')
    .eq('id', args.tournamentId)
    .single()
  const maxPlayers = (tRow as { max_players: number | null } | null)?.max_players ?? null
  if (maxPlayers != null && maxPlayers > 0) {
    const { count } = await admin
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', args.tournamentId)
      .eq('status', 'approved')
    if ((count ?? 0) >= maxPlayers) {
      return {
        ok: false,
        reason: 'tournament_full',
        message: `El torneo alcanzó su cupo máximo (${maxPlayers} jugadores).`,
      }
    }
  }

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
    const code = pErr?.code
    if (code === '23505' || msg.includes('duplicate') || msg.includes('unique'))
      return { ok: false, reason: 'already_registered', message: 'Ya estás inscrito en este torneo.' }
    if (code === '42501' || msg.includes('permission') || msg.includes('policy'))
      return {
        ok: false,
        reason: 'forbidden',
        message: 'No tienes permiso para inscribirte. Contacta al organizador del torneo.',
      }
    if (msg.includes('violates check') || msg.includes('not-null') || msg.includes('not null'))
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

  const { error: rErr } = await admin.from('rounds').insert({
    tournament_id: args.tournamentId,
    player_id: (player as { id: string }).id,
    status: 'in_progress',
  })

  // No abortamos si el round falla — el player ya quedó inscrito. El round se puede
  // re-crear desde el endpoint de score o regenerar por el organizador. Loggeamos
  // si Sentry está disponible; en otros contextos el error se propaga silencioso
  // (mismo comportamiento que el page original). TODO ola 4: RPC atomica.
  if (rErr) {
    // eslint-disable-next-line no-console
    console.warn('[joinFlow] rounds insert failed:', rErr.message)
  }

  return { ok: true, playerId: (player as { id: string }).id }
}
