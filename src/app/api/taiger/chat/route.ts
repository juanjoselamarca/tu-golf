import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { TAIGER_SYSTEM_PROMPT, buildContextString } from '@/lib/taiger-prompt'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Servicio no configurado' }, { status: 503 })
    }

    const body = await req.json()
    const { message, session_type = 'chat', ronda_libre_id } = body as {
      message: string
      session_type?: string
      ronda_libre_id?: string
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    // Prevent duplicate sessions for same ronda_libre_id
    if (ronda_libre_id) {
      const { data: existing } = await supabase
        .from('taiger_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('ronda_libre_id', ronda_libre_id)
        .maybeSingle()

      if (existing) {
        return NextResponse.json(
          { error: 'Ya existe una sesión para esta ronda' },
          { status: 409 }
        )
      }
    }

    // Freemium limit: 3 sessions/month (exclude onboarding)
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('taiger_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .neq('session_type', 'onboarding')
      .gte('created_at', startOfMonth.toISOString())

    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { error: 'Límite mensual alcanzado (3 sesiones). Próximamente plan Premium.' },
        { status: 429 }
      )
    }

    // Fetch context from /api/taiger/context forwarding cookies
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003'
    const cookieHeader = req.headers.get('cookie') || ''
    const ctxRes = await fetch(`${baseUrl}/api/taiger/context`, {
      headers: { cookie: cookieHeader },
    })

    if (!ctxRes.ok) {
      return NextResponse.json({ error: 'No se pudo obtener contexto del jugador' }, { status: 502 })
    }

    const ctx = await ctxRes.json()
    const contextString = buildContextString(ctx)

    // Stream response using Claude API
    const anthropic = new Anthropic({ apiKey })

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `${TAIGER_SYSTEM_PROMPT}\n\nDATOS DEL JUGADOR:\n${contextString}`,
      messages: [{ role: 'user', content: message }],
    })

    let fullResponse = ''

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const text = event.delta.text
              fullResponse += text
              const sseData = `data: ${JSON.stringify({ text })}\n\n`
              controller.enqueue(new TextEncoder().encode(sseData))
            }
          }

          // Save session after streaming completes
          await supabase.from('taiger_sessions').insert({
            user_id: user.id,
            session_type,
            ronda_libre_id: ronda_libre_id || null,
            user_message: message,
            coach_response: fullResponse,
            techniques_assigned: [],
            next_focus: null,
          })

          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Stream error'
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
