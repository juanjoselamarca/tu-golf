/**
 * POST /api/push/round-update — empuja el estado de una ronda libre a quienes
 * la siguen (app cerrada / en segundo plano).
 *
 * Body: { codigo }. El servidor lee la ronda de la BD y arma la notificación
 * con la fuente única (buildSpectatorNotification). Antes el cliente mandaba
 * los puntajes: llegaba un snapshot viejo con maxHole=0 y Zod lo rechazaba con
 * 400 → ningún push, nunca (inbox f6cca8e3). Además cualquier logueado podía
 * inventar puntajes para los seguidores de cualquier ronda.
 *
 * Requiere sesión (quien anota está logueado). Rate limit por usuario y por
 * ronda; el scorer además acota a 1 llamada cada 15s (shouldThrottlePush).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { buildSpectatorNotification } from '@/golf/notifications/spectator'
import { deliverToSubscriptions, sendWebPush } from '@/lib/push/deliver'
import { deleteStaleSubscriptions } from '@/lib/push/subscriptions'
import { resolveWatcherSubscriptions, removeAllWatchers } from '@/lib/push/watchers'
import { loadRoundForPush } from '@/lib/push/round-snapshot'

export const dynamic = 'force-dynamic'

const RoundUpdateSchema = z.object({
  codigo: z.string().trim().min(1).max(50),
})

export async function POST(request: NextRequest) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const rlUser = checkRateLimit(`push-round:${user.id}`, 30, 60_000)
  if (!rlUser.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: rateLimitHeaders(rlUser) })
  }

  const parsed = RoundUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const { codigo } = parsed.data

  const rlRonda = checkRateLimit(`push-round-codigo:${codigo}`, 12, 60_000)
  if (!rlRonda.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: rateLimitHeaders(rlRonda) })
  }

  try {
    const admin = createAdminClient()

    const snapshot = await loadRoundForPush(admin, codigo)
    if (!snapshot) {
      return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    }

    const subscriptions = await resolveWatcherSubscriptions(admin, codigo)
    if (subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    const finished = snapshot.estado === 'finalizada'
    const notif = buildSpectatorNotification({
      courseName: snapshot.courseName,
      codigo,
      players: snapshot.players,
      totalHoles: snapshot.holes,
      finished,
    })

    // El ícono/badge los pone el Service Worker (public/sw.js): no se manda un
    // path que no existe en /public.
    const payload = JSON.stringify({
      title: notif.title,
      body: notif.body,
      tag: notif.tag,
      type: 'spectator',
      rondaCodigo: codigo,
      finished,
      data: { url: notif.url, rondaCodigo: codigo },
    })

    const result = await deliverToSubscriptions(subscriptions, payload, sendWebPush)
    await deleteStaleSubscriptions(admin, result.staleEndpoints)
    if (finished) await removeAllWatchers(admin, codigo)

    return NextResponse.json({ sent: result.sent, failed: result.failed, cleaned: result.staleEndpoints.length, finished })
  } catch (err) {
    void captureError(err, { context: 'push.round-update', userId: user.id, meta: { codigo } })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
