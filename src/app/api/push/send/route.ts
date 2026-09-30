/**
 * POST /api/push/send — envío manual de push (admin). Entrega y limpieza de
 * suscripciones muertas vía src/lib/push/deliver (fuente única con
 * /api/push/round-update).
 *
 * Body:
 * - userIds?: string[] — usuarios a notificar. Sin userIds → todas las
 *   suscripciones de usuarios CON cuenta. Los dispositivos anónimos (siguen
 *   una ronda sin registrarse) sólo entran con `includeAnonymous: true`
 *   explícito: nunca consintieron un broadcast.
 * - includeAnonymous?: boolean
 * - payload: { title, body, icon?, badge?, tag?, url?, image? }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { captureError } from '@/lib/error-tracking'
import { deliverToSubscriptions, sendWebPush, TTL_ROUND_FINISHED_SECONDS, type PushSubscriptionRow } from '@/lib/push/deliver'
import { deleteStaleSubscriptions } from '@/lib/push/subscriptions'

export const dynamic = 'force-dynamic'

interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  url?: string
  image?: string
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!(await isAdmin(user?.id, supabaseAuth))) {
      return NextResponse.json({ error: 'No tienes permisos para esta acción' }, { status: 403 })
    }

    const body = await request.json()
    const { userIds, includeAnonymous, payload } = body as {
      userIds?: string[]
      includeAnonymous?: boolean
      payload: PushPayload
    }

    if (!payload?.title) {
      return NextResponse.json({ error: 'Missing payload.title' }, { status: 400 })
    }

    const admin = createAdminClient()
    let query = admin.from('push_subscriptions').select('endpoint, p256dh, auth')
    if (userIds && userIds.length > 0) query = query.in('user_id', userIds)
    else if (includeAnonymous !== true) query = query.not('user_id', 'is', null)

    const { data: subscriptions, error } = await query
    if (error) {
      void captureError(error, { context: 'push.send.fetch', userId: user?.id })
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
    }
    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0 })
    }

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag || 'golfers-notification',
      data: { url: payload.url || '/' },
      image: payload.image,
    })

    const result = await deliverToSubscriptions(
      subscriptions as PushSubscriptionRow[],
      pushPayload,
      sendWebPush,
      { ttlSeconds: TTL_ROUND_FINISHED_SECONDS },
    )
    await deleteStaleSubscriptions(admin, result.staleEndpoints)

    return NextResponse.json({
      sent: result.sent,
      failed: result.failed,
      cleaned: result.staleEndpoints.length,
      total: subscriptions.length,
    })
  } catch (err) {
    void captureError(err, { context: 'push.send' })
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500 })
  }
}
