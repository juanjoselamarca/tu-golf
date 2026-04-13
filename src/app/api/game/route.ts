import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { upsertScore, finalizeRound, startNextRound, cancelTournament, withdrawPlayer } from './actions'

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

export async function POST(request: NextRequest) {
  const { user, supabase } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })

  const body = await request.json()
  const { action, tournament_id } = body

  if (!action || typeof action !== 'string') {
    return NextResponse.json({ error: 'Acción requerida o no válida' }, { status: 400 })
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

  // Auth check: organizer or player of the round
  const selfAuthActions = ['cancel_tournament', 'withdraw_player']
  let isAllowed = tournament.organizer_id === user.id
  if (!isAllowed && action === 'upsert_score') {
    const { round_id } = body
    const { data: round } = await supabase
      .from('rounds')
      .select('player_id, players(user_id)')
      .eq('id', round_id)
      .single()
    const playerUserId = (round?.players as unknown as { user_id: string } | null)?.user_id
    isAllowed = playerUserId === user.id
  }
  if (!isAllowed && !selfAuthActions.includes(action)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
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
    case 'cancel_tournament':
      return cancelTournament(svc, user.id, tournament_id, tournament.organizer_id, tournament.status)
    case 'withdraw_player':
      return withdrawPlayer(svc, user.id, tournament_id, tournament.organizer_id, tournament.status, body)
    default:
      return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  }
}
