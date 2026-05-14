import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isTokenExpired } from '@/lib/draft/share-token'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 })

  const { data: t } = await supabase
    .from('tournament_draft_share_tokens')
    .select('draft_id, expires_at, consumed_at, created_by')
    .eq('token', token)
    .single()

  if (!t) return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
  if (t.consumed_at) return NextResponse.json({ error: 'Token ya usado' }, { status: 410 })
  if (isTokenExpired(t.expires_at)) return NextResponse.json({ error: 'Token expirado' }, { status: 410 })

  // Limit 4
  const { count } = await supabase
    .from('tournament_draft_collaborators')
    .select('user_id', { count: 'exact', head: true })
    .eq('draft_id', t.draft_id)
  if ((count || 0) >= 4) return NextResponse.json({ error: 'Draft lleno (4 admins máx)' }, { status: 409 })

  // Consume token + agregar
  await supabase
    .from('tournament_draft_share_tokens')
    .update({ consumed_at: new Date().toISOString(), consumed_by: user.id })
    .eq('token', token)

  const { error: cErr } = await supabase
    .from('tournament_draft_collaborators')
    .insert({ draft_id: t.draft_id, user_id: user.id, role: 'collaborator', added_by: t.created_by })

  if (cErr && cErr.code !== '23505') {
    return NextResponse.json({ error: cErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, draft_id: t.draft_id })
}
