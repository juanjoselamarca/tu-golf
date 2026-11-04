import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string; userId: string }> }
) {
  const params = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const rl = checkRateLimit(`draft-collab-remove:${user.id}`, 20, 60 * 60 * 1000)
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429, headers: rateLimitHeaders(rl) })

  const { data: d } = await supabase
    .from('tournament_drafts')
    .select('owner_id')
    .eq('id', params.id)
    .single()
  if (!d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede remover' }, { status: 403 })
  if (params.userId === d.owner_id) return NextResponse.json({ error: 'No puedes removerte como owner' }, { status: 400 })

  await supabase
    .from('tournament_draft_collaborators')
    .delete()
    .eq('draft_id', params.id)
    .eq('user_id', params.userId)

  return NextResponse.json({ ok: true })
}
