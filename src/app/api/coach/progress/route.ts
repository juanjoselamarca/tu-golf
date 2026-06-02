import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { loadProgressDashboard } from '@/golf/coach/v3/progress/dashboard'

export const dynamic = 'force-dynamic'

/** Datos del dashboard de progreso del coach: foco + serie de avance + plan + meta. */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })
    }
    const admin = createAdminClient()
    const data = await loadProgressDashboard(supabase, admin, user.id)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
