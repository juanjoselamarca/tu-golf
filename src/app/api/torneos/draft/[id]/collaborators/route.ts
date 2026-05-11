import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { user_id_to_add } = await req.json()
  if (!user_id_to_add || typeof user_id_to_add !== 'string') {
    return NextResponse.json({ error: 'user_id_to_add requerido' }, { status: 400 })
  }

  const { data: d, error: dErr } = await supabase
    .from('tournament_drafts')
    .select('owner_id')
    .eq('id', params.id)
    .single()
  if (dErr || !d) return NextResponse.json({ error: 'Draft no encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede invitar' }, { status: 403 })

  // Limit: max 4 collaborators (incluyendo owner)
  const { count } = await supabase
    .from('tournament_draft_collaborators')
    .select('user_id', { count: 'exact', head: true })
    .eq('draft_id', params.id)
  if ((count || 0) >= 4) return NextResponse.json({ error: 'Máximo 4 admins por draft' }, { status: 409 })

  const { error: insErr } = await supabase
    .from('tournament_draft_collaborators')
    .insert({ draft_id: params.id, user_id: user_id_to_add, role: 'collaborator', added_by: user.id })

  if (insErr) {
    if (insErr.code === '23505') return NextResponse.json({ error: 'Ya es colaborador' }, { status: 409 })
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
