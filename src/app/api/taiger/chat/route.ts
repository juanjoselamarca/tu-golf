import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { TAIGER_SYSTEM_PROMPT, buildContextString, TAIGER_SESSION_STARTER } from '@/golf/coach/prompts'
import { TAIGER_TOOLS } from '@/golf/coach/tools'
import { SEARCH_KNOWLEDGE_TOOL } from '@/golf/coach/v3/tools/search-knowledge-chunks-tool'
import { FOCUS_TOOLS } from '@/golf/coach/v3/tools/focus-tools'
import { RAG_SECTION, ENGAGEMENT_SECTION, CONOCER_SECTION } from '@/golf/coach/v3/prompts'
import { getOnboardingState, ONBOARDING_SECTION } from '@/golf/coach/v3/onboarding'
import { getOrCreateActiveSession } from '@/golf/coach/session'
import { buildPlayerContext } from '@/golf/coach/context'
import { runChatStream } from '@/golf/coach/chat-engine'
import { closeExpiredPlans } from '@/golf/coach/plan-lifecycle'
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

    // Lifecycle: cerrar planes vencidos ANTES de armar contexto, para que el coach
    // nunca proponga sobre un plan stale (best-effort, no rompe el chat).
    await closeExpiredPlans(supabase, user.id).catch(() => {})

    // Contexto del jugador: fetch directo (sin HTTP server-to-server, sin .limit).
    const ctx = await buildPlayerContext(supabase, user.id)
    const contextString = buildContextString(ctx)

    // System prompt final con contexto + starter + tools.
    const systemWithContext = TAIGER_SYSTEM_PROMPT.replace('{PLAYER_CONTEXT}', contextString)
    const sessionStarter = TAIGER_SESSION_STARTER
    const toolsInstruction = `\n\nHERRAMIENTAS DISPONIBLES:\nTienes acceso a tools para consultar datos reales del jugador y de las canchas. NO le pidas al jugador datos que podés obtener con una tool.\n- find_rounds: rondas del jugador por CANCHA (nombre), período o las recientes/mejor/peor. NO necesitás la fecha exacta. Es la forma principal de listar rondas.\n- get_course_scorecard: pares y stroke index de una cancha por su NOMBRE (ej "Lomas de la Dehesa"). NO necesitás el UUID.\n- get_latest_round: detalle hoyo-por-hoyo de su última ronda finalizada\n- get_round_by_id: detalle de una ronda específica por UUID\n- get_round_by_date: ronda por fecha exacta (YYYY-MM-DD), opcional cancha\n- get_recent_rounds: resumen de últimas N rondas\n- get_all_rounds_summary: agregados sobre el 100% del histórico (cada cancha trae su course_id)\n- get_course_details: pares y stroke index por hoyo de una cancha por UUID\n- save_plan: ASIGNA un plan estructurado al jugador (patrón + hipótesis + métrica + target). Es la ÚNICA forma de comprometer un plan.\n\nREGLA CRÍTICA — DATOS: Cuando el jugador haga referencia a una ronda, cancha, fecha o score — SIEMPRE buscá con la tool apropiada (por NOMBRE, no necesitás IDs ni fechas exactas) ANTES de responder. NUNCA le pidas al jugador los pares de una cancha, sus rondas o sus scores: la app los tiene, buscalos vos. NUNCA inventes scores, pares ni configuraciones de hoyos. NUNCA digas "es un problema del sistema". Si tras buscar con la tool el dato GENUINAMENTE no existe, decílo honestamente y simple.\n\nREGLA CRÍTICA — PLANES: Si vas a comprometer un plan ("trabaja esto", "tu tarea de la semana", "te recomiendo enfocarte en…"), DEBES llamar la tool save_plan con el schema completo. NO escribas planes en prosa sin guardar. Si no tenés datos suficientes para llenar el schema (data_points >= 5, metric_value real, hipótesis concreta), pedí más datos al jugador en lugar de inventar.`

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

    // Onboarding: en la 1ª sesión (sin meta ni hechos), el coach entrevista corto
    // antes de avanzar. Solo con el flag y solo si todavía no está onboarded.
    let onboardingSection = ''
    if (cerebroV3Enabled) {
      try {
        const ob = await getOnboardingState(supabase, user.id)
        if (!ob.onboarded) onboardingSection = `\n\n${ONBOARDING_SECTION}`
      } catch (obErr) {
        void captureError(obErr, { context: 'taiger.chat.onboarding_state', userId: user.id })
      }
    }
    const ragSection = cerebroV3Enabled
      ? `\n\n${ENGAGEMENT_SECTION}\n\n${CONOCER_SECTION}${onboardingSection}\n\n${RAG_SECTION}`
      : ''
    const systemFinal = `${systemWithContext}\n\nINSTRUCCIÓN DE SESIÓN:\n${sessionStarter}${toolsInstruction}${ragSection}`
    const activeTools = cerebroV3Enabled
      ? [...TAIGER_TOOLS, SEARCH_KNOWLEDGE_TOOL, ...FOCUS_TOOLS]
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

    const readable = runChatStream({
      anthropic,
      systemFinal,
      activeTools,
      conversation,
      toolCtx,
      supabase,
      userId: user.id,
      sessionId: active.id,
      ctx,
      contextString,
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    void captureError(err, { context: 'taiger.chat.outer' })
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

