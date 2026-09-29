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
 *  - Un anónimo sólo puede tocar la suscripción cuyo secreto `auth` conoce
 *    (prueba de posesión del dispositivo). No puede listar ni borrar ajenas.
 *  - Rate limit por IP.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { PushSubscriptionJsonSchema, upsertPushSubscription, findOwnedSubscription } from '@/lib/push/subscriptions'
import { addWatcher, removeWatcher } from '@/lib/push/watchers'

export const dynamic = 'force-dynamic'

const CodigoSchema = z.string().trim().min(1).max(50)

const FollowSchema = z.object({
  codigo: CodigoSchema,
  subscription: PushSubscriptionJsonSchema,
})

const UnfollowSchema = z.object({
  codigo: CodigoSchema,
  subscription: z.object({
    endpoint: z.string().url().max(2048),
    keys: z.object({ auth: z.string().min(8).max(256) }),
  }).optional(),
})

const RATE_LIMIT_PER_MINUTE = 20

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

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
  const rl = checkRateLimit(`push-follow:${clientIp(request)}`, RATE_LIMIT_PER_MINUTE, 60_000)
  if (!rl.allowed) return tooMany(rl)

  const parsed = FollowSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
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
    void captureError(err, { context: 'push.follow', meta: { codigo } })
    return NextResponse.json({ error: 'No se pudo activar el seguimiento' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(`push-unfollow:${clientIp(request)}`, RATE_LIMIT_PER_MINUTE, 60_000)
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
