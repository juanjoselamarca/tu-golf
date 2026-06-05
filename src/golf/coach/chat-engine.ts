import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { executeTool, type ToolExecutionContext } from '@/golf/coach/tools'
import { handleToolUse } from '@/golf/coach/v3/tools/handle-tool-use'
import { coachDegradedFallback, toPlainMessages, isRetryableLLMError } from '@/golf/coach/v3/resilience/coach-fallback'
import type { Jurisdiction } from '@/golf/coach/v3/retrieval/types'
import { validateResponse, type HallucinationWarning } from '@/golf/coach/hallucination-validator'
import { guardNumbers, collectAuthorizedNumbers } from '@/golf/coach/number-guard'
import { toolActivityLabel, friendlyPatternName, friendlyMetricName } from '@/lib/coach-event-narrator'
import { captureError } from '@/lib/error-tracking'
import type { TaigerContext } from '@/golf/coach/prompts'

// Motor del chat del coach: tool-loop + streaming SSE + update de sesión + validador
// + fallback degradado (Ola 2). Extraído de route.ts (refactor puro, sin cambio de
// comportamiento) para dejar el handler delgado. El guard aritmético se monta en PR2.

type ChatMsg = { role: 'user' | 'assistant'; content: string }

/**
 * Verifica el texto del turno FINAL contra el set autorizado (salidas de la tool
 * de este turno + valores exactos del contexto) ANTES de mostrarlo. Si trae un
 * score absoluto fabricado que no traza a la calculadora, lo BLOQUEA y devuelve
 * prosa segura — el número exacto vive en la tarjeta. NUNCA adivina una corrección.
 */
export function enforceFinalText(
  text: string,
  opts: { authorized: string[]; relativeHint?: string | null },
): { blocked: boolean; text: string } {
  const g = guardNumbers({ text, allowedNumbers: opts.authorized })
  if (!g.blocked) return { blocked: false, text }
  // Prosa segura AUTO-CONTENIDA: si hay un objetivo relativo verificado de este
  // turno, lo citamos inline ("+N sobre par") para que el mensaje siga teniendo
  // información aunque la tarjeta no se haya persistido (P1 review 2026-06-05).
  const hint = opts.relativeHint
  const safe = hint
    ? `Mejor te lo doy en "sobre par" para no jugarte un número sin verificar: apuntá a ${hint} sobre par. El desglose exacto está en la tarjeta de acá abajo 👇`
    : 'Mejor te lo doy en "sobre par" para no jugarte un número sin verificar. Pedímelo de nuevo y te lo calculo exacto con los datos de la cancha.'
  return { blocked: true, text: safe }
}

/**
 * Retry acotado (1 intento, sin tools) cuando el turno final trajo un absoluto no
 * respaldado: re-pide la respuesta forzando "+N sobre par" + referencia a la tarjeta.
 * No-streaming; si falla, el caller cae a la prosa segura de enforceFinalText.
 */
async function regenerateRelativeOnly(
  anthropic: Anthropic,
  systemFinal: string,
  loopMessages: unknown[],
): Promise<string> {
  const strictSystem =
    systemFinal +
    '\n\n[CORRECCIÓN OBLIGATORIA] Tu respuesta anterior incluyó un score absoluto que NO salió de la calculadora (compute_score_projection). Reescribí tu respuesta SIN ningún score absoluto: hablá solo en "+N sobre par" y referí al jugador a la tarjeta de objetivo (👇) para el número exacto. No inventes ni recalcules números.'
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [{ type: 'text', text: strictSystem, cache_control: { type: 'ephemeral' } }],
    messages: loopMessages as unknown as Anthropic.MessageParam[],
  })
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

export interface RunChatStreamParams {
  anthropic: Anthropic
  systemFinal: string
  activeTools: readonly unknown[]
  conversation: ChatMsg[]
  toolCtx: ToolExecutionContext
  supabase: SupabaseClient
  userId: string
  sessionId: string
  ctx: TaigerContext
  contextString: string
}

export function runChatStream(params: RunChatStreamParams): ReadableStream {
  const { anthropic, systemFinal, activeTools, conversation, toolCtx, supabase, userId, sessionId, ctx, contextString } = params
  const encoder = new TextEncoder()
  // Kill-switch del enforcement aritmético (default ON). En 'false' revierte al
  // streaming live token-a-token del turno final (comportamiento pre-garantía).
  const guardEnabled = process.env.COACH_NUMBER_GUARD_ENABLED !== 'false'

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
        // P0 resiliencia: si aún no se emitió contenido, el catch puede caer a un
        // fallback degradado (no-streaming) sin duplicar tokens ya enviados.
        let emittedContent = false
        try {
          type LoopMsg = { role: 'user' | 'assistant'; content: unknown }
          const loopMessages: LoopMsg[] = conversation.map((m) => ({ role: m.role, content: m.content }))
          let fullResponse = ''
          const MAX_TOOL_ITERS = 5
          // Acumulado de results de tool calls en TODAS las iters del loop —
          // alimenta al validador anti-alucinacion (D6) al final del stream.
          const allToolResultStrings: string[] = []
          // Último "+N sobre par" verificado por compute_score_projection en este
          // turno — sirve de respaldo auto-contenido si el guard bloquea el final.
          let lastProjectionRelative: string | null = null

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

            // Acumulamos el texto de ESTA iteración. Con guard activo no se streamea
            // token-a-token: recién sabemos si es el turno final tras finalMessage(),
            // y el turno final debe verificarse antes de mostrarse. Sin guard, live.
            let iterText = ''
            for await (const event of stream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                const text = event.delta.text
                iterText += text
                if (!guardEnabled) {
                  emittedContent = true
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                }
              }
            }

            const resp = await stream.finalMessage()

            if (resp.stop_reason === 'tool_use') {
              // Texto pre-tool (chatter corto antes de consultar; no lleva el desglose
              // final): con guard activo se buffeó, lo flusheamos ahora.
              if (guardEnabled && iterText) {
                emittedContent = true
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: iterText })}\n\n`))
              }
              fullResponse += iterText
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
                      { userId: userId },
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
                  // compute_score_projection: emitimos la tarjeta con el número exacto
                  // (el LLM puede citarlo inline; el guard del turno final lo verifica).
                  if (block.name === 'compute_score_projection' && result.ok) {
                    const proj = result.data as { relativeLabel?: string }
                    if (typeof proj.relativeLabel === 'string') lastProjectionRelative = proj.relativeLabel
                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({ event: 'score_projection', projection: result.data })}\n\n`,
                    ))
                  }
                  // Instrumentacion: emit tool_called para el cerebro del agente
                  // (sin bloquear el flow si falla la auditoria).
                  try {
                    const adminEvt = createAdminClient()
                    await adminEvt.from('coach_events').insert({
                      user_id: userId,
                      type: 'tool_called',
                      payload: {
                        tool_name: block.name,
                        ok: result.ok,
                        error: result.ok ? null : result.error,
                        ms,
                        input_keys: Object.keys((block.input as Record<string, unknown>) ?? {}),
                      },
                      related_session_id: sessionId,
                    })
                  } catch (e) {
                    void captureError(e, { context: 'taiger.chat.tool_called_event', userId })
                  }
                }
              }
              loopMessages.push({ role: 'user', content: toolResults })
              continue
            }

            // Turno FINAL (end_turn o max_tokens). Con guard activo, el texto se buffeó
            // (iterText) y NO se mostró todavía: lo verificamos contra el set autorizado
            // ANTES de flushear. Si trae un absoluto no respaldado → 1 retry acotado a
            // "+N"; si reincide → prosa segura + tarjeta (el número correcto vive ahí).
            if (guardEnabled) {
              const authorized = collectAuthorizedNumbers(allToolResultStrings, contextString)
              const enforced = enforceFinalText(iterText, { authorized, relativeHint: lastProjectionRelative })
              let outText = enforced.text
              if (enforced.blocked) {
                try {
                  const retry = await regenerateRelativeOnly(anthropic, systemFinal, loopMessages)
                  const r2 = enforceFinalText(retry, { authorized, relativeHint: lastProjectionRelative })
                  if (!r2.blocked && retry.trim()) outText = retry
                } catch (rErr) {
                  void captureError(rErr, { context: 'taiger.chat.guard_retry', userId })
                }
              }
              if (outText) {
                emittedContent = true
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: outText })}\n\n`))
              }
              fullResponse += outText
            } else {
              // Sin guard: el texto del turno final ya se streameó live arriba.
              fullResponse += iterText
            }
            break
          }

          if (!fullResponse.trim()) {
            fullResponse = 'Se me acabaron los pasos de análisis. ¿Puedes reformular tu pregunta?'
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
            .eq('id', sessionId)
          if (sessionUpdErr) {
            void captureError(sessionUpdErr, { context: 'taiger.chat.session_update', userId })
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
              user_id: userId,
              type: 'hallucination_check',
              payload: {
                flagged: validation.flagged,
                warnings: validation.warnings,
                total_numbers_checked: validation.total_numbers_checked,
                total_courses_checked: validation.total_courses_checked,
                response_length: fullResponse.length,
                tool_calls_in_session: allToolResultStrings.length,
              },
              related_session_id: sessionId,
            })
          } catch (vErr) {
            void captureError(vErr, { context: 'taiger.chat.hallucination_validator', userId })
          }

          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({
              done: true,
              session_id: sessionId,
              hallucination: hallucinationFlag,
            })}\n\n`,
          ))
          controller.close()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error desconocido'
          // Status code del SDK si lo expone (Anthropic: 429 rate-limit, 529 overloaded).
          const status = (err as { status?: number })?.status
          // 529 "Overloaded" / 503 = Anthropic saturado: el incidente exacto que
          // originó el AI Gateway. Es transitorio → mismo trato que rate-limit
          // ("descansando, reintentá") en vez del genérico "algo falló". El fallback
          // real a Gemini llega cuando el coach migre al gateway (streaming+tools).
          const overloaded = status === 529 || status === 503 || /overloaded|529/i.test(msg)
          // Captura a PostHog para investigación posterior (sin bloquear el response).
          void captureError(err, {
            context: 'taiger.chat.stream',
            userId: userId ?? null,
            meta: { sessionId: sessionId, status },
          })
          const retryable = overloaded || msg.includes('rate_limit') || msg.includes('429') || isRetryableLLMError(err)
          // P0 resiliencia: ante rate-limit/overload de Anthropic, si todavía no
          // emitimos contenido, intentamos una respuesta degradada (no-streaming,
          // sin tools) vía el gateway, cuya cadena cruza a Gemini. El coach no se cae.
          if (retryable && !emittedContent) {
            try {
              const fb = await coachDegradedFallback({
                system: systemFinal,
                messages: toPlainMessages(conversation),
              })
              if (fb.text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: fb.text })}\n\n`))
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, degraded: true, provider: fb.provider })}\n\n`))
                controller.close()
                return
              }
            } catch (fbErr) {
              void captureError(fbErr, { context: 'taiger.chat.fallback', userId: userId ?? null })
            }
          }
          if (retryable) {
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

    return readable
}
