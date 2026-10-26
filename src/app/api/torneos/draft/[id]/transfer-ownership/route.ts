import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { captureError } from '@/lib/error-tracking'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/torneos/draft/[id]/transfer-ownership
 *
 * El dueño del borrador se lo pasa a un colaborador existente. Solo cambia
 * `tournament_drafts.owner_id`: el trigger `guard_tournament_drafts_owner_change`
 * (migración 20261026000000) exige que lo haga el dueño actual y que el nuevo sea
 * colaborador, y deja los roles de `tournament_draft_collaborators` en la misma
 * transacción. Antes la ruta también intentaba cambiar los roles con el cliente
 * del usuario, pero esa tabla no tiene policy de UPDATE: afectaban 0 filas en silencio.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { new_owner_id?: unknown } | null
  const new_owner_id = body?.new_owner_id
  if (typeof new_owner_id !== 'string' || !UUID_RE.test(new_owner_id)) {
    return NextResponse.json({ error: 'new_owner_id inválido' }, { status: 400 })
  }
  if (new_owner_id === user.id) {
    return NextResponse.json({ error: 'Ya eres el dueño de este borrador' }, { status: 400 })
  }

  const { data: d } = await supabase
    .from('tournament_drafts')
    .select('owner_id')
    .eq('id', params.id)
    .single()
  if (!d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede transferir' }, { status: 403 })

  // El nuevo owner debe estar como collaborator
  const { data: c } = await supabase
    .from('tournament_draft_collaborators')
    .select('role')
    .eq('draft_id', params.id)
    .eq('user_id', new_owner_id)
    .single()
  if (!c) return NextResponse.json({ error: 'El nuevo owner debe ser collaborator primero' }, { status: 400 })

  const { data: actualizado, error: upErr } = await supabase
    .from('tournament_drafts')
    .update({ owner_id: new_owner_id })
    .eq('id', params.id)
    .eq('owner_id', user.id)
    .select('id')
  if (upErr || !actualizado || actualizado.length === 0) {
    await captureError(upErr ?? new Error('transfer-ownership: 0 filas actualizadas'), {
      context: 'draft.transfer-ownership',
      userId: user.id,
      meta: { draftId: params.id },
    })
    return NextResponse.json({ error: 'No se pudo transferir el borrador' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
