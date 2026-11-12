import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { captureError } from '@/lib/error-tracking'
import { pushRoundUpdate } from '@/lib/push/round-update'
import { isUuid } from '@/lib/uuid'
export const dynamic = 'force-dynamic'

/** Los estados que acepta `rondas_libres_estado_check`: cualquier otro valor llegaba al UPDATE y volvía 500. */
const ESTADOS_EDITABLES: readonly unknown[] = ['en_curso', 'finalizada']

const idInvalido = () => NextResponse.json({ error: 'ID de ronda inválido' }, { status: 400 })

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const { id } = await params
  if (!isUuid(id)) return idInvalido()

  const [ronda, jugadores] = await Promise.all([
    admin.from('rondas_libres').select('*').eq('id', id).single(),
    admin.from('ronda_libre_jugadores').select('*, profiles:user_id(id, name, email)').eq('ronda_id', id),
  ])

  if (ronda.error) return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })

  return NextResponse.json({
    ronda: ronda.data,
    jugadores: jugadores.data ?? [],
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const { id } = await params
  if (!isUuid(id)) return idInvalido()
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  // Se valida si la clave VIENE, no si es truthy: con `estado && …` un "" o un 0 saltaban el filtro
  // y llegaban al UPDATE, donde el CHECK de la tabla los rechazaba con un 500.
  const { estado } = body as { estado?: unknown }

  if (estado !== undefined && !ESTADOS_EDITABLES.includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido. Debe ser en_curso o finalizada.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (estado !== undefined) updates.estado = estado

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 })
  }

  const { data, error } = await admin.from('rondas_libres').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Error al procesar la solicitud. Intenta de nuevo.' }, { status: 500 })

  // Cerrar la ronda es su "Resultado final" para quienes la siguen (y limpia sus watchers).
  if (estado === 'finalizada' && data?.codigo) {
    await pushRoundUpdate(admin, data.codigo as string).catch(err =>
      captureError(err, { context: 'push.round-update.admin-estado', meta: { codigo: data.codigo } }))
  }

  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    event_data: { action: 'update_ronda_libre', entity: 'rondas_libres', entityId: id, details: updates },
  })

  return NextResponse.json({ ronda: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })

  const admin = createAdminClient()
  const { id } = await params
  if (!isUuid(id)) return idInvalido()

  // Un solo DELETE: los jugadores caen por la FK ON DELETE CASCADE (ronda_libre_jugadores_ronda_id_fkey).
  // Borrarlos antes dejaba, si el segundo DELETE fallaba, una ronda viva sin jugadores: sus scorers
  // recibían P0001 y limpiaban la tarjeta local de una ronda que seguía existiendo (PR #763).
  const { error } = await admin.from('rondas_libres').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Error al procesar la solicitud. Intenta de nuevo.' }, { status: 500 })

  await admin.from('analytics_events').insert({
    event_type: 'admin_action',
    user_id: user!.id,
    event_data: { action: 'delete_ronda_libre', entity: 'rondas_libres', entityId: id },
  })

  return NextResponse.json({ success: true })
}
