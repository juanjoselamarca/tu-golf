import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  scores: z.array(z.object({
    id: z.string().uuid(),
    gross_score: z.number().int().min(1).max(19),
  })).min(1).max(18),
  /** Ya no se usa (era para el broadcast de Realtime); se acepta para no romper clientes que lo mandan. */
  tournament_id: z.string().uuid().optional(),
})

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const raw = await request.json()
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { scores } = parsed.data

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
    event_data: {
      action: 'edit_hole_score',
      entity: 'hole_scores',
      entityId: s.id,
      details: { old_value: oldMap.get(s.id), new_value: s.gross_score },
    },
  }))
  await admin.from('analytics_events').insert(auditLogs)

  // Sin broadcast de Supabase Realtime (incidente torneo Los Leones 04-oct-2026):
  // los espectadores del torneo se enteran por polling (`useLiveRefresh`).

  return NextResponse.json({ scores: updated })
}
