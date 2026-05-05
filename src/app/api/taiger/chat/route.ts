import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { TAIGER_SYSTEM_PROMPT, buildContextString, TAIGER_SESSION_STARTER } from '@/golf/coach/prompts'
import { TAIGER_TOOLS, executeTool } from '@/golf/coach/tools'
import { getOrCreateActiveSession } from '@/golf/coach/session'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const chatInputSchema = z.object({
  message: z.string().min(1).max(2000).optional(),
  messages: z.array(z.object({
    role: z.string(),
    content: z.string().max(2000),
  })).max(50).optional(),
  // session_id sigue siendo válido para compat con el cliente actual mientras
  // Commit 2 introduce la sesión continua por usuario.
  session_id: z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })
    }

    // Rate limit: 30 mensajes por hora por usuario (protege costos Anthropic)
    const rl = checkRateLimit(`chat:${user.id}`, 30, 60 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Demasiados mensajes. Intenta de nuevo en una hora.' }, { status: 429 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Servicio no configurado' }, { status: 503 })
    }

    const rawBody = await req.json()
    const parsed = chatInputSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Input inválido', details: parsed.error.issues[0]?.message }, { status: 400 })
    }
    const body = parsed.data

    // Build conversation history para multi-turn.
    // Acepta 'messages' (array completo, ideal) o 'message' (string suelto, legacy).
    type ChatMsg = { role: 'user' | 'assistant'; content: string }
    let conversation: ChatMsg[] = []
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      conversation = body.messages
        .filter((m): m is ChatMsg => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0)
        .slice(-20) // últimos 20 turnos: balance entre memoria y costo
    } else if (body.message && typeof body.message === 'string') {
      conversation = [{ role: 'user', content: body.message }]
    }

    // Claude requiere que el primer mensaje sea del usuario
    while (conversation.length > 0 && conversation[0].role !== 'user') conversation.shift()
    // Y que el último mensaje sea del usuario
    while (conversation.length > 0 && conversation[conversation.length - 1].role !== 'user') conversation.pop()

    const userMessage = conversation[conversation.length - 1]?.content ?? ''
    if (!userMessage.trim()) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    // Periodo de prueba interno: sin cuotas mensuales, sin gates, sin bypass admin.
    // La sesion siempre es la primaria del usuario (helper getOrCreateActiveSession).

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
    const sessionStarter = TAIGER_SESSION_STARTER
    const toolsInstruction = `\n\nHERRAMIENTAS DISPONIBLES:\nTienes acceso a tools para consultar datos reales del jugador:\n- get_latest_round: detalle hoyo-por-hoyo de su última ronda finalizada (con pares y strokes vs par)\n- get_round_by_id: detalle de una ronda específica\n- get_recent_rounds: resumen de últimas N rondas (totales, cancha, fecha)\n- get_course_details: pares y stroke index por hoyo de una cancha\n\nREGLA CRÍTICA: Cuando el jugador haga referencia a una ronda específica, cancha, o score concreto — SIEMPRE llama la tool apropiada antes de responder. NUNCA inventes scores, pares, ni asumas configuraciones de hoyos. Si la data no está en tus tools ni en el contexto, dilo honestamente.`

    const anthropic = new Anthropic({ apiKey })
    const systemFinal = `${systemWithContext}\n\nINSTRUCCIÓN DE SESIÓN:\n${sessionStarter}${toolsInstruction}`

    // Contexto para ejecución de tools
    const toolCtx = {
      supabase,
      userId: user.id,
      defaultRondaId: null,
    }

    // Loop de tool use: máx 5 iteraciones para proteger costos/latencia
    type LoopMsg = { role: 'user' | 'assistant'; content: unknown }
    const loopMessages: LoopMsg[] = conversation.map((m) => ({ role: m.role, content: m.content }))
    let fullResponse = ''
    const MAX_TOOL_ITERS = 5
    let done = false

    for (let iter = 0; iter < MAX_TOOL_ITERS && !done; iter++) {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemFinal,
        tools: TAIGER_TOOLS as unknown as Anthropic.Tool[],
        messages: loopMessages as unknown as Anthropic.MessageParam[],
      })

      if (resp.stop_reason === 'tool_use') {
        loopMessages.push({ role: 'assistant', content: resp.content })
        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
        for (const block of resp.content) {
          if (block.type === 'tool_use') {
            const result = await executeTool(block.name, block.input as Record<string, unknown>, toolCtx)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            })
          }
        }
        loopMessages.push({ role: 'user', content: toolResults })
        continue
      }

      // end_turn o max_tokens — recolectar texto final
      for (const block of resp.content) {
        if (block.type === 'text') fullResponse += block.text
      }
      done = true
    }

    if (!fullResponse.trim()) {
      fullResponse = 'Se me acabaron los pasos de análisis. ¿Puedes reformular tu pregunta?'
    }

    const encoder = new TextEncoder()

    // Emitir el texto final como SSE en chunks para preservar la UX de typing.
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Chunkear por palabra (~30 chars) para efecto streaming rápido
          const CHUNK_SIZE = 30
          for (let i = 0; i < fullResponse.length; i += CHUNK_SIZE) {
            const text = fullResponse.slice(i, i + CHUNK_SIZE)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            // Pequeño delay para que se vea el efecto
            await new Promise((r) => setTimeout(r, 15))
          }

          // Sesion continua: SIEMPRE usamos la primaria del usuario (migracion 017).
          // El parametro session_id del cliente es opcional y solo informa cual sesion
          // esta abierta en UI; el backend siempre append a la primaria.
          const active = await getOrCreateActiveSession(supabase, user.id)
          const fullHistory: ChatMsg[] = [
            ...conversation,
            { role: 'assistant', content: fullResponse },
          ]
          await supabase
            .from('taiger_sessions')
            .update({
              messages: fullHistory,
              updated_at: new Date().toISOString(),
              next_focus: fullResponse.substring(0, 200),
            })
            .eq('id', active.id)
          const savedSession: { id: string } = { id: active.id }

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
  'practica este',
  'practica la',
  'practica el',
  'practica tu',
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
