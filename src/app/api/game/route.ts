import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { upsertScore, finalizeRound, startNextRound, cancelTournament, withdrawPlayer, disqualifyPlayer, openInscriptions, revertInscriptions, closeTournamentAction } from './actions'
import { verifyGuestToken } from '@/lib/guest-token'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

async function getAuthUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            )
          } catch {}
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return { user, supabase }
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Verifica que el guest token corresponda al guestId y que el guestId sea dueño
 * del round_id declarado (vía pending_user_id en players). Retorna el playerId
 * si todo pasa, null si algo falla.
 */
async function verifyGuestOwnership(
  svc: ReturnType<typeof serviceClient>,
  guestId: string,
  guestToken: string,
  roundId: string,
): Promise<string | null> {
  if (!verifyGuestToken(guestId, guestToken)) return null
  const { data: round } = await svc
    .from('rounds')
    .select('player_id, players(pending_user_id)')
    .eq('id', roundId)
    .single()
  const pendingUserId = (round?.players as unknown as { pending_user_id: string | null } | null)?.pending_user_id
  if (pendingUserId !== guestId) return null
  return round?.player_id ?? null
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, tournament_id } = body

  if (!action || typeof action !== 'string') {
    return NextResponse.json({ error: 'Acción requerida o no válida' }, { status: 400 })
  }

  // ── Guest scoring path (upsert_score ONLY) ──
  // Invitados sin cuenta envían x-guest-id + x-guest-token en vez de cookies de auth.
  // Solo se permite upsert_score — no acciones de organizador.
  const guestId = request.headers.get('x-guest-id')
  const guestToken = request.headers.get('x-guest-token')
  if (guestId && guestToken && action === 'upsert_score') {
    // Rate limit: 120 requests/min por jugador-ronda invitado
    const rlKey = `score-guest:${guestId}:${body.round_id}`
    const rl = checkRateLimit(rlKey, 120, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados envíos. Espera un momento.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    const svc = serviceClient()

    // Verificar torneo
    const { data: tournament } = await svc
      .from('tournaments')
      .select('organizer_id, status')
      .eq('id', tournament_id)
      .single()
    if (!tournament) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })

    const scorableStatuses = ['active', 'in_progress']
    if (!scorableStatuses.includes(tournament.status)) {
      return NextResponse.json({ error: 'El torneo no está activo. No se pueden registrar scores.' }, { status: 409 })
    }

    // Verificar que el guest token es válido y que el guestId es dueño de esta ronda
    const playerId = await verifyGuestOwnership(svc, guestId, guestToken, body.round_id)
    if (!playerId) {
      return NextResponse.json({ error: 'Token de invitado inválido o no autorizado' }, { status: 403 })
    }

    // Verificar que el jugador no esté retirado/descalificado
    const { data: guestPlayerStatus } = await svc
      .from('rounds')
      .select('player_id, players(status)')
      .eq('id', body.round_id)
      .single()
    const guestPlayerSt = (guestPlayerStatus?.players as unknown as { status: string | null } | null)?.status
    if (guestPlayerSt === 'withdrawn' || guestPlayerSt === 'disqualified') {
      return NextResponse.json(
        { error: 'Este jugador se ha retirado del torneo.' },
        { status: 403 },
      )
    }

    // Idempotencia: si el score ya existe con el mismo valor, retornar éxito sin re-insertar
    const idempotencyKey = request.headers.get('x-idempotency-key')
    if (idempotencyKey && body.gross_score != null) {
      const { data: existing } = await svc
        .from('hole_scores')
        .select('gross_score')
        .eq('round_id', body.round_id)
        .eq('hole_number', body.hole_number)
        .single()
      if (existing && existing.gross_score === body.gross_score) {
        return NextResponse.json({ success: true, idempotent: true })
      }
    }

    // El userId para el audit log usa un placeholder identificable
    return upsertScore(svc, `guest:${guestId}`, body)
  }

  // ── Authenticated path (original) ──
  const { user, supabase } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })

  // Rate limit para upsert_score: 120 requests/min por jugador-ronda
  if (action === 'upsert_score') {
    const rlKey = `score:${user.id}:${body.round_id}`
    const rl = checkRateLimit(rlKey, 120, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados envíos. Espera un momento.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }
  }

  // Verify tournament exists
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('organizer_id, status')
    .eq('id', tournament_id)
    .single()

  if (!tournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })
  }

  // Block scoring on inactive tournaments
  const scorableStatuses = ['active', 'in_progress']
  if (!scorableStatuses.includes(tournament.status) && action === 'upsert_score') {
    return NextResponse.json({ error: 'El torneo no está activo. No se pueden registrar scores.' }, { status: 409 })
  }

  // Score freeze: torneo cerrado → ninguna acción que modifique scores o rondas
  const scoreModifyingActions = ['upsert_score', 'finalize_round', 'start_next_round']
  if (tournament.status === 'closed' && scoreModifyingActions.includes(action)) {
    return NextResponse.json(
      { error: 'El torneo ya fue cerrado. Los scores son definitivos.' },
      { status: 403 },
    )
  }

  // Auth check: organizer or player of the round
  const selfAuthActions = ['cancel_tournament', 'withdraw_player']
  let isAllowed = tournament.organizer_id === user.id
  if (!isAllowed && action === 'upsert_score') {
    const { round_id } = body
    const { data: round } = await supabase
      .from('rounds')
      .select('player_id, players(user_id, status)')
      .eq('id', round_id)
      .single()
    const playerInfo = round?.players as unknown as { user_id: string; status: string | null } | null
    isAllowed = playerInfo?.user_id === user.id

    // Rechazar scores de jugador retirado/descalificado
    if (isAllowed && (playerInfo?.status === 'withdrawn' || playerInfo?.status === 'disqualified')) {
      return NextResponse.json(
        { error: 'Este jugador se ha retirado del torneo.' },
        { status: 403 },
      )
    }
  }
  if (!isAllowed && !selfAuthActions.includes(action)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Idempotencia: si el score ya existe con el mismo valor, retornar éxito sin re-insertar
  if (action === 'upsert_score') {
    const idempotencyKey = request.headers.get('x-idempotency-key')
    if (idempotencyKey && body.gross_score != null) {
      const svcCheck = serviceClient()
      const { data: existing } = await svcCheck
        .from('hole_scores')
        .select('gross_score')
        .eq('round_id', body.round_id)
        .eq('hole_number', body.hole_number)
        .single()
      if (existing && existing.gross_score === body.gross_score) {
        return NextResponse.json({ success: true, idempotent: true })
      }
    }
  }

  const svc = serviceClient()

  // Dispatch to action handlers
  switch (action) {
    case 'upsert_score':
      return upsertScore(svc, user.id, body)
    case 'finalize_round':
      return finalizeRound(svc, tournament_id, body)
    case 'start_next_round':
      return startNextRound(svc, user.id, tournament_id, tournament.organizer_id)
    case 'open_inscriptions':
      return openInscriptions(svc, user.id, tournament_id, tournament.organizer_id, tournament.status)
    case 'revert_to_draft':
      return revertInscriptions(svc, user.id, tournament_id, tournament.organizer_id, tournament.status)
    case 'close_tournament':
      return closeTournamentAction(svc, user.id, tournament_id, tournament.organizer_id, tournament.status)
    case 'cancel_tournament':
      return cancelTournament(svc, user.id, tournament_id, tournament.organizer_id, tournament.status)
    case 'withdraw_player':
      return withdrawPlayer(svc, user.id, tournament_id, tournament.organizer_id, tournament.status, body)
    case 'disqualify_player':
      return disqualifyPlayer(svc, user.id, tournament_id, tournament.organizer_id, tournament.status, body)
    default:
      return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  }
}
