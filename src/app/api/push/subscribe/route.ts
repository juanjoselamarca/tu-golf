/**
 * /api/push/subscribe — registra / borra la suscripción push de un usuario
 * autenticado. Escribe con service role vía src/lib/push/subscriptions (las
 * políticas RLS de push_subscriptions ya no permiten filas con user_id NULL
 * desde el cliente; ver migración 20260929_round_watchers_anon.sql).
 *
 * Los espectadores sin cuenta no usan este endpoint: su suscripción se
 * registra al seguir una ronda (/api/push/follow).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, clientIpFrom, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { PushSubscriptionJsonSchema } from '@/lib/push/schemas'
import { upsertPushSubscription, deleteUserSubscription, SubscriptionOwnershipError } from '@/lib/push/subscriptions'

export const dynamic = 'force-dynamic'

const SubscribeSchema = z.object({ subscription: PushSubscriptionJsonSchema })
const UnsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) })

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`push-subscribe:${clientIpFrom(request)}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const parsed = SubscribeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos de suscripción inválidos' }, { status: 400 })
  }

  try {
    await upsertPushSubscription(createAdminClient(), { subscription: parsed.data.subscription, userId: user.id })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof SubscriptionOwnershipError) {
      return NextResponse.json({ error: 'La suscripción pertenece a otro dispositivo' }, { status: 409 })
    }
    void captureError(err, { context: 'push.subscribe', userId: user.id })
    return NextResponse.json({ error: 'Error al guardar suscripción' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(`push-unsubscribe:${clientIpFrom(request)}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const parsed = UnsubscribeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 })
  }

  try {
    // Sólo borra suscripciones del usuario autenticado.
    await deleteUserSubscription(createAdminClient(), user.id, parsed.data.endpoint)
    return NextResponse.json({ success: true })
  } catch (err) {
    void captureError(err, { context: 'push.unsubscribe', userId: user.id })
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500 })
  }
}
