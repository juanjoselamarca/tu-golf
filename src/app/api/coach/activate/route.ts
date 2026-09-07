import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const BETA_CODE = 'TAIGER25'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
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
