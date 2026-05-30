import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { TAIGER_SYSTEM_PROMPT, buildContextString, TAIGER_SESSION_STARTER } from '@/golf/coach/prompts'
import { TAIGER_TOOLS, executeTool } from '@/golf/coach/tools'
import { SEARCH_KNOWLEDGE_TOOL } from '@/golf/coach/v3/tools/search-knowledge-chunks-tool'
import { handleToolUse } from '@/golf/coach/v3/tools/handle-tool-use'
import { RAG_SECTION, ENGAGEMENT_SECTION } from '@/golf/coach/v3/prompts'
import type { Jurisdiction } from '@/golf/coach/v3/retrieval/types'
import { getOrCreateActiveSession } from '@/golf/coach/session'
import { buildPlayerContext } from '@/golf/coach/context'
import { validateResponse, type HallucinationWarning } from '@/golf/coach/hallucination-validator'
import { toolActivityLabel, friendlyPatternName, friendlyMetricName } from '@/lib/coach-event-narrator'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Coach hace tool-calling en loop (rondas, hoyos, comparaciones) + streaming Anthropic.
// 30s mataba la función a mitad de SSE → cliente caía en "Error de conexión" o chat
// se cortaba a mitad de oración. 300s es el default de plataforma Vercel desde 2025.
export const maxDuration = 300

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

    // Feature flag cerebro v3 por usuario (profiles.cerebro_v3_enabled).
    // Solo si está ON exponemos la tool RAG de reglas + la sección del prompt.
    // Coach v2 sigue idéntico para todos los demás (rollback seguro).
    let cerebroV3Enabled = false
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('cerebro_v3_enabled')
        .eq('id', user.id)
        .maybeSingle()
      cerebroV3Enabled = prof?.cerebro_v3_enabled === true
    } catch (flagErr) {
      // Fail-closed: ante cualquier error, coach v2 sin RAG.
      void captureError(flagErr, { context: 'taiger.chat.cerebro_v3_flag', userId: user.id })
      cerebroV3Enabled = false
    }

    const ragSection = cerebroV3Enabled ? `\n\n${ENGAGEMENT_SECTION}\n\n${RAG_SECTION}` : ''
    const systemFinal = `${systemWithContext}\n\nINSTRUCCIÓN DE SESIÓN:\n${sessionStarter}${toolsInstruction}${ragSection}`
    const activeTools = cerebroV3Enabled
      ? [...TAIGER_TOOLS, SEARCH_KNOWLEDGE_TOOL]
      : TAIGER_TOOLS
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
        // Heartbeat SSE: comment frame cada 15s para evitar que proxies de
        // Vercel/CF/CDN o redes móviles inestables cierren la conexión idle
        // entre tool calls largas. El cliente filtra por `data:` y los
        // comentarios `:` son ignorados silenciosamente.
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: keepalive\n\n`))
          } catch {
            // controller cerrado — el clearInterval lo limpia abajo
          }
        }, 15000)
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
              tools: activeTools as unknown as Anthropic.Tool[],
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
                  // Estado en vivo: avisamos al cliente que el coach va a consultar.
                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ event: 'tool_start', tool: block.name, label: toolActivityLabel(block.name) })}\n\n`,
                  ))

                  const t0 = Date.now()
                  // La tool RAG v3 (search_knowledge_chunks) va por handleToolUse;
                  // el resto de las tools v2 por executeTool. Mismo shape {ok,data}
                  // para que la instrumentación de abajo funcione sin cambios.
                  let result: { ok: boolean; data?: unknown; error?: string }
                  let serialized: string
                  if (block.name === 'search_knowledge_chunks') {
                    const trBlock = await handleToolUse(
                      {
                        tool_use_id: block.id,
                        name: block.name,
                        input: block.input as { query?: string; jurisdictions?: Jurisdiction[] },
                      },
                      { userId: user.id },
                    )
                    serialized = trBlock.content
                    const parsed = JSON.parse(serialized) as { error?: string }
                    result = { ok: !parsed.error, data: parsed, error: parsed.error }
                    toolResults.push(trBlock)
                  } else {
                    result = await executeTool(block.name, block.input as Record<string, unknown>, toolCtx)
                    serialized = JSON.stringify(result)
                    toolResults.push({
                      type: 'tool_result',
                      tool_use_id: block.id,
                      content: serialized,
                    })
                  }
                  const ms = Date.now() - t0
                  allToolResultStrings.push(serialized)

                  // Si la tool devolvió una ronda con scores+pares, mandamos
                  // un summary compacto para que el cliente pueda renderizar
                  // un mini bar chart inline cuando el coach mencione hoyos.
                  let roundSummary: Record<string, unknown> | null = null
                  if (
                    result.ok &&
                    (block.name === 'get_latest_round' || block.name === 'get_round_by_id' || block.name === 'get_round_by_date') &&
                    typeof result.data === 'object' && result.data !== null
                  ) {
                    const d = result.data as Record<string, unknown>
                    const detail = (d.detalle_hoyos ?? d.holes ?? d.hole_detail) as Array<Record<string, unknown>> | undefined
                    if (Array.isArray(detail) && detail.length > 0) {
                      const scores = detail.map(h => (typeof h.strokes === 'number' ? h.strokes : (typeof h.score === 'number' ? h.score : null)))
                      const pars = detail.map(h => (typeof h.par === 'number' ? h.par : null))
                      if (scores.some(s => s !== null)) {
                        roundSummary = {
                          course_name: d.course_name ?? d.cancha ?? null,
                          played_at: d.played_at ?? d.fecha ?? null,
                          total_gross: d.total_gross ?? d.total ?? scores.reduce<number>((a, b) => a + (b ?? 0), 0),
                          scores,
                          pars,
                        }
                      }
                    }
                  }

                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ event: 'tool_done', tool: block.name, ok: result.ok, ms, ...(roundSummary ? { round_summary: roundSummary } : {}) })}\n\n`,
                  ))

                  // Si fue save_plan exitoso, mandamos el plan completo al cliente
                  // para que renderice una card en la conversación.
                  if (block.name === 'save_plan' && result.ok) {
                    const input = block.input as Record<string, unknown>
                    const planObj = (input.plan ?? {}) as Record<string, unknown>
                    const obs = (input.observation_data ?? {}) as Record<string, unknown>
                    const data = (result.data ?? {}) as Record<string, unknown>
                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({
                        event: 'plan_assigned',
                        plan: {
                          plan_id: data.plan_id,
                          pattern_id: input.pattern_id,
                          pattern_name: friendlyPatternName(String(input.pattern_id ?? '')),
                          hypothesis: input.hypothesis,
                          rule: planObj.rule,
                          metric: planObj.metric,
                          metric_name: friendlyMetricName(String(planObj.metric ?? '')),
                          target_value: planObj.target_value,
                          target_op: planObj.target_op,
                          duration_days: planObj.duration_days,
                          baseline_value: obs.metric_value,
                        },
                      })}\n\n`,
                    ))
                  }
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
          // El trigger BEFORE UPDATE de taiger_sessions setea updated_at = NOW()
          // automáticamente (migration 20260513). No mandar updated_at desde el
          // cliente — antes mandábamos uno y PostgREST devolvía 400 PGRST204
          // porque la columna no existía, dejando messages/next_focus sin
          // persistir desde 2026-05-05.
          const { error: sessionUpdErr } = await supabase
            .from('taiger_sessions')
            .update({
              messages: fullHistory,
              next_focus: fullResponse.substring(0, 200),
            })
            .eq('id', active.id)
          if (sessionUpdErr) {
            console.error('[tAIger/chat] sesión update error:', sessionUpdErr)
          }

          // VALIDADOR ANTI-ALUCINACION (D6.1 — enforcement light desde 2026-05-25).
          // El validator corre, logea coach_events('hallucination_check', ...) Y
          // expone el flag al cliente en el evento `done` para que el frontend
          // pueda decidir si muestra disclaimer. NO degrada el response.
          // D6.2 pendiente: degradacion + retry cuando false_positive_rate <3%.
          // Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.8 (D6).
          let hallucinationFlag: { flagged: boolean; warnings: HallucinationWarning[] } = {
            flagged: false,
            warnings: [],
          }
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
            hallucinationFlag = { flagged: validation.flagged, warnings: validation.warnings }
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
            `data: ${JSON.stringify({
              done: true,
              session_id: active.id,
              hallucination: hallucinationFlag,
            })}\n\n`,
          ))
          controller.close()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error desconocido'
          console.error('[tAIger/chat] Stream error:', msg)
          // Captura a PostHog para investigación posterior (sin bloquear el response).
          void captureError(err, {
            context: 'taiger.chat.stream',
            userId: user?.id ?? null,
            meta: { sessionId: active?.id },
          })
          if (msg.includes('rate_limit') || msg.includes('429')) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'tAIger+ está descansando. Intenta en unos minutos.' })}\n\n`))
          } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('aborted')) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'La respuesta se demoró más de lo esperado. Intenta de nuevo — si vuelve a pasar, ya quedó registrado y lo investigamos.' })}\n\n`))
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Algo falló del lado del servidor. No es tu culpa — ya quedó registrado y lo investigamos. Probá de nuevo en unos segundos.' })}\n\n`))
          }
          controller.close()
        } finally {
          clearInterval(heartbeat)
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
    void captureError(err, { context: 'taiger.chat.outer' })
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

