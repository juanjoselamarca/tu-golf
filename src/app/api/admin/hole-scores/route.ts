import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const body = await request.json()
  const { scores, tournament_id: bodyTournamentId } = body as { scores: Array<{ id: string; gross_score: number }>; tournament_id?: string }

  if (!scores || !Array.isArray(scores) || scores.length === 0) {
    return NextResponse.json({ error: 'Se requiere un array de scores' }, { status: 400 })
  }

  // Batch fetch old values for audit in single query
  const scoreIds = scores.map(s => s.id)
  const { data: oldScores } = await admin
    .from('hole_scores')
    .select('id, gross_score')
    .in('id', scoreIds)
  const oldMap = new Map(oldScores?.map(s => [s.id, s.gross_score]) ?? [])

  // Update scores individually (upsert doesn't work well for partial updates with FK constraints)
  const updated: unknown[] = []
  for (const score of scores) {
    const { data, error } = await admin
      .from('hole_scores')
      .update({ gross_score: score.gross_score })
      .eq('id', score.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: `No se pudo actualizar el score ${score.id}. Intenta de nuevo.` }, { status: 500 })
    }
    updated.push(data)
  }

  // Batch insert audit logs in single query
  const auditLogs = scores.map(s => ({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: {
      action: 'edit_hole_score',
      entity: 'hole_scores',
      entityId: s.id,
      details: { old_value: oldMap.get(s.id), new_value: s.gross_score },
    },
  }))
  await admin.from('analytics_events').insert(auditLogs)

  // Broadcast score_update to connected leaderboard viewers via Supabase Realtime
  // Wrapped in try/catch — broadcast failure must NEVER affect the score save response
  try {
    let tournamentId = bodyTournamentId

    if (!tournamentId && scoreIds.length > 0) {
      // Resolve via: hole_scores → rounds → players
      const { data: hsRow } = await admin
        .from('hole_scores')
        .select('round_id')
        .eq('id', scoreIds[0])
        .single()
      if (hsRow?.round_id) {
        const { data: roundRow } = await admin
          .from('rounds')
          .select('player_id')
          .eq('id', hsRow.round_id)
          .single()
        if (roundRow?.player_id) {
          const { data: playerRow } = await admin
            .from('players')
            .select('tournament_id')
            .eq('id', roundRow.player_id)
            .single()
          tournamentId = playerRow?.tournament_id
        }
      }
    }

    if (tournamentId) {
      const channel = admin.channel(`tournament:${tournamentId}`)
      await channel.send({
        type: 'broadcast',
        event: 'score_update',
        payload: { updated_at: new Date().toISOString() },
      })
      await admin.removeChannel(channel)
    }
  } catch {
    // Broadcast fallido no es crítico — viewers harán fallback a polling 30s
  }

  return NextResponse.json({ scores: updated })
}
