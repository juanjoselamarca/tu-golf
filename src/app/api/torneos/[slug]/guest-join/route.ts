/**
 * POST /api/torneos/[slug]/guest-join
 *
 * Inscripción de un jugador invitado (sin cuenta) a un torneo.
 * No requiere autenticación — esa es la razón de ser del guest scoring.
 *
 * Body: { guestId: string, name: string, handicap?: number }
 *
 * Retorna:
 *  - 200 { ok, playerId, guestToken } → inscripción exitosa
 *  - 400/409/404 → errores de validación / ya inscrito / torneo no encontrado
 *
 * El `guestToken` es un HMAC firmado del guestId que el cliente guarda en
 * localStorage y envía como `x-guest-token` en cada request de scoring.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkFeatureAccess } from '@/golf/billing/require-feature'
import { enrollPlayer } from '@/lib/data/tournaments/enrollPlayer'
import { signGuestToken } from '@/lib/guest-token'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { esIndiceDeHandicapValido, MENSAJE_INDICE_FUERA_DE_RANGO } from '@/golf/handicap-index-range'
import { captureError } from '@/lib/error-tracking'

export const dynamic = 'force-dynamic'

// UUID v4 regex (loose — acepta mayúsculas/minúsculas)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  // Rate limit: 10 joins/min por IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
  const rl = checkRateLimit(`guest-join:${ip}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Demasiadas solicitudes. Espera un momento.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'invalid_body', message: 'Cuerpo inválido.' }, { status: 400 })
  }

  const { guestId, name, handicap } = body as {
    guestId?: string
    name?: string
    handicap?: number
  }

  // Validaciones
  if (!guestId || !UUID_RE.test(guestId)) {
    return NextResponse.json({ error: 'invalid_guest_id', message: 'ID de invitado inválido.' }, { status: 400 })
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return NextResponse.json({ error: 'invalid_name', message: 'El nombre debe tener entre 2 y 100 caracteres.' }, { status: 400 })
  }
  // El índice es opcional, pero si viene tiene que ser real: entra directo al
  // neto del leaderboard (un "185" tipeado por 18.5 ganaba el torneo).
  if (handicap != null && !esIndiceDeHandicapValido(handicap)) {
    return NextResponse.json({ error: 'invalid_handicap', message: MENSAJE_INDICE_FUERA_DE_RANGO }, { status: 400 })
  }

  const admin = createAdminClient()

  // Buscar torneo por slug
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, status, organizer_id')
    .eq('slug', params.slug)
    .maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'not_found', message: 'Torneo no encontrado.' }, { status: 404 })
  }

  // Gate Pro: inscripción de invitados requiere que el organizador tenga plan Pro
  const access = await checkFeatureAccess(admin, tournament.organizer_id, 'guest-tournament')
  if (!access.allowed) {
    return NextResponse.json(
      { error: 'pro_required', message: 'El organizador necesita plan Pro para invitados.' },
      { status: 403 },
    )
  }

  // Verificar si este guestId ya está inscrito en este torneo
  const { data: existing } = await admin
    .from('players')
    .select('id')
    .eq('tournament_id', tournament.id)
    .eq('pending_user_id', guestId)
    .maybeSingle()

  if (existing) {
    // Ya inscrito — devolver token para que pueda scorear
    const guestToken = signGuestToken(guestId)
    return NextResponse.json({
      ok: true,
      playerId: existing.id,
      guestToken,
      alreadyRegistered: true,
    })
  }

  // Inscribir como invitado
  const result = await enrollPlayer(admin, {
    tournamentId: tournament.id,
    tournamentStatus: tournament.status,
    identity: { kind: 'guest', guestName: name.trim() },
    handicapAtRegistration: handicap ?? null,
    // Sin perfil no hay género: null (el motor no desambigua el tee).
    genero: null,
    enforceStatusGate: true,
  })

  if (!result.ok) {
    const status =
      result.reason === 'already_registered' ? 409
        : result.reason === 'not_inscribible' ? 409
          : result.reason === 'tournament_full' ? 409
            : 400
    return NextResponse.json({ error: result.reason, message: result.message }, { status })
  }

  // Actualizar el pending_user_id del player recién creado con el guestId del cliente
  // (el RPC usa gen_random_uuid() — necesitamos el guestId del cliente para linkear)
  const { error: linkError } = await admin
    .from('players')
    .update({ pending_user_id: guestId })
    .eq('id', result.playerId)

  if (linkError) {
    // Sin el vínculo, el token de abajo no apunta a ningún jugador: el invitado entraba al
    // scorer sin poder anotar, y al reintentar (no lo encuentra por guestId) se inscribía
    // OTRA vez → nombre duplicado en el leaderboard. Se deshace la inscripción (rounds cae
    // por ON DELETE CASCADE) para que el reintento parta limpio.
    const { error: undoError } = await admin.from('players').delete().eq('id', result.playerId)
    if (undoError) {
      // Quedó un jugador sin vínculo: que se vea, para limpiarlo a mano.
      void captureError(undoError, {
        context: 'guest-join.undo',
        level: 'error',
        meta: { playerId: result.playerId, tournamentId: tournament.id },
      })
    }

    // 23505 = el guestId ya está vinculado: un doble submit (el cliente reintentó mientras la
    // primera request seguía viva) ganó la carrera. El invitado SÍ quedó inscrito con ese
    // jugador: se responde como "ya inscrito" en vez de pedirle que reintente.
    if (linkError.code === '23505') {
      const { data: ganador } = await admin
        .from('players')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('pending_user_id', guestId)
        .maybeSingle()
      if (ganador) {
        return NextResponse.json({
          ok: true,
          playerId: ganador.id,
          guestToken: signGuestToken(guestId),
          alreadyRegistered: true,
        })
      }
    }

    void captureError(linkError, { context: 'guest-join.link', level: 'error' })
    return NextResponse.json(
      { error: 'link_failed', message: 'No se pudo completar la inscripción. Intenta nuevamente.' },
      { status: 500 },
    )
  }

  const guestToken = signGuestToken(guestId)
  return NextResponse.json({ ok: true, playerId: result.playerId, guestToken })
}
