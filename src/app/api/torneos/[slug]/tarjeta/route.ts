/**
 * POST /api/torneos/[slug]/tarjeta — asegura la tarjeta de la ronda vigente de un jugador.
 *
 * Body: { player_id }. Pueden pedirla: el propio jugador (players.user_id = sesión), el
 * organizador del torneo, o el invitado dueño del jugador (x-guest-id + x-guest-token; dueño =
 * el mismo cruce por jugador que `/guest-player`: `buscarJugadorInvitado`).
 *
 * 200 { ok, round_id, round_number, creada } · 409 { reason } (torneo cerrado, ronda sin juego,
 * jugador no aprobado) · 400 body malo · 401 sin sesión ni invitado · 403 { code } sin permiso ·
 * 404 torneo inexistente · 429 · 503 falla pasajera (o `code: sin_soporte` si la función SQL aún no
 * está en la base: el scorer sigue con el flujo de papel).
 *
 * Idempotente: la función SQL no crea una segunda tarjeta si ya existe. El scorer la llama desde
 * "Buscar mi tarjeta" y después relee el roster.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { verifyGuestToken } from '@/lib/guest-token'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import { isUuid } from '@/lib/uuid'
import { esFalloTransitorioDeAuth } from '@/lib/auth/fallo-transitorio-auth'
import { buscarJugadorInvitado } from '@/lib/data/tournaments/guest-player'
import { asegurarTarjetaVigente } from '@/lib/data/tournaments/tarjeta-vigente'
import {
  CODIGO_INVITADO_NO_DUENO,
  CODIGO_TARJETA_AJENA,
  CODIGO_TARJETA_SIN_SOPORTE,
  CODIGO_TOKEN_INVITADO_INVALIDO,
} from '@/lib/api/codigos-game'

export const dynamic = 'force-dynamic'

const PRIVADO = HEADERS_PRIVADO_NO_STORE
/** Un toque por intento: 10 por minuto sobra para quien insiste, y frena a quien barre ids. */
const LIMITE_POR_MINUTO = 10

const responder = (body: Record<string, unknown>, status: number, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...PRIVADO, ...extra } })
const noDisponible = () => responder({ error: 'No pudimos buscar la tarjeta. Intenta de nuevo.' }, 503)

/** Quién pide y con qué clave se limita. `rechazo` = respuesta ya decidida (401/403/503). */
type Solicitante =
  | { tipo: 'invitado'; clave: string }
  | { tipo: 'usuario'; userId: string; clave: string }
  | { tipo: 'rechazo'; res: NextResponse }

async function identificar(req: NextRequest, slug: string, playerId: string): Promise<Solicitante> {
  const guestId = req.headers.get('x-guest-id') ?? ''
  const guestToken = req.headers.get('x-guest-token') ?? ''
  let rechazoInvitado: string | null = null
  if (guestId && guestToken) {
    // Token (HMAC, sin BD) antes de leer nada: sin oráculo para quien no lo tiene.
    if (!verifyGuestToken(guestId, guestToken)) {
      rechazoInvitado = CODIGO_TOKEN_INVITADO_INVALIDO
    } else {
      let suJugador: string | null
      try {
        suJugador = await buscarJugadorInvitado(createAdminClient(), slug, guestId)
      } catch (err) {
        void captureError(err, { context: 'api.torneos.tarjeta.invitado', meta: { slug } })
        return { tipo: 'rechazo', res: noDisponible() }
      }
      if (suJugador === playerId) return { tipo: 'invitado', clave: `tarjeta:g:${guestId}` }
      rechazoInvitado = CODIGO_INVITADO_NO_DUENO
    }
  }

  // Sin invitado válido para ESTE jugador: la sesión (un teléfono con cuenta y un guestId viejo
  // no queda afuera por el guestId).
  const supabase = await createServerClient()
  let user: { id: string } | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    user = data.user
    // Auth caído no es "sin sesión": con 401 el scorer le pediría login a quien ya lo tiene.
    if (!user && esFalloTransitorioDeAuth(error)) return { tipo: 'rechazo', res: noDisponible() }
  } catch {
    return { tipo: 'rechazo', res: noDisponible() }
  }
  if (user) return { tipo: 'usuario', userId: user.id, clave: `tarjeta:u:${user.id}` }
  if (rechazoInvitado) {
    return { tipo: 'rechazo', res: responder({ error: 'No autorizado', code: rechazoInvitado }, 403) }
  }
  return { tipo: 'rechazo', res: responder({ error: 'Debes iniciar sesión para continuar' }, 401) }
}

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  let playerId: unknown
  try {
    playerId = ((await req.json()) as { player_id?: unknown } | null)?.player_id
  } catch {
    return responder({ error: 'JSON inválido' }, 400)
  }
  if (!isUuid(playerId)) return responder({ error: 'player_id inválido' }, 400)

  const quien = await identificar(req, slug, playerId)
  if (quien.tipo === 'rechazo') return quien.res

  const rl = checkRateLimit(quien.clave, LIMITE_POR_MINUTO, 60_000)
  if (!rl.allowed) {
    return responder({ error: 'Demasiados intentos. Espera un momento.' }, 429, rateLimitHeaders(rl))
  }

  const admin = createAdminClient()
  try {
    const { data: torneo, error: errTorneo } = await admin
      .from('tournaments')
      .select('id, organizer_id')
      .eq('slug', slug)
      .maybeSingle()
    if (errTorneo) throw errTorneo
    if (!torneo) return responder({ error: 'Torneo no encontrado' }, 404)
    const t = torneo as { id: string; organizer_id: string | null }

    if (quien.tipo === 'usuario' && t.organizer_id !== quien.userId) {
      const { data: jugador, error: errJugador } = await admin
        .from('players')
        .select('user_id')
        .eq('id', playerId)
        .eq('tournament_id', t.id)
        .maybeSingle()
      if (errJugador) throw errJugador
      // Jugador de otro torneo, inexistente o ajeno: la misma respuesta (sin oráculo de ids).
      if ((jugador as { user_id: string | null } | null)?.user_id !== quien.userId) {
        return responder({ error: 'Esta tarjeta no está a tu nombre.', code: CODIGO_TARJETA_AJENA }, 403)
      }
    }

    const r = await asegurarTarjetaVigente(admin, t.id, playerId)
    if (r.tipo === 'sin_soporte') {
      return responder({ error: 'Todavía no podemos crear la tarjeta desde acá.', code: CODIGO_TARJETA_SIN_SOPORTE }, 503)
    }
    if (r.tipo === 'rechazo') return responder({ ok: false, reason: r.motivo }, 409)
    return responder({ ok: true, round_id: r.roundId, round_number: r.roundNumber, creada: r.creada }, 200)
  } catch (err) {
    void captureError(err, { context: 'api.torneos.tarjeta', level: 'error', meta: { slug, playerId } })
    return noDisponible()
  }
}
