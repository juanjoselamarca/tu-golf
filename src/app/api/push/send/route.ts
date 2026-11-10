/**
 * POST /api/push/send — envío manual de push (admin). Entrega y limpieza de
 * suscripciones muertas vía src/lib/push/deliver (fuente única con
 * /api/push/round-update).
 *
 * Body:
 * - userIds?: string[] — usuarios a notificar (lista NO vacía de UUID). Sin userIds → todas las
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
import { isUuid } from '@/lib/uuid'
import { captureError } from '@/lib/error-tracking'
import { deliverToSubscriptions, sendWebPush, TTL_ROUND_FINISHED_SECONDS, type PushSubscriptionRow } from '@/lib/push/deliver'
import { deleteStaleSubscriptions } from '@/lib/push/subscriptions'

export const dynamic = 'force-dynamic'

interface PushPayload {
  title: string
  body?: string
  icon?: string
  badge?: string
  tag?: string
  url?: string
  image?: string
}

type SendBody =
  | { ok: true; userIds: string[] | null; includeAnonymous: boolean; payload: PushPayload }
  | { ok: false; error: string }

const OPCIONALES_TEXTO = ['body', 'icon', 'badge', 'tag', 'url', 'image'] as const

/**
 * Valida el cuerpo. La regla que importa: un broadcast se pide OMITIENDO
 * `userIds`; una lista vacía (un filtro que no encontró a nadie) es un error,
 * nunca "todos". Antes `userIds && userIds.length > 0` mandaba la lista vacía
 * al broadcast, y un `includeAnonymous: "false"` en texto no se distinguía.
 */
function parseSendBody(raw: unknown): SendBody {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Cuerpo inválido.' }
  }
  const body = raw as Record<string, unknown>

  let userIds: string[] | null = null
  if (body.userIds !== undefined) {
    if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
      return { ok: false, error: 'userIds debe ser una lista no vacía. Para enviar a todos, omite userIds.' }
    }
    if (!body.userIds.every(isUuid)) {
      return { ok: false, error: 'userIds contiene un id inválido.' }
    }
    userIds = body.userIds
  }

  if (body.includeAnonymous !== undefined && typeof body.includeAnonymous !== 'boolean') {
    return { ok: false, error: 'includeAnonymous debe ser true o false.' }
  }

  const p = body.payload
  if (typeof p !== 'object' || p === null || Array.isArray(p)) {
    return { ok: false, error: 'Falta payload.' }
  }
  const payload = p as Record<string, unknown>
  if (typeof payload.title !== 'string' || !payload.title.trim()) {
    return { ok: false, error: 'Falta payload.title.' }
  }
  for (const campo of OPCIONALES_TEXTO) {
    if (payload[campo] !== undefined && typeof payload[campo] !== 'string') {
      return { ok: false, error: `payload.${campo} debe ser texto.` }
    }
  }

  return {
    ok: true,
    userIds,
    includeAnonymous: body.includeAnonymous === true,
    payload: payload as unknown as PushPayload,
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!(await isAdmin(user?.id, supabaseAuth))) {
      return NextResponse.json({ error: 'No tienes permisos para esta acción' }, { status: 403 })
    }

    const parsed = parseSendBody(await request.json().catch(() => undefined))
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { userIds, includeAnonymous, payload } = parsed

    const admin = createAdminClient()
    let query = admin.from('push_subscriptions').select('endpoint, p256dh, auth')
    if (userIds) query = query.in('user_id', userIds)
    else if (!includeAnonymous) query = query.not('user_id', 'is', null)

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
