import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { isAdmin } from '@/lib/admin'
import webpush from 'web-push'

// Configure web-push with VAPID keys
webpush.setVapidDetails(
  'mailto:juanjoselamarca@gmail.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  url?: string
  image?: string
}

/**
 * Send push notification to specific users or all subscribers of a round.
 *
 * Body:
 * - userIds?: string[] — specific users to notify
 * - rondaCodigo?: string — notify all subscribers watching this round
 * - payload: PushPayload
 */
export async function POST(request: Request) {
  try {
    // Admin authentication check
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!(await isAdmin(user?.id, supabaseAuth))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { userIds, rondaCodigo, payload } = body as {
      userIds?: string[]
      rondaCodigo?: string
      payload: PushPayload
    }

    if (!payload?.title) {
      return NextResponse.json({ error: 'Missing payload.title' }, { status: 400 })
    }

    // Use service role to access all subscriptions
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Build query for subscriptions
    let query = supabase.from('push_subscriptions').select('endpoint, p256dh, auth, user_id')

    if (userIds && userIds.length > 0) {
      query = query.in('user_id', userIds)
    }
    // If rondaCodigo, we send to ALL subscriptions (spectators may be anonymous)
    // In a more advanced system, we'd track which users are watching which rounds

    const { data: subscriptions, error } = await query
    if (error) {
      console.error('Error fetching subscriptions:', error)
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0 })
    }

    // Build the push payload
    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: payload.badge || '/icons/badge-72x72.png',
      tag: payload.tag || 'golfers-notification',
      data: {
        url: payload.url || '/',
      },
      image: payload.image,
    })

    // Send to all subscriptions
    let sent = 0
    let failed = 0
    const staleEndpoints: string[] = []

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            pushPayload
          )
          sent++
        } catch (err: unknown) {
          failed++
          // Remove stale subscriptions (410 Gone or 404)
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 410 || statusCode === 404) {
            staleEndpoints.push(sub.endpoint)
          }
        }
      })
    )

    // Cleanup stale subscriptions
    if (staleEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', staleEndpoints)
    }

    return NextResponse.json({
      sent,
      failed,
      cleaned: staleEndpoints.length,
      total: subscriptions.length,
    })
  } catch (err) {
    console.error('Push send error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
