/**
 * /api/push/follow — seguir / dejar de seguir una ronda libre en ESTE dispositivo.
 *
 * Funciona con y sin cuenta (decisión de producto 29-sep-2026, inbox c09c8391).
 *
 * Identidad del watcher:
 *  - con sesión  → user_id (recibe en todos sus dispositivos). Además se
 *    registra/refresca la suscripción del dispositivo actual: antes sólo se
 *    guardaba la primera vez que el usuario daba permiso, y un endpoint rotado
 *    dejaba al usuario "siguiendo" sin que le llegara nada.
 *  - sin sesión  → push_subscription_id (recibe en este dispositivo).
 *
 * Seguridad:
 *  - Nada de esto pasa por RLS de cliente: service role tras validar el request.
 *  - El endpoint tiene que ser de un servicio de push reconocido (allowlist).
 *  - Un endpoint ya registrado sólo se toca con su mismo secreto `auth`
 *    (prueba de posesión): con otro → 409 sin escribir. Igual para dejar de seguir.
 *  - Tope de seguidores por ronda (MAX_WATCHERS_PER_ROUND) y rate limit por IP.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, clientIpFrom, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { RondaCodigoSchema, PushSubscriptionJsonSchema, PushSubscriptionProofSchema } from '@/lib/push/schemas'
import { upsertPushSubscription, findOwnedSubscription, SubscriptionOwnershipError } from '@/lib/push/subscriptions'
import { addWatcher, removeWatcher, WatcherLimitError } from '@/lib/push/watchers'

export const dynamic = 'force-dynamic'

const FollowSchema = z.object({
  codigo: RondaCodigoSchema,
  subscription: PushSubscriptionJsonSchema,
})

const UnfollowSchema = z.object({
  codigo: RondaCodigoSchema,
  subscription: PushSubscriptionProofSchema.optional(),
})

const RATE_LIMIT_PER_MINUTE = 20

function tooMany(rl: ReturnType<typeof checkRateLimit>) {
  return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: rateLimitHeaders(rl) })
}

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`push-follow:${clientIpFrom(request)}`, RATE_LIMIT_PER_MINUTE, 60_000)
  if (!rl.allowed) return tooMany(rl)

  const raw = await request.json().catch(() => null)
  const parsed = FollowSchema.safeParse(raw)
  if (!parsed.success) {
    // Un host de push desconocido se registra: si es legítimo, se agrega a la allowlist.
    const endpoint = (raw as { subscription?: { endpoint?: unknown } } | null)?.subscription?.endpoint
    if (typeof endpoint === 'string') {
      void captureError('push endpoint rechazado', { context: 'push.follow.endpoint', level: 'warning', meta: { endpoint: endpoint.slice(0, 120) } })
    }
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const { codigo, subscription } = parsed.data

  try {
    const userId = await currentUserId()
    const admin = createAdminClient()

    const { data: ronda } = await admin
      .from('rondas_libres')
      .select('id, estado')
      .eq('codigo', codigo)
      .maybeSingle()
    if (!ronda) return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    if (ronda.estado !== 'en_curso') {
      return NextResponse.json({ error: 'La ronda ya terminó' }, { status: 409 })
    }

    const { id: subscriptionId } = await upsertPushSubscription(admin, {
      subscription,
      userId: userId ?? undefined,
    })
    const identity = userId
      ? { kind: 'user' as const, userId }
      : { kind: 'device' as const, subscriptionId }
    await addWatcher(admin, codigo, identity)

    return NextResponse.json({ following: true, identity: identity.kind })
  } catch (err) {
    if (err instanceof SubscriptionOwnershipError) {
      return NextResponse.json({ error: 'La suscripción pertenece a otro dispositivo' }, { status: 409 })
    }
    if (err instanceof WatcherLimitError) {
      return NextResponse.json({ error: 'Esta ronda ya tiene el máximo de seguidores' }, { status: 429 })
    }
    void captureError(err, { context: 'push.follow', meta: { codigo } })
    return NextResponse.json({ error: 'No se pudo activar el seguimiento' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(`push-unfollow:${clientIpFrom(request)}`, RATE_LIMIT_PER_MINUTE, 60_000)
  if (!rl.allowed) return tooMany(rl)

  const parsed = UnfollowSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const { codigo, subscription } = parsed.data

  try {
    const userId = await currentUserId()
    if (!userId && !subscription) {
      return NextResponse.json({ error: 'Falta la suscripción del dispositivo' }, { status: 400 })
    }
    const admin = createAdminClient()

    if (userId) await removeWatcher(admin, codigo, { kind: 'user', userId })

    if (subscription) {
      const owned = await findOwnedSubscription(admin, subscription.endpoint, subscription.keys.auth)
      if (!owned && !userId) {
        return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
      }
      if (owned) await removeWatcher(admin, codigo, { kind: 'device', subscriptionId: owned.id })
    }

    return NextResponse.json({ following: false })
  } catch (err) {
    void captureError(err, { context: 'push.unfollow', meta: { codigo } })
    return NextResponse.json({ error: 'No se pudo dejar de seguir' }, { status: 500 })
  }
}
