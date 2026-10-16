/**
 * GET /api/torneos/[slug]/guest-player — ¿cuál es el jugador de este invitado?
 *
 * Headers: x-guest-id + x-guest-token (el HMAC que entrega /guest-join).
 * 200 { playerId } · 404 no está inscrito en este torneo · 403 token inválido.
 *
 * El scorer del invitado lo usa para auto-seleccionar su tarjeta. Antes la buscaba en el
 * roster por `players.pending_user_id`, columna que cualquiera con la anon key leía — y el
 * `guestId` es la credencial del invitado (ver src/lib/data/tournaments/guest-player.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { verifyGuestToken } from '@/lib/guest-token'
import { checkRateLimit, clientIpFrom, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import { buscarJugadorInvitado } from '@/lib/data/tournaments/guest-player'

export const dynamic = 'force-dynamic'

const PRIVADO = HEADERS_PRIVADO_NO_STORE

export async function GET(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const rl = checkRateLimit(`guest-player:${clientIpFrom(req)}`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { ...PRIVADO, ...rateLimitHeaders(rl) } })
  }

  const guestId = req.headers.get('x-guest-id') ?? ''
  const guestToken = req.headers.get('x-guest-token') ?? ''
  if (!verifyGuestToken(guestId, guestToken)) {
    return NextResponse.json({ error: 'invalid_guest_token' }, { status: 403, headers: PRIVADO })
  }

  try {
    const playerId = await buscarJugadorInvitado(createAdminClient(), slug, guestId)
    if (!playerId) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: PRIVADO })
    return NextResponse.json({ playerId }, { headers: PRIVADO })
  } catch (err) {
    void captureError(err, { context: 'api.torneos.guest-player', meta: { slug } })
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: PRIVADO })
  }
}
