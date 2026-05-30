// src/app/api/torneos/draft/[id]/assistant/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/utils/supabase/server'
import { tournamentConfigPartialSchema, tournamentConfigSchema } from '@/lib/draft/schema'
import { deepMergeConfig } from '@/lib/draft/deep-merge-config'
import { upgradeConfig } from '@/lib/draft/upgrade-config'
import { normalizeAiConfigPartial } from '@/lib/draft/normalize-ai-partial'
import { fillMissingSubConfigs } from '@/lib/draft/fill-missing-sub-configs'
import { checkRateLimit } from '@/lib/draft/rate-limit'
import { logAiCall, getMonthlyAiCostUsd, shouldAlarm } from '@/lib/draft/ai-cost-tracker'
import { TOURNAMENT_ASSISTANT_PROMPT_V1 } from '@/lib/prompts/tournament-assistant-v1'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const aiResponseSchema = z.object({
  config_partial: z.record(z.string(), z.unknown()),
  explanation: z.string(),
  needs_confirmation: z.array(z.string()).default([]),
})

const HAIKU_INPUT_PER_MTOK = 0.25  // USD per 1M input tokens (placeholder)
const HAIKU_OUTPUT_PER_MTOK = 1.25
const TIMEOUT_MS = 12_000

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { message } = await req.json()
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message requerido' }, { status: 400 })
  }

  const rl = checkRateLimit(user.id, message)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: rl.reason, retry_after_ms: rl.retry_after_ms },
      { status: 429 },
    )
  }

  // Get current draft
  const { data: current, error: cErr } = await supabase
    .from('tournament_drafts')
    .select('config, version, status')
    .eq('id', params.id)
    .single()
  if (cErr || !current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (current.status !== 'draft') return NextResponse.json({ error: 'Draft no editable' }, { status: 409 })

  // Llamada IA
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const t0 = Date.now()
  // El SDK tiene overloads para stream vs no-stream; al pasar stream:false explícitamente
  // el tipo es Anthropic.Messages.Message.
  let resp: Anthropic.Messages.Message
  try {
    resp = await anthropic.messages.create(
      {
        // Modelo principal Haiku 4.5; alias 'claude-haiku-4-5' funciona como fallback si el snapshot no existe.
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: TOURNAMENT_ASSISTANT_PROMPT_V1 + `\n\nConfig actual:\n${JSON.stringify(current.config, null, 2)}`,
        messages: [{ role: 'user', content: message }],
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error IA'
    console.error('[assistant] anthropic error:', msg)
    return NextResponse.json({ error: 'IA no disponible, editá manualmente' }, { status: 503 })
  }
  const latencyMs = Date.now() - t0

  // Costo
  const inputTokens = resp.usage?.input_tokens || 0
  const outputTokens = resp.usage?.output_tokens || 0
  const costUsd = (inputTokens * HAIKU_INPUT_PER_MTOK + outputTokens * HAIKU_OUTPUT_PER_MTOK) / 1_000_000

  // Parse JSON
  const textBlock = resp.content.find(b => b.type === 'text') as Anthropic.Messages.TextBlock | undefined
  const textValue = textBlock?.text || ''
  let json: unknown
  try {
    const start = textValue.indexOf('{')
    const end = textValue.lastIndexOf('}')
    json = JSON.parse(textValue.slice(start, end + 1))
  } catch {
    return NextResponse.json({ error: 'IA devolvió formato inválido' }, { status: 502 })
  }

  const parsed = aiResponseSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'IA devolvió estructura inválida', details: parsed.error.issues }, { status: 502 })
  }

  // Defensa: el modelo a veces traduce literales (ej. "neto" → "net"). Coercionamos
  // sinónimos conocidos antes de validar; los valores desconocidos pasan tal cual y
  // los rechaza zod a continuación con el mismo error que antes.
  const normalizedPartial = normalizeAiConfigPartial(parsed.data.config_partial)

  // Validar config_partial contra schema parcial
  const partialResult = tournamentConfigPartialSchema.safeParse(normalizedPartial)
  if (!partialResult.success) {
    return NextResponse.json({ error: 'IA propuso campos inválidos', details: partialResult.error.issues }, { status: 502 })
  }

  // Mergear y validar resultado.
  // El cast es seguro: zod ya valido el shape del partial; el deep partial
  // tiene sub-objetos parciales (ej. team_config: { size: 2 } sin handicap_pct)
  // que TournamentConfigPartial (top-level Partial) no expresa. deepMergeConfig
  // si los maneja en runtime.
  const upgraded = upgradeConfig(current.config)
  const nextConfig = deepMergeConfig(
    upgraded,
    partialResult.data as import('@/lib/draft/types').TournamentConfigPartial,
  )
  // Defense in depth post-merge: si el merge dejo sub-configs incompletos (ej.
  // LLM trajo format=scramble sin team_config, o team_config solo con size),
  // rellenamos con defaults SOLO los campos faltantes en el resultado FUSIONADO.
  // Esto preserva todos los valores que el organizador ya habia configurado en
  // turnos previos (no pisa). Regresion inbox 047ca225.
  const autoFilledPaths = fillMissingSubConfigs(nextConfig)
  // Agregar needs_confirmation + paths autocompletados a pending_confirmations
  // para que el organizador confirme los defaults inyectados (contrato del prompt).
  const pending = new Set([
    ...(nextConfig.pending_confirmations || []),
    ...parsed.data.needs_confirmation,
    ...autoFilledPaths,
  ])
  nextConfig.pending_confirmations = Array.from(pending)

  const fullResult = tournamentConfigSchema.safeParse(nextConfig)
  if (!fullResult.success) {
    return NextResponse.json({ error: 'Config IA produciría inválido', details: fullResult.error.issues }, { status: 502 })
  }

  // Persistir (optimistic version locking)
  const { data: updated, error: uErr } = await supabase
    .from('tournament_drafts')
    .update({ config: nextConfig, version: current.version + 1 })
    .eq('id', params.id)
    .eq('version', current.version)
    .select('id, version, config')
    .single()
  if (uErr || !updated) return NextResponse.json({ error: 'conflict' }, { status: 409 })

  await logAiCall(
    supabase, params.id, user.id, message,
    parsed.data.explanation, costUsd, latencyMs,
    partialResult.data, current.config,
  )

  // Alarma async (fire-and-forget)
  void getMonthlyAiCostUsd(supabase).then(c => {
    if (shouldAlarm(c)) console.warn(`[ai-cost] ALARM: monthly $${c.toFixed(2)} >= $100`)
  })

  return NextResponse.json({
    ok: true,
    draft: updated,
    explanation: parsed.data.explanation,
    needs_confirmation: parsed.data.needs_confirmation,
    cost_usd: costUsd,
  })
}
