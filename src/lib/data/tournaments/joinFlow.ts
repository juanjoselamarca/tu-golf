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
 *   original, ver supabase/migrations/20260313193824_initial_schema.sql:249-251) porque
 *   usamos createAdminClient para bypassear el filtro RLS que rompia
 *   el caso "invitado autenticado intenta ver torneo open" — bug 5c739d82.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { checkFeatureAccess, rechazoDeFeature, type RechazoFeature } from '@/golf/billing/require-feature'
import { MENSAJE_PLAN_ORGANIZADOR_NO_VERIFICADO } from '@/golf/billing/modo-por-plan'
import {
  enrollPlayer,
  isInscribibleStatus,
  tournamentCapacity,
  type EnrollResult,
  type CapacityInfo,
} from './enrollPlayer'

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
  formato_juego: string | null
  status: string
  organizer_id: string
  hcp_calc_mode: string | null
  date_start: string | null
  codigo: string | null
  course_name: string | null
  courses: JoinInfoCourse | null
}

export interface JoinInfoProfile {
  name: string
  indice: number | null
  /** Se congela en `players.genero` al inscribirse. */
  genero: string | null
}

export interface JoinInfoPayload {
  tournament: JoinInfoTournament
  profile: JoinInfoProfile | null
  alreadyRegistered: boolean
  /** Cupo del torneo (full/maxPlayers/approved). Fuente única `tournamentCapacity`
   *  — para que la UI muestre "torneo completo" ANTES de que el jugador choque
   *  contra el 409 del RPC (cuyo mensaje está escrito para el organizador). */
  capacity: CapacityInfo
}

/** ¿Un visitante cualquiera (sin ser el organizador) puede ver el torneo en este estado? */
export function esVisiblePublicamente(status: string): boolean {
  return (PUBLIC_VISIBLE_STATUSES as readonly string[]).includes(status)
}

function isVisibleToUser(t: { status: string; organizer_id: string }, userId: string): boolean {
  if (esVisiblePublicamente(t.status)) return true
  return t.organizer_id === userId
}

/** El código que se tipea a mano ("abc 123", con espacios o minúsculas) → "ABC123". */
export function normalizarCodigoTorneo(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

const PLAZO_BUSQUEDA_CODIGO_MS = 10_000

export type BusquedaPorCodigo =
  | { ok: true; slug: string }
  | { ok: false; motivo: 'no_existe' | 'sin_conexion' }

/**
 * Slug del torneo a partir del código de /torneo/unirme. Corre con el cliente de la
 * sesión: la RLS de `tournaments` ya oculta los borradores ajenos.
 * Distingue "no existe" de "no se pudo consultar": con mala señal en la cancha, el
 * jugador veía "no se encontró un torneo con ese código" y creía que el código estaba malo.
 */
export async function buscarSlugPorCodigo(supabase: SupabaseClient, codigo: string): Promise<BusquedaPorCodigo> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('slug')
    .eq('codigo', normalizarCodigoTorneo(codigo))
    // Señal colgada (conectado pero sin respuesta): sin tope, el botón quedaba en "Buscando..."
    // para siempre. El abort llega como `error` → sin_conexion.
    .abortSignal(AbortSignal.timeout(PLAZO_BUSQUEDA_CODIGO_MS))
    .maybeSingle()
  if (error) return { ok: false, motivo: 'sin_conexion' }
  const slug = (data as { slug: string | null } | null)?.slug
  return slug ? { ok: true, slug } : { ok: false, motivo: 'no_existe' }
}

/**
 * ¿Un torneo en este estado acepta auto-inscripción? Fuente de verdad única
 * compartida con la UI (`/torneo/[slug]/unirse`) para que el botón nunca
 * contradiga al backend.
 */
export function esInscribible(status: string): boolean {
  return isInscribibleStatus(status)
}

/** Columnas de la ficha del torneo que ve quien se inscribe, con o sin sesión (una sola lista: antes eran dos y divergieron). */
const COLUMNAS_FICHA =
  'id, name, slug, format, formato_juego, status, organizer_id, hcp_calc_mode, date_start, codigo, course_name, courses(nombre, ciudad, slope_rating, course_rating, par_total)'

/** Ficha pública del torneo para un visitante sin sesión; null si no existe o no es visible públicamente. */
export async function fetchJoinInfoPublica(admin: SupabaseClient, slug: string): Promise<JoinInfoTournament | null> {
  // "No pude preguntar" no es "no existe": un error de la base sube como 500 y el hook ofrece reintentar.
  const { data: tournament, error } = await admin.from('tournaments').select(COLUMNAS_FICHA).eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!tournament) return null
  const t = tournament as unknown as JoinInfoTournament
  return esVisiblePublicamente(t.status) ? t : null
}

export async function fetchJoinInfo(
  admin: SupabaseClient,
  slug: string,
  userId: string
): Promise<JoinInfoPayload | null> {
  const { data: tournament, error } = await admin
    .from('tournaments')
    .select(COLUMNAS_FICHA)
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw error
  if (!tournament) return null
  const t = tournament as unknown as JoinInfoTournament
  if (!isVisibleToUser(t, userId)) return null

  const [{ data: profile }, { data: existing }, capacity] = await Promise.all([
    admin.from('profiles').select('name, indice, genero').eq('id', userId).maybeSingle(),
    admin
      .from('players')
      .select('id')
      .eq('tournament_id', t.id)
      .eq('user_id', userId)
      .maybeSingle(),
    tournamentCapacity(admin, t.id),
  ])

  return {
    tournament: t,
    profile: (profile as JoinInfoProfile | null) ?? null,
    alreadyRegistered: !!existing,
    capacity,
  }
}

/** ¿El torneo acepta invitados sin cuenta? Lo que el visitante ve ANTES de llenar el formulario. */
export type InvitadosInfo =
  | { permitido: true }
  | { permitido: false; motivo: 'pro_required' | 'plan_unavailable'; mensaje: string }

export const MENSAJES_GATE_INVITADOS = {
  proRequerido: 'El organizador necesita plan Pro para invitados.',
  planNoVerificado: MENSAJE_PLAN_ORGANIZADOR_NO_VERIFICADO,
} as const

/**
 * Gate Pro de la inscripción de invitados: fuente única para `guest-join` (que responde con
 * él) y `join-info` (que lo adelanta a la pantalla). Antes solo lo aplicaba guest-join: el
 * invitado llenaba nombre e índice y recién al enviar recibía el 403 (22-oct-2026).
 */
export async function rechazoInvitados(
  admin: SupabaseClient,
  organizerId: string,
): Promise<RechazoFeature<'guest-tournament'> | null> {
  const access = await checkFeatureAccess(admin, organizerId, 'guest-tournament')
  return rechazoDeFeature(access, 'guest-tournament', MENSAJES_GATE_INVITADOS)
}

export function invitadosDesdeRechazo(rechazo: RechazoFeature | null): InvitadosInfo {
  if (!rechazo) return { permitido: true }
  return { permitido: false, motivo: rechazo.body.error, mensaje: rechazo.body.message }
}

/** Lo que un visitante sin sesión necesita saber antes de inscribirse: cupo y si se aceptan invitados. */
export interface CondicionesInscripcionPublica {
  capacity: CapacityInfo
  invitados: InvitadosInfo
}

export async function condicionesInscripcionPublica(
  admin: SupabaseClient,
  tournament: Pick<JoinInfoTournament, 'id' | 'organizer_id'>,
): Promise<CondicionesInscripcionPublica> {
  const [capacity, rechazo] = await Promise.all([
    tournamentCapacity(admin, tournament.id),
    rechazoInvitados(admin, tournament.organizer_id),
  ])
  return { capacity, invitados: invitadosDesdeRechazo(rechazo) }
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
    /** `profiles.genero` del jugador; se congela en `players.genero`. */
    genero?: string | null
  }
): Promise<RegisterResult> {
  return enrollPlayer(admin, {
    tournamentId: args.tournamentId,
    tournamentStatus: args.tournamentStatus,
    identity: { kind: 'registered', userId: args.userId },
    handicapAtRegistration: args.courseHandicap,
    genero: args.genero ?? null,
    enforceStatusGate: true,
  })
}
