/**
 * POST /api/push/round-update
 *
 * Send push notifications to spectators watching a specific round.
 * NOT admin-only — any authenticated user can trigger for rounds they participate in.
 *
 * Uses `round_watchers` table to target only followers of this round.
 * Skips the sender to avoid duplicate notifications.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { formatVsPar } from '@/golf/share/vs-par'

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

interface PlayerData {
  nombre: string
  vsPar: number
  holesCompleted: number
  gwi?: number
}

function buildBody(players: PlayerData[]): string {
  return players
    .slice(0, 4)
    .map(p => {
      const lastName = p.nombre.split(' ').pop() ?? p.nombre
      const score = formatVsPar(p.vsPar)
      const gwi = p.gwi != null && p.holesCompleted >= 6
        ? ` ${Math.round(p.gwi)}%`
        : ''
      return `${lastName} ${score}${gwi}`
    })
    .join(' | ')
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit by user (not IP) — 30 per minute is generous for score saves
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rl = checkRateLimit(`push-round:${user.id}`, 30, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    const body = await request.json()
    const { codigo, players, courseName, maxHole, finished } = body as {
      codigo: string
      players: PlayerData[]
      courseName: string
      maxHole: number
      finished?: boolean
    }

    if (!codigo || !players || !courseName) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    ensureVapidInitialized()

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Validate: the round exists and is active (or just finished)
    const { data: ronda } = await supabase
      .from('rondas_libres')
      .select('id, estado')
      .eq('codigo', codigo)
      .single()

    if (!ronda) {
      return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 })
    }

    // Get watchers for this round
    const { data: watchers } = await supabase
      .from('round_watchers')
      .select('user_id')
      .eq('ronda_codigo', codigo)

    if (!watchers || watchers.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    // Get push subscriptions for watchers (excluding sender)
    const watcherIds = watchers
      .map(w => w.user_id)
      .filter(id => id !== user.id)

    if (watcherIds.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .in('user_id', watcherIds)

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

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
      subscriptions.map(async (sub) => {
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

    if (staleEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    return NextResponse.json({ sent, failed, cleaned: staleEndpoints.length })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
