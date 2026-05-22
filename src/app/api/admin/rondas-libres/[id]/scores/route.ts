import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const { id: rondaId } = await params
  const body = await request.json()
  const { jugadorId, scores } = body

  if (!jugadorId || !scores) {
    return NextResponse.json({ error: 'Se requiere jugadorId y scores' }, { status: 400 })
  }

  // Audit 2026-05-17 P0 #1: merge server-side vía RPC también en admin route.
  // La RPC requiere `codigo` para validar atómicamente que la ronda existe + en_curso.
  const { data: ronda, error: rondaErr } = await admin
    .from('rondas_libres')
    .select('codigo')
    .eq('id', rondaId)
    .single()
  if (rondaErr || !ronda) return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })

  const { data, error } = await admin.rpc('upsert_ronda_libre_scores', {
    p_jugador_id: jugadorId,
    p_codigo: ronda.codigo,
    p_delta: scores,
  })

  if (error) return NextResponse.json({ error: 'Error al procesar la solicitud. Intenta de nuevo.' }, { status: 500 })

  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    metadata: { action: 'edit_ronda_scores', entity: 'ronda_libre_jugadores', entityId: jugadorId, details: { rondaId, scores } },
  })

  return NextResponse.json({ jugador: data })
}
