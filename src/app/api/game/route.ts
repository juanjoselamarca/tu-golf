import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action, tournament_id } = body

  // Verify the caller is the tournament organizer
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('organizer_id')
    .eq('id', tournament_id)
    .single()

  // Si no es organizador, verifica si es el jugador de la ronda
  let isAllowed = tournament && tournament.organizer_id === user.id
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
  if (!isAllowed) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const svc = serviceClient()

  // ── upsert_score ────────────────────────────────────────
  if (action === 'upsert_score') {
    const { round_id, hole_number, par, gross_score, net_score, points } = body

    const { error } = await svc.from('hole_scores').upsert(
      {
        round_id,
        hole_number,
        par,
        gross_score,
        net_score,
        points,
        source: 'manual_organizer',
        status: 'loaded',
      },
      { onConflict: 'round_id,hole_number' }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Recalculate round totals
    const { data: allScores } = await svc
      .from('hole_scores')
      .select('gross_score, net_score, points')
      .eq('round_id', round_id)
      .not('gross_score', 'is', null)

    const totalGross   = allScores?.reduce((s, h) => s + (h.gross_score  ?? 0), 0) ?? 0
    const totalNet     = allScores?.reduce((s, h) => s + (h.net_score    ?? 0), 0) ?? 0
    const totalPoints  = allScores?.reduce((s, h) => s + (h.points       ?? 0), 0) ?? 0

    await svc
      .from('rounds')
      .update({ total_gross: totalGross, total_net: totalNet, total_points: totalPoints })
      .eq('id', round_id)

    return NextResponse.json({ success: true, totalGross, totalNet, totalPoints })
  }

  // ── finalize_round ──────────────────────────────────────
  if (action === 'finalize_round') {
    const { round_id } = body
    const { error } = await svc
      .from('rounds')
      .update({ status: 'completed', closed_at: new Date().toISOString() })
      .eq('id', round_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
