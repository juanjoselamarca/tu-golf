import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { TAIGER_SYSTEM_PROMPT, buildContextString, SESSION_STARTERS } from '@/golf/coach/prompts'
export const dynamic = 'force-dynamic'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Servicio no configurado' }, { status: 503 })
    }

    const body = await req.json()
    const { ronda_libre_id } = body as {
      message?: string
      messages?: Array<{ role: string; content: string }>
      session_type?: string
      ronda_libre_id?: string
    }

    // Accept both 'message' (string) and 'messages' (array)
    let userMessage: string
    if (body.message && typeof body.message === 'string') {
      userMessage = body.message
    } else if (Array.isArray(body.messages) && body.messages.length > 0) {
      const lastUser = [...body.messages].reverse().find((m: { role: string }) => m.role === 'user')
      userMessage = lastUser?.content ?? ''
    } else {
      userMessage = ''
    }

    if (!userMessage.trim()) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    // Normalize session_type to valid DB values
    const validTypes = ['post_round', 'weekly_plan', 'pre_tournament', 'onboarding', 'free']
    const rawType = body.session_type || 'free'
    const session_type = validTypes.includes(rawType) ? rawType : 'free'

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
        { error: 'Llegaste al límite de 3 sesiones este mes. Escríbenos por WhatsApp para acceso ilimitado.', code: 'limit_reached', whatsapp: 'https://wa.me/56912345678?text=Quiero%20tAIger%2B%20Premium' },
        { status: 429 }
      )
    }

    // Fetch context from /api/taiger/context forwarding cookies
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003'
    const cookieHeader = req.headers.get('cookie') || ''
    let ctxRes: Response
    try {
      ctxRes = await fetch(`${baseUrl}/api/taiger/context`, {
        headers: { cookie: cookieHeader },
      })
    } catch (fetchErr) {
      console.error('[tAIger/chat] Error fetching context:', fetchErr)
      return NextResponse.json({ error: 'No se pudo conectar con el servicio de contexto' }, { status: 502 })
    }

    if (!ctxRes.ok) {
      return NextResponse.json({ error: 'No se pudo obtener contexto del jugador' }, { status: 502 })
    }

    const ctx = await ctxRes.json()
    const contextString = buildContextString(ctx)

    // Build system prompt with player context and session starter
    const systemWithContext = TAIGER_SYSTEM_PROMPT.replace(
      '{PLAYER_CONTEXT}',
      contextString
    )
    const sessionStarter = SESSION_STARTERS[session_type] ?? SESSION_STARTERS.free

    // Stream response using Claude API
    const anthropic = new Anthropic({ apiKey })

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `${systemWithContext}\n\nINSTRUCCIÓN DE SESIÓN:\n${sessionStarter}`,
      messages: [{ role: 'user', content: userMessage }],
    })

    let fullResponse = ''
    const encoder = new TextEncoder()

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
          const { data: savedSession } = await supabase.from('taiger_sessions').insert({
            user_id: user.id,
            session_type,
            ronda_libre_id: ronda_libre_id || null,
            messages: [
              { role: 'user', content: userMessage },
              { role: 'assistant', content: fullResponse },
            ],
            techniques_assigned: [],
            next_focus: fullResponse.substring(0, 200),
          }).select('id').single()

          // Extract and save recommendations from the response
          if (savedSession?.id) {
            try {
              await extractAndSaveRecommendations(
                supabase, user.id, savedSession.id, fullResponse, ctx?.stats?.avg_score ?? null
              )
            } catch (recErr) {
              console.error('[tAIger/chat] Error extracting recommendations:', recErr)
            }
          }

          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ done: true, session_id: savedSession?.id ?? null })}\n\n`
          ))
          controller.close()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error desconocido'
          if (msg.includes('rate_limit') || msg.includes('429')) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'tAIger+ está descansando. Intenta en unos minutos.' })}\n\n`))
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Error de conexión con tAIger+. Intenta de nuevo.' })}\n\n`))
          }
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
  } catch (err) {
    console.error('[tAIger/chat] Error interno:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// --- Recommendation Extraction ---

// Supabase client type for recommendation extraction
// eslint-disable-next-line
type SupabaseClientLike = any

const RECOMMENDATION_TRIGGERS = [
  'te recomiendo',
  'trabaja en',
  'enfócate en',
  'enfocate en',
  'practica',
  'intenta',
  'tu tarea',
  'esta semana',
  'drill',
  'ejercicio',
]

const FOCUS_AREA_KEYWORDS: Record<string, string[]> = {
  putting: ['putt', 'green', '3-putt', 'tres putts', 'gate drill', 'clock drill'],
  driving: ['driver', 'tee shot', 'salida', 'drive', 'tee'],
  short_game: ['chip', 'pitch', 'bunker', 'up and down', 'juego corto', 'wedge', 'lob'],
  approach: ['approach', 'hierro', 'iron', 'gir', 'green en regulación', 'dispersion'],
  mental: ['mental', 'rutina', 'pre-shot', 'confianza', 'presión', 'concentra', 'respira', 'visuali', 'foco', 'mantra'],
  course_management: ['course management', 'estrategia', 'gestión', 'riesgo', 'conservador', 'miss buena'],
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  technique: ['técnica', 'grip', 'stance', 'swing', 'postura', 'alineación'],
  mental: ['mental', 'confianza', 'presión', 'rutina', 'concentra', 'respira', 'visuali', 'mantra', 'foco'],
  practice: ['practica', 'drill', 'ejercicio', 'repet', 'sesión de', 'entren'],
  strategy: ['estrategia', 'gestión', 'plan', 'course management', 'riesgo', 'conservador'],
}

function inferFocusArea(text: string): string {
  const lower = text.toLowerCase()
  let bestArea = 'mental'
  let bestCount = 0
  for (const [area, keywords] of Object.entries(FOCUS_AREA_KEYWORDS)) {
    const count = keywords.filter(kw => lower.includes(kw)).length
    if (count > bestCount) { bestCount = count; bestArea = area }
  }
  return bestArea
}

function inferCategory(text: string): string {
  const lower = text.toLowerCase()
  let bestCat = 'practice'
  let bestCount = 0
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const count = keywords.filter(kw => lower.includes(kw)).length
    if (count > bestCount) { bestCount = count; bestCat = cat }
  }
  return bestCat
}

async function extractAndSaveRecommendations(
  supabase: SupabaseClientLike,
  userId: string,
  sessionId: string,
  responseText: string,
  avgScore: number | null,
) {
  const lines = responseText.split('\n').map(l => l.trim()).filter(Boolean)
  const recommendations: string[] = []

  for (const line of lines) {
    if (recommendations.length >= 3) break

    const lower = line.toLowerCase()

    // Check numbered items (1., 2., 3.) or bullet points
    const isNumbered = /^\d+[\.\)]\s/.test(line)
    const isBullet = /^[-*•]\s/.test(line)
    const hasTrigger = RECOMMENDATION_TRIGGERS.some(t => lower.includes(t))

    if ((isNumbered || isBullet || hasTrigger) && line.length > 20 && line.length < 500) {
      // Clean the line
      const cleaned = line.replace(/^\d+[\.\)]\s*/, '').replace(/^[-*•]\s*/, '').trim()
      if (cleaned.length > 15) {
        recommendations.push(cleaned)
      }
    }
  }

  if (recommendations.length === 0) return

  const inserts = recommendations.map(rec => ({
    user_id: userId,
    session_id: sessionId,
    recommendation: rec,
    category: inferCategory(rec),
    focus_area: inferFocusArea(rec),
    status: 'active',
    score_before: avgScore,
  }))

  await supabase.from('taiger_recommendations').insert(inserts).select('id').then(() => {})
}
