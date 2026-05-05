import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { buildPlayerContext } from '@/golf/coach/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })
    const ctx = await buildPlayerContext(supabase, user.id)
    return NextResponse.json(ctx)
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
