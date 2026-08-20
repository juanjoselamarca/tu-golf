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
import { enrollPlayer } from '@/lib/data/tournaments/enrollPlayer'
import { signGuestToken } from '@/lib/guest-token'

export const dynamic = 'force-dynamic'

// UUID v4 regex (loose — acepta mayúsculas/minúsculas)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
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

  const admin = createAdminClient()

  // Buscar torneo por slug
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, status')
    .eq('slug', params.slug)
    .maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'not_found', message: 'Torneo no encontrado.' }, { status: 404 })
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
    handicapAtRegistration: typeof handicap === 'number' && !isNaN(handicap) ? handicap : null,
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
  await admin
    .from('players')
    .update({ pending_user_id: guestId })
    .eq('id', result.playerId)

  const guestToken = signGuestToken(guestId)
  return NextResponse.json({ ok: true, playerId: result.playerId, guestToken })
}
