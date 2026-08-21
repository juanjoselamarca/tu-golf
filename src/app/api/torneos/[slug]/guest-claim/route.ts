/**
 * POST /api/torneos/[slug]/guest-claim
 *
 * Migra los datos de un jugador invitado a la cuenta recién creada.
 * Requiere autenticación (el usuario acaba de crear su cuenta) + guestId en el body.
 *
 * Lo que hace:
 *   1. Busca al player con pending_user_id === guestId en este torneo
 *   2. Verifica que el player existe y que user_id es NULL (invitado)
 *   3. Actualiza user_id al usuario autenticado, limpia pending_user_id/player_name
 *   4. Actualiza el profiles.name si estaba vacío
 *
 * Body: { guestId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const guestId = body?.guestId as string | undefined
  if (!guestId) {
    return NextResponse.json({ error: 'missing_guest_id', message: 'Falta el ID de invitado.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Buscar el torneo
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id')
    .eq('slug', params.slug)
    .maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'not_found', message: 'Torneo no encontrado.' }, { status: 404 })
  }

  // Buscar al jugador invitado
  const { data: player } = await admin
    .from('players')
    .select('id, player_name, user_id')
    .eq('tournament_id', tournament.id)
    .eq('pending_user_id', guestId)
    .maybeSingle()

  if (!player) {
    return NextResponse.json({ error: 'not_found', message: 'No se encontró al jugador invitado.' }, { status: 404 })
  }

  // El player ya fue reclamado por otro usuario
  if (player.user_id != null) {
    return NextResponse.json({
      error: 'already_claimed',
      message: 'Este jugador ya está vinculado a una cuenta.',
    }, { status: 409 })
  }

  // Verificar que el usuario no esté ya inscrito como otro player en este torneo
  const { data: existingPlayer } = await admin
    .from('players')
    .select('id')
    .eq('tournament_id', tournament.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingPlayer) {
    return NextResponse.json({
      error: 'already_registered',
      message: 'Ya estás inscrito en este torneo con tu cuenta.',
    }, { status: 409 })
  }

  // Migrar: asignar user_id, limpiar pending_user_id
  // La constraint players_identity_check requiere que exactamente uno de
  // user_id/pending_user_id sea non-null.
  const { error: updateError } = await admin
    .from('players')
    .update({
      user_id: user.id,
      pending_user_id: null,
    })
    .eq('id', player.id)

  if (updateError) {
    return NextResponse.json({
      error: 'update_failed',
      message: 'No se pudo vincular tu cuenta. Intenta nuevamente.',
    }, { status: 500 })
  }

  // Si el perfil del usuario no tiene nombre, usar el nombre del invitado
  if (player.player_name) {
    const { data: profile } = await admin
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .maybeSingle()
    if (profile && !profile.name) {
      await admin
        .from('profiles')
        .update({ name: player.player_name })
        .eq('id', user.id)
    }
  }

  return NextResponse.json({ ok: true, playerId: player.id })
}
