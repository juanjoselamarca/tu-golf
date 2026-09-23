import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const BETA_CODE = 'TAIGER25'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Rate limit: 5 intentos por hora por usuario (previene brute-force del código beta)
  const rl = checkRateLimit(`coach-activate:${user.id}`, 5, 3600_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Intenta más tarde.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Código requerido' }, { status: 400 })
  }

  const code = (body.code ?? '').trim().toUpperCase()
  if (code !== BETA_CODE) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 403 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ coach_access_enabled: true })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Error al activar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
