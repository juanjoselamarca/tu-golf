/**
 * Admin playground sandbox — corre el coach contra cualquier usuario sin
 * persistir la conversacion en su sesion real. D5 del plan Cerebro v2.
 *
 * Comportamiento:
 *  - sendToUser=false (default): NADA se escribe a taiger_sessions.
 *    Tool calls a save_plan/etc QUEDAN INHIBIDAS (modo dry-run total).
 *  - sendToUser=true: el response final se persiste en la sesion continua
 *    del usuario con metadata.sent_by_admin=true, y se loguea coach_events
 *    'admin_override' para auditoria.
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §6.3 (D5).
 */

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { TAIGER_SYSTEM_PROMPT, buildContextString, TAIGER_SESSION_STARTER } from '@/golf/coach/prompts'
import { TAIGER_TOOLS, executeTool } from '@/golf/coach/tools'
import { buildPlayerContext } from '@/golf/coach/context'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const playgroundSchema = z.object({
  targetUserId: z.string().uuid(),
  message: z.string().min(1).max(2000),
  conversation: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(20).optional(),
  sendToUser: z.boolean().default(false),
})

const TOOLS_INSTRUCTION = `\n\nHERRAMIENTAS DISPONIBLES:\nTienes acceso a tools para consultar datos reales del jugador y para asignar planes estructurados:\n- get_latest_round, get_round_by_id, get_round_by_date, get_recent_rounds, get_all_rounds_summary, get_course_details: data de rondas y canchas\n- save_plan: ASIGNA un plan estructurado al jugador (patron + hipotesis + metrica + target). Es la UNICA forma de comprometer un plan.\n\nREGLA CRITICA — DATOS: Si el jugador hace referencia a una ronda especifica, cancha, fecha o score concreto, llama la tool apropiada antes de responder. NUNCA inventes scores ni configuraciones.\n\nREGLA CRITICA — PLANES: Si vas a comprometer un plan, llama save_plan con el schema completo. NO escribas planes en prosa sin guardar.`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!(await isAdmin(user?.id, supabase))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Servicio no configurado' }, { status: 503 })

    const rawBody = await req.json()
    const parsed = playgroundSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Input invalido', details: parsed.error.issues[0]?.message }, { status: 400 })
    }
    const { targetUserId, message, conversation = [], sendToUser } = parsed.data

    const admin = createAdminClient()

    const { data: profile } = await admin
      .from('profiles')
      .select('id, name, email, indice, role')
      .eq('id', targetUserId)
      .maybeSingle()
    if (!profile) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    // Contexto del target user (no del admin). Usamos admin client para esquivar
    // RLS — el playground es server-only y ya verificamos isAdmin arriba.
    const ctx = await buildPlayerContext(admin, targetUserId)
    const contextString = buildContextString(ctx)

    const systemFinal = `${TAIGER_SYSTEM_PROMPT.replace('{PLAYER_CONTEXT}', contextString)}\n\nINSTRUCCION DE SESION:\n${TAIGER_SESSION_STARTER}${TOOLS_INSTRUCTION}`

    type LoopMsg = { role: 'user' | 'assistant'; content: unknown }
    const loopMessages: LoopMsg[] = [
      ...conversation.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ]

    // Tool execution context — apunta al target user. session_id intencionalmente
    // null en sandbox: si el LLM intenta save_plan en sandbox, falla bonito en
    // executeTool (sessionId nulo) en lugar de escribir a coach_plans real.
    const toolCtx = {
      supabase: admin,
      userId: targetUserId,
      defaultRondaId: null,
      sessionId: sendToUser ? await getOrFetchActiveSessionId(admin, targetUserId) : null,
    }

    const anthropic = new Anthropic({ apiKey })
    const MAX_ITERS = 5
    const toolCallsTrace: Array<{
      tool: string
      input: Record<string, unknown>
      output_preview: string
      ok: boolean
      ms: number
    }> = []
    let finalText = ''
    let totalUsage = { input: 0, output: 0, cache_read: 0, cache_create: 0 }

    for (let iter = 0; iter < MAX_ITERS; iter++) {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: [{ type: 'text', text: systemFinal, cache_control: { type: 'ephemeral' } }],
        tools: TAIGER_TOOLS as unknown as Anthropic.Tool[],
        messages: loopMessages as unknown as Anthropic.MessageParam[],
      })

      totalUsage.input += resp.usage.input_tokens
      totalUsage.output += resp.usage.output_tokens
      const u = resp.usage as Anthropic.Messages.Usage & {
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
      }
      totalUsage.cache_read += u.cache_read_input_tokens ?? 0
      totalUsage.cache_create += u.cache_creation_input_tokens ?? 0

      // Acumular texto producido en este turn
      for (const block of resp.content) {
        if (block.type === 'text') finalText += block.text
      }

      if (resp.stop_reason === 'tool_use') {
        loopMessages.push({ role: 'assistant', content: resp.content })
        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
        for (const block of resp.content) {
          if (block.type === 'tool_use') {
            const t0 = Date.now()
            // En sandbox (sendToUser=false), bloqueamos save_plan: el LLM
            // no debe poder escribir a coach_plans desde aca.
            let result: { ok: boolean; data?: unknown; error?: string }
            if (block.name === 'save_plan' && !sendToUser) {
              result = {
                ok: false,
                error: 'sandbox_blocked: save_plan deshabilitado en playground sin "enviar al usuario"',
              }
            } else {
              result = await executeTool(block.name, block.input as Record<string, unknown>, toolCtx)
            }
            const ms = Date.now() - t0
            const serialized = JSON.stringify(result)
            toolCallsTrace.push({
              tool: block.name,
              input: block.input as Record<string, unknown>,
              output_preview: serialized.slice(0, 800),
              ok: result.ok,
              ms,
            })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: serialized,
            })
          }
        }
        loopMessages.push({ role: 'user', content: toolResults })
        continue
      }

      break
    }

    if (!finalText.trim()) {
      finalText = 'Se me acabaron los pasos de analisis. Reformula la pregunta.'
    }

    let persisted = false
    if (sendToUser) {
      // Append a la sesion continua del target user, marcado como admin override.
      const { data: session } = await admin
        .from('taiger_sessions')
        .select('id, messages')
        .eq('user_id', targetUserId)
        .eq('is_primary', true)
        .maybeSingle()

      if (session) {
        const existing = (session.messages as Array<{ role: string; content: string; metadata?: Record<string, unknown> }>) ?? []
        const newMessages = [
          ...existing,
          { role: 'user', content: message, metadata: { sent_by_admin: true } },
          { role: 'assistant', content: finalText, metadata: { sent_by_admin: true } },
        ]
        await admin
          .from('taiger_sessions')
          .update({ messages: newMessages, updated_at: new Date().toISOString() })
          .eq('id', session.id)

        await admin.from('coach_events').insert({
          user_id: targetUserId,
          type: 'admin_override',
          payload: {
            action: 'send_to_user_from_playground',
            admin_id: user!.id,
            message_preview: message.slice(0, 200),
            response_preview: finalText.slice(0, 200),
            tool_count: toolCallsTrace.length,
          },
          related_session_id: session.id,
        })
        persisted = true
      }
    }

    return NextResponse.json({
      profile: { id: profile.id, name: profile.name, email: profile.email, indice: profile.indice },
      contextString,
      systemPrompt: systemFinal,
      response: finalText,
      toolCalls: toolCallsTrace,
      usage: totalUsage,
      persisted,
      sandbox: !sendToUser,
    })
  } catch (e) {
    console.error('[admin/taiger/playground]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

async function getOrFetchActiveSessionId(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('taiger_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('is_primary', true)
    .maybeSingle()
  return data?.id ?? null
}
