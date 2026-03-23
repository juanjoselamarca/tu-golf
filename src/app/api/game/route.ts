import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/lib/scoring'

function validateScoreInputs(body: Record<string, unknown>): string | null {
  const { hole_number, gross_score, par } = body
  if (!Number.isInteger(hole_number) || (hole_number as number) < 1 || (hole_number as number) > 18)
    return 'hole_number debe ser entero entre 1 y 18'
  if (gross_score !== null && gross_score !== undefined) {
    if (!Number.isInteger(gross_score) || (gross_score as number) < 1 || (gross_score as number) > 20)
      return 'gross_score debe ser entero entre 1 y 20'
  }
  if (par !== undefined && (!Number.isInteger(par) || (par as number) < 3 || (par as number) > 6))
    return 'par debe ser entero entre 3 y 6'
  return null
}

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

  if (!action || typeof action !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid action' }, { status: 400 })
  }

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
    const validationError = validateScoreInputs(body)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
    const { round_id, hole_number, par, gross_score, putts, fairway_hit, gir } = body
    let { net_score, points } = body as { net_score: number | null; points: number | null }

    // Auto-calculate net_score and points if not provided
    if (gross_score != null && (net_score == null || points == null)) {
      // Look up player HCP and stroke_index
      const { data: roundData } = await svc
        .from('rounds')
        .select('player_id, players(handicap_at_registration, tournament_id)')
        .eq('id', round_id)
        .single()
      const rd = roundData as unknown as {
        player_id: string
        players: { handicap_at_registration: number | null; tournament_id: string } | null
      } | null

      if (rd?.players) {
        const hcp          = rd.players.handicap_at_registration ?? 18
        const tournId      = rd.players.tournament_id
        const { data: chData } = await svc
          .from('tournaments')
          .select('courses(id)')
          .eq('id', tournId)
          .single()
        const courseId = (chData as unknown as { courses: { id: string } | null } | null)?.courses?.id

        let strokeIndex = hole_number  // fallback
        if (courseId) {
          const { data: holeRow } = await svc
            .from('course_holes')
            .select('stroke_index')
            .eq('course_id', courseId)
            .eq('numero', hole_number)
            .single()
          if (holeRow) strokeIndex = (holeRow as unknown as { stroke_index: number }).stroke_index
        }

        if (net_score == null) {
          const grossNeto = gross_score - strokesRecibidosEnHoyo(hcp, strokeIndex)
          net_score       = grossNeto  // store gross-strokes (absolute), not over/under
        }
        if (points == null) {
          points = puntosStablefordHoyo(gross_score, par, hcp, strokeIndex)
        }
      }
    }

    const upsertData: Record<string, unknown> = {
      round_id, hole_number, par, gross_score, net_score, points,
      source: 'manual_organizer', status: 'loaded',
    }
    if (putts       !== undefined && putts       !== null) upsertData.putts       = putts
    if (fairway_hit !== undefined && fairway_hit !== null) upsertData.fairway_hit = fairway_hit
    if (gir         !== undefined && gir         !== null) upsertData.gir         = gir

    const { error } = await svc.from('hole_scores').upsert(
      upsertData,
      { onConflict: 'round_id,hole_number' }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Registro de auditoría — no bloquear si falla
    if (gross_score != null) {
      try {
        await svc.from('score_audit_log').insert({
          hole_score_id: round_id + '_' + hole_number,
          changed_by: user.id,
          new_value: gross_score,
          reason: 'manual_organizer',
        })
      } catch { /* audit log failure should not block score save */ }
    }

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
    const { data: currentRound } = await svc
      .from('rounds')
      .select('status')
      .eq('id', round_id)
      .single()
    if (currentRound?.status === 'closed' || currentRound?.status === 'official') {
      return NextResponse.json({ error: 'La ronda ya está finalizada' }, { status: 409 })
    }
    const { error } = await svc
      .from('rounds')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', round_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
