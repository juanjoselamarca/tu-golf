/**
 * POST /api/push/round-update
 *
 * Send push notification updates to spectators following a specific round.
 * NOT admin-only — any authenticated participant can trigger this.
 *
 * Body:
 * - codigo: string — round code
 * - players: Array<{ nombre, vsPar, holesCompleted, totalHoles }>
 * - courseName: string
 * - maxHole: number
 * - finished?: boolean
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

let vapidInitialized = false
function ensureVapidInitialized() {
  if (vapidInitialized) return
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT_EMAIL || 'mailto:juanjoselamarca@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  vapidInitialized = true
}

interface Player {
  nombre: string
  vsPar: number
  holesCompleted: number
  totalHoles: number
}

function formatVsPar(vsPar: number): string {
  if (vsPar === 0) return 'E'
  if (vsPar > 0) return `+${vsPar}`
  return `${vsPar}`
}

function buildBody(players: Player[]): string {
  return players
    .slice(0, 4)
    .map(p => {
      const lastName = p.nombre.split(' ').pop() ?? p.nombre
      return `${lastName} ${formatVsPar(p.vsPar)}`
    })
    .join(' | ')
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
    const rl = checkRateLimit(`push-round:${ip}`, 30, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    // Auth: any logged-in user can trigger (they're a participant or spectator)
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { codigo, players, courseName, maxHole, finished } = body as {
      codigo: string
      players: Player[]
      courseName: string
      maxHole: number
      finished?: boolean
    }

    if (!codigo || !players || !courseName) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    ensureVapidInitialized()

    // Use service role to access all subscriptions
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get all push subscriptions (spectators may be anyone)
    // We send to ALL subscriptions — the SW uses per-round tags so only
    // users following this round will see it (tag replacement).
    // Future optimization: track round_watchers in DB to filter here.
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    // Don't push to the sender (they already have local notifications)
    const targetSubs = subscriptions.filter(s => s.user_id !== user.id)

    const sorted = [...players].sort((a, b) => a.vsPar - b.vsPar)
    const tag = `golfers-spectator-${codigo}`
    const title = finished
      ? `Resultado final · ${courseName}`
      : `${courseName} · H${maxHole}`

    const pushPayload = JSON.stringify({
      title,
      body: buildBody(sorted),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag,
      rondaCodigo: codigo,
      type: 'spectator',
      data: {
        url: `/ronda-libre/${codigo}${finished ? '?finished=true' : ''}`,
        rondaCodigo: codigo,
      },
    })

    let sent = 0
    let failed = 0
    const staleEndpoints: string[] = []

    await Promise.allSettled(
      targetSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            pushPayload
          )
          sent++
        } catch (err: unknown) {
          failed++
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 410 || statusCode === 404) {
            staleEndpoints.push(sub.endpoint)
          }
        }
      })
    )

    // Cleanup stale subscriptions
    if (staleEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    return NextResponse.json({ sent, failed, cleaned: staleEndpoints.length })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
