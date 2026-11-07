import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { captureError } from '@/lib/error-tracking'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // Sin sesión es un rechazo, no una respuesta normal: una ruta de admin/ que contesta
    // 200 al anónimo lee como "abierta" en cualquier sonda (auditoría de auth 05-nov-2026).
    // El panel (/admin/sistema) muestra el JSON tal cual, con cualquier status.
    if (!user) {
      return NextResponse.json({ step: 'auth', error: authError?.message || 'No user', user: null }, { status: 401 })
    }

    // Admin check — this endpoint exposes sensitive auth debug info
    if (!(await isAdmin(user.id, supabase))) {
      return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })
    }

    const { data: profile, error: profileError } = await createAdminClient()
      .from('profiles')
      .select('id, email, role')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      step: 'complete',
      userId: user.id,
      email: user.email,
      profile,
      profileError: profileError?.message || null,
      isAdmin: profile?.role === 'admin',
    })
  } catch (err) {
    // El detalle va al tracking, no al cliente: acá puede haber llegado alguien sin sesión.
    void captureError(err, { context: 'api.admin.debug-auth' })
    return NextResponse.json({ step: 'crash' }, { status: 500 })
  }
}
