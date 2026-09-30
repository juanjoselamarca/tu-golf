/**
 * POST /api/push/resubscribe — el servicio de push rotó la suscripción del
 * dispositivo (evento `pushsubscriptionchange` en public/sw.js).
 *
 * Body: { old: { endpoint, keys: { auth } }, subscription }. La prueba de
 * posesión es la vieja (endpoint + auth); la fila se actualiza en su lugar y
 * los watchers del dispositivo sobreviven. Sin sesión: el SW corre sin cookies
 * de app necesariamente, y los espectadores anónimos también rotan.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, clientIpFrom, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { PushSubscriptionJsonSchema, PushSubscriptionProofSchema } from '@/lib/push/schemas'
import { rotatePushSubscription, SubscriptionOwnershipError } from '@/lib/push/subscriptions'

export const dynamic = 'force-dynamic'

const ResubscribeSchema = z.object({
  old: PushSubscriptionProofSchema,
  subscription: PushSubscriptionJsonSchema,
})

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`push-resubscribe:${clientIpFrom(request)}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const parsed = ResubscribeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const { old, subscription } = parsed.data

  try {
    const rotated = await rotatePushSubscription(createAdminClient(), { endpoint: old.endpoint, auth: old.keys.auth }, subscription)
    if (!rotated) return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    return NextResponse.json({ rotated: true })
  } catch (err) {
    if (err instanceof SubscriptionOwnershipError) {
      return NextResponse.json({ error: 'El endpoint nuevo ya está registrado por otro dispositivo', code: 'device_owned_by_other' }, { status: 409 })
    }
    void captureError(err, { context: 'push.resubscribe' })
    return NextResponse.json({ error: 'No se pudo actualizar la suscripción' }, { status: 500 })
  }
}
