import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { new_owner_id } = await req.json()
  if (!new_owner_id) return NextResponse.json({ error: 'new_owner_id requerido' }, { status: 400 })

  const { data: d } = await supabase
    .from('tournament_drafts')
    .select('owner_id')
    .eq('id', params.id)
    .single()
  if (!d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede transferir' }, { status: 403 })

  // El nuevo owner debe estar como collaborator
  const { data: c } = await supabase
    .from('tournament_draft_collaborators')
    .select('role')
    .eq('draft_id', params.id)
    .eq('user_id', new_owner_id)
    .single()
  if (!c) return NextResponse.json({ error: 'El nuevo owner debe ser collaborator primero' }, { status: 400 })

  // Update drafts.owner_id + cambia roles
  await supabase.from('tournament_drafts').update({ owner_id: new_owner_id }).eq('id', params.id)
  await supabase.from('tournament_draft_collaborators').update({ role: 'collaborator' }).eq('draft_id', params.id).eq('user_id', user.id)
  await supabase.from('tournament_draft_collaborators').update({ role: 'owner' }).eq('draft_id', params.id).eq('user_id', new_owner_id)

  return NextResponse.json({ ok: true })
}
