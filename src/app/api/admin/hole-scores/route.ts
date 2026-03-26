import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()
  const body = await request.json()
  const { scores } = body as { scores: Array<{ id: string; gross_score: number }> }

  if (!scores || !Array.isArray(scores) || scores.length === 0) {
    return NextResponse.json({ error: 'scores array is required' }, { status: 400 })
  }

  const updated: unknown[] = []

  for (const score of scores) {
    // Fetch old value for audit
    const { data: old } = await admin.from('hole_scores').select('gross_score').eq('id', score.id).single()

    const { data, error } = await admin
      .from('hole_scores')
      .update({ gross_score: score.gross_score })
      .eq('id', score.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: `Failed to update score ${score.id}: ${error.message}` }, { status: 500 })
    }

    updated.push(data)

    // Log to analytics_events
    await admin.from('analytics_events').insert({
      event_type: 'admin_action',
      user_id: user!.id,
      metadata: {
        action: 'edit_hole_score',
        entity: 'hole_scores',
        entityId: score.id,
        details: { old_value: old?.gross_score, new_value: score.gross_score },
      },
    })
  }

  return NextResponse.json({ scores: updated })
}
