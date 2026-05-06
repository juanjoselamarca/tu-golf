import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { TAIGER_SYSTEM_PROMPT, buildContextString, TAIGER_SESSION_STARTER } from '@/golf/coach/prompts'
import { TAIGER_TOOLS, executeTool } from '@/golf/coach/tools'
import { getOrCreateActiveSession } from '@/golf/coach/session'
import { buildPlayerContext } from '@/golf/coach/context'
import { validateResponse } from '@/golf/coach/hallucination-validator'
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
  // session_id queda como informacion del cliente — el backend siempre append
  // a la sesion primaria del usuario (migration 017).
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

    // Claude requiere que el primer mensaje sea del usuario y el ultimo tambien.
    while (conversation.length > 0 && conversation[0].role !== 'user') conversation.shift()
    while (conversation.length > 0 && conversation[conversation.length - 1].role !== 'user') conversation.pop()

    const userMessage = conversation[conversation.length - 1]?.content ?? ''
    if (!userMessage.trim()) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    }

    // Contexto del jugador: fetch directo (sin HTTP server-to-server, sin .limit).
    const ctx = await buildPlayerContext(supabase, user.id)
    const contextString = buildContextString(ctx)

    // System prompt final con contexto + starter + tools.
    const systemWithContext = TAIGER_SYSTEM_PROMPT.replace('{PLAYER_CONTEXT}', contextString)
    const sessionStarter = TAIGER_SESSION_STARTER
    const toolsInstruction = `\n\nHERRAMIENTAS DISPONIBLES:\nTienes acceso a tools para consultar datos reales del jugador y para asignar planes estructurados:\n- get_latest_round: detalle hoyo-por-hoyo de su última ronda finalizada\n- get_round_by_id: detalle de una ronda específica por UUID\n- get_round_by_date: ronda por fecha (YYYY-MM-DD), opcional cancha\n- get_recent_rounds: resumen de últimas N rondas\n- get_all_rounds_summary: agregados sobre el 100% del histórico\n- get_course_details: pares y stroke index por hoyo de una cancha\n- save_plan: ASIGNA un plan estructurado al jugador (patrón + hipótesis + métrica + target). Es la ÚNICA forma de comprometer un plan.\n\nREGLA CRÍTICA — DATOS: Cuando el jugador haga referencia a una ronda específica, cancha, fecha o score concreto — SIEMPRE llama la tool apropiada antes de responder. NUNCA inventes scores, pares ni configuraciones de hoyos. Si la data no está en tools ni en el contexto inyectado, dilo honestamente.\n\nREGLA CRÍTICA — PLANES: Si vas a comprometer un plan ("trabaja esto", "tu tarea de la semana", "te recomiendo enfocarte en…"), DEBES llamar la tool save_plan con el schema completo. NO escribas planes en prosa sin guardar. Si no tenés datos suficientes para llenar el schema (data_points >= 5, metric_value real, hipótesis concreta), pedí más datos al jugador en lugar de inventar.`

    const systemFinal = `${systemWithContext}\n\nINSTRUCCIÓN DE SESIÓN:\n${sessionStarter}${toolsInstruction}`
    const anthropic = new Anthropic({ apiKey })

    // Sesion activa pre-fetched: necesario para que save_plan pueda referenciar
    // session_id en coach_plans + coach_events. Backend siempre append a la
    // primaria del usuario (migracion 017).
    const active = await getOrCreateActiveSession(supabase, user.id)

    // Contexto para ejecucion de tools
    const toolCtx = {
      supabase,
      userId: user.id,
      defaultRondaId: null,
      sessionId: active.id,
    }

    const encoder = new TextEncoder()

    // Stream completo: forward de deltas reales de Anthropic + tool loop server-side.
    // El cliente recibe text deltas en tiempo real (first token ~1-2s vs 10-30s antes).
    const readable = new ReadableStream({
      async start(controller) {
        try {
          type LoopMsg = { role: 'user' | 'assistant'; content: unknown }
          const loopMessages: LoopMsg[] = conversation.map((m) => ({ role: m.role, content: m.content }))
          let fullResponse = ''
          const MAX_TOOL_ITERS = 5
          let lastUsage: Anthropic.Messages.Usage | null = null
          // Acumulado de results de tool calls en TODAS las iters del loop —
          // alimenta al validador anti-alucinacion (D6) al final del stream.
          const allToolResultStrings: string[] = []

          for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
            // System como array con cache_control ephemeral. Cachea el system prompt
            // (~5K tokens estables) — en follow-ups dentro de 5min el coste de input
            // baja ~80% via cache_read_input_tokens.
            const stream = anthropic.messages.stream({
              model: 'claude-sonnet-4-6',
              max_tokens: 2048,
              system: [
                {
                  type: 'text',
                  text: systemFinal,
                  cache_control: { type: 'ephemeral' },
                },
              ],
              tools: TAIGER_TOOLS as unknown as Anthropic.Tool[],
              messages: loopMessages as unknown as Anthropic.MessageParam[],
            })

            // Forward text deltas al cliente conforme llegan.
            for await (const event of stream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                const text = event.delta.text
                fullResponse += text
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
              }
            }

            const resp = await stream.finalMessage()
            lastUsage = resp.usage

            if (resp.stop_reason === 'tool_use') {
              // Ejecutar tools, agregar al loop, continuar.
              loopMessages.push({ role: 'assistant', content: resp.content })
              const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
              for (const block of resp.content) {
                if (block.type === 'tool_use') {
                  const t0 = Date.now()
                  const result = await executeTool(block.name, block.input as Record<string, unknown>, toolCtx)
                  const ms = Date.now() - t0
                  const serialized = JSON.stringify(result)
                  allToolResultStrings.push(serialized)
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: serialized,
                  })
                  // Instrumentacion: emit tool_called para el cerebro del agente
                  // (sin bloquear el flow si falla la auditoria).
                  try {
                    const adminEvt = createAdminClient()
                    await adminEvt.from('coach_events').insert({
                      user_id: user.id,
                      type: 'tool_called',
                      payload: {
                        tool_name: block.name,
                        ok: result.ok,
                        error: result.ok ? null : result.error,
                        ms,
                        input_keys: Object.keys((block.input as Record<string, unknown>) ?? {}),
                      },
                      related_session_id: active.id,
                    })
                  } catch (e) {
                    console.error('[tAIger/chat] tool_called event error:', e)
                  }
                }
              }
              loopMessages.push({ role: 'user', content: toolResults })
              continue
            }

            // end_turn o max_tokens — ya recolectamos texto via deltas.
            break
          }

          if (!fullResponse.trim()) {
            fullResponse = 'Se me acabaron los pasos de análisis. ¿Puedes reformular tu pregunta?'
          }

          if (lastUsage) {
            const cacheRead = (lastUsage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0
            const cacheCreate = (lastUsage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0
            console.log('[tAIger/chat] usage:', {
              input: lastUsage.input_tokens,
              output: lastUsage.output_tokens,
              cache_read: cacheRead,
              cache_create: cacheCreate,
            })
          }

          // Sesion continua: pre-fetched arriba como `active` (migracion 017).
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

          // SHADOW EXTRACTOR (D3) — el regex extractor ya NO escribe a taiger_recommendations
          // ni a coach_plans. Solo registra a coach_events('extractor_shadow', ...) por 7 dias
          // para comparar contra lo que la tool save_plan capturo. Despues del dia 7, si la
          // divergencia es <5%, esta funcion entera se borra.
          // Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.4.3 (D3).
          try {
            await extractRecommendationsShadow(
              user.id, active.id, fullResponse,
            )
          } catch (recErr) {
            console.error('[tAIger/chat] extractor shadow error:', recErr)
          }

          // VALIDADOR ANTI-ALUCINACION (D6 — shadow 7 dias). NO degrada respuesta.
          // Logea coach_events('hallucination_check', { flagged, warnings }) y
          // listo. Despues del dia 7, si false_positive_rate < 5%, se promueve
          // a enforcement (degradacion + retry forzando tool call).
          // Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.8 (D6).
          try {
            const knownCourseNames = (ctx.recent_rounds ?? [])
              .map(r => r.course_name)
              .filter((s): s is string => typeof s === 'string' && s.length > 0)
            const validation = validateResponse({
              response: fullResponse,
              contextString,
              toolResultsConcat: allToolResultStrings.join('\n'),
              knownCourseNames,
            })
            const admin = createAdminClient()
            await admin.from('coach_events').insert({
              user_id: user.id,
              type: 'hallucination_check',
              payload: {
                flagged: validation.flagged,
                warnings: validation.warnings,
                total_numbers_checked: validation.total_numbers_checked,
                total_courses_checked: validation.total_courses_checked,
                response_length: fullResponse.length,
                tool_calls_in_session: allToolResultStrings.length,
              },
              related_session_id: active.id,
            })
          } catch (vErr) {
            console.error('[tAIger/chat] hallucination validator error:', vErr)
          }

          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ done: true, session_id: active.id })}\n\n`,
          ))
          controller.close()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error desconocido'
          console.error('[tAIger/chat] Stream error:', msg)
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

// --- Shadow extractor (D3) ---
// El extractor regex ya NO escribe planes. Por 7 dias corre en sombra y solo
// registra a coach_events('extractor_shadow', { regex_extracted, ... }) lo que
// el regex hubiera capturado, para comparar con la tool save_plan. Si la
// divergencia es <5% al dia 7, esta funcion entera se borra.
//
// Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.4.3 (D3).

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

async function extractRecommendationsShadow(
  userId: string,
  sessionId: string,
  responseText: string,
) {
  const lines = responseText.split('\n').map(l => l.trim()).filter(Boolean)
  const recommendations: string[] = []

  for (const line of lines) {
    if (recommendations.length >= 3) break

    const lower = line.toLowerCase()

    const isNumbered = /^\d+[\.\)]\s/.test(line)
    const isBullet = /^[-*•]\s/.test(line)
    const hasTrigger = RECOMMENDATION_TRIGGERS.some(t => lower.includes(t))

    if ((isNumbered || isBullet || hasTrigger) && line.length > 20 && line.length < 500) {
      const cleaned = line.replace(/^\d+[\.\)]\s*/, '').replace(/^[-*•]\s*/, '').trim()
      if (cleaned.length > 15) {
        recommendations.push(cleaned)
      }
    }
  }

  // Registramos SIEMPRE el resultado del shadow extractor (incluso vacio) para
  // poder comparar dia a dia: cuando save_plan se llamo, el shadow ¿extrajo o no?
  const admin = createAdminClient()
  await admin.from('coach_events').insert({
    user_id: userId,
    type: 'extractor_shadow',
    payload: {
      regex_extracted: recommendations,
      regex_extracted_count: recommendations.length,
      response_length: responseText.length,
    },
    related_session_id: sessionId,
  })
}
