// src/app/api/torneos/draft/[id]/assistant/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { callLLM, AllProvidersFailedError, type LLMResult } from '@/lib/ai'
import { captureError } from '@/lib/error-tracking'
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
// Asegura margen para el path de fallback (Anthropic falla → Gemini ~16s) sin que
// la plataforma mate la función antes de la degradación elegante.
export const maxDuration = 60

const aiResponseSchema = z.object({
  config_partial: z.record(z.string(), z.unknown()),
  explanation: z.string(),
  needs_confirmation: z.array(z.string()).default([]),
})

const HAIKU_INPUT_PER_MTOK = 0.25  // USD per 1M input tokens (placeholder)
const HAIKU_OUTPUT_PER_MTOK = 1.25
// Budget por intento del gateway. 20s (antes 12s) porque el FALLBACK a Gemini
// flash-lite para esta generación tarda 10-16s (medido en smoke 30-may): con 12s
// el fallback se pasaba del timeout y fallaba. El path primario (Anthropic, 2-4s)
// no se ve afectado. Un fallback degradado a ~18s es aceptable; lo contrario es
// quedarse sin IA en pleno torneo cuando Anthropic se cae.
const TIMEOUT_MS = 20_000

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

  // Llamada IA vía gateway central: rol 'evaluator' (cadena Haiku → Gemini en
  // prod; solo Gemini en dev para no quemar el cupo del golfista). El gateway
  // reintenta y cae a otro proveedor ante 429/529/timeout antes de rendirse.
  let llm: LLMResult
  try {
    llm = await callLLM({
      role: 'evaluator',
      system: TOURNAMENT_ASSISTANT_PROMPT_V1 + `\n\nConfig actual:\n${JSON.stringify(current.config, null, 2)}`,
      messages: [{ role: 'user', content: message }],
      maxTokens: 1024,
      // temperature 1 explícito: preserva EXACTO el comportamiento previo (la ruta
      // no pasaba temperature → Anthropic usaba su default 1.0, y el prompt +
      // pipeline de parsing se tunearon contra ese comportamiento). No cambiar a
      // 0 sin validar contra el banco de pruebas del asistente.
      temperature: 1,
      // Gemini (fallback) devuelve JSON puro vía responseMimeType → robustece el
      // parsing en el path de fallback. Neutral para Anthropic (ya pide JSON en el prompt).
      responseJson: true,
      timeoutMs: TIMEOUT_MS,
      surface: 'tournament_assistant',
      userId: user.id,
    })
  } catch (err: unknown) {
    // Toda la cadena de proveedores falló: degradación elegante. El organizador
    // nunca ve un error crudo — se le ofrece editar manualmente.
    void captureError(err, {
      context: err instanceof AllProvidersFailedError
        ? 'assistant.ai-all-providers-failed'
        : 'assistant.ai-unexpected',
      userId: user.id,
    })
    return NextResponse.json({ error: 'IA no disponible, editá manualmente' }, { status: 503 })
  }
  const latencyMs = llm.latencyMs

  // Costo: estimación con tarifas Haiku. Si cayó a Gemini (más barato) SOBREestima
  // → la alarma de presupuesto puede saltar antes de tiempo (lado seguro). El costeo
  // real por proveedor llega con la tabla ai_usage (Fase 2).
  const inputTokens = llm.tokensIn
  const outputTokens = llm.tokensOut
  const costUsd = (inputTokens * HAIKU_INPUT_PER_MTOK + outputTokens * HAIKU_OUTPUT_PER_MTOK) / 1_000_000

  // Parse JSON
  const textValue = llm.text
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
    if (shouldAlarm(c)) {
      void captureError(`Costo IA mensual $${c.toFixed(2)} >= $100`, {
        context: 'assistant.ai-cost-alarm',
        level: 'warning',
      })
    }
  })

  return NextResponse.json({
    ok: true,
    draft: updated,
    explanation: parsed.data.explanation,
    needs_confirmation: parsed.data.needs_confirmation,
    cost_usd: costUsd,
  })
}
