import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('rondas_libres')
    .update({ estado: 'finalizada' })
    .eq('estado', 'en_curso')
    .lt('created_at', cutoff)
    .select('id')

  if (error) return NextResponse.json({ error: 'Error al procesar la solicitud. Intenta de nuevo.' }, { status: 500 })

  const count = data?.length ?? 0

  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: { action: 'force_close_rondas', entity: 'rondas_libres', details: { count, cutoff } },
  })

  return NextResponse.json({ closed: count })
}
