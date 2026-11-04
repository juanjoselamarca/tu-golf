import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { generateShareToken, SHARE_TOKEN_TTL_MS } from '@/lib/draft/share-token'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  // Cada llamada acuña un token nuevo en la base.
  const rl = checkRateLimit(`draft-share-link:${user.id}`, 10, 60 * 60 * 1000)
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429, headers: rateLimitHeaders(rl) })

  const { data: d } = await supabase
    .from('tournament_drafts')
    .select('owner_id')
    .eq('id', params.id)
    .single()
  if (!d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner' }, { status: 403 })

  const token = generateShareToken()
  const expiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_MS).toISOString()

  await supabase.from('tournament_draft_share_tokens').insert({
    token,
    draft_id: params.id,
    created_by: user.id,
    expires_at: expiresAt,
  })

  return NextResponse.json({ ok: true, token, expires_at: expiresAt })
}
