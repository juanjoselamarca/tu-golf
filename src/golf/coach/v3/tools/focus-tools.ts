/**
 * Tools del coach para Ola 2 "el coach te conoce". Extienden el dispatch de
 * executeTool (golf/coach/tools.ts) — sólo se ofrecen cuando cerebro_v3_enabled.
 *
 * Lecturas (recall_facts, get_focus, get_progress): cliente autenticado del
 * request (RLS owner_read). Escrituras (set_target, remember_fact): service_role
 * vía createAdminClient (RLS sólo permite ALL a service_role), igual que plan-engine.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { getFocus, defaultFocusDeps, type GetFocusDeps } from '@/golf/coach/v3/focus'
import { backfillRoundMetrics } from '@/golf/coach/v3/progress/round-metrics'
import { backfillPatternObservations } from '@/golf/coach/v3/pattern-runner'

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string }

export interface FocusToolCtx {
  supabase: SupabaseClient
  userId: string
  sessionId?: string | null
}

/** Schemas Anthropic de las tools de Ola 2 (se agregan a activeTools con el flag). */
export const FOCUS_TOOLS = [
  {
    name: 'set_target',
    description:
      'Registra la meta de handicap del jugador y su fecha objetivo. Úsala cuando el jugador exprese a dónde quiere llegar ("quiero bajar a 12", "antes de fin de año"). El foco y el progreso se enmarcan en esta meta.',
    input_schema: {
      type: 'object',
      properties: {
        handicap: { type: 'number', description: 'Handicap objetivo (índice), p.ej. 12.5' },
        deadline: { type: 'string', description: 'Fecha objetivo en formato YYYY-MM-DD (opcional)' },
      },
      required: ['handicap'],
    },
  },
  {
    name: 'remember_fact',
    description:
      'Guarda un hecho duradero sobre el jugador (lesión, agenda, equipo, preferencia, meta) para recordarlo en próximas sesiones. Úsala SOLO si el hecho mejora el consejo a futuro. Nunca por guardar.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'health | schedule | equipment | goal | preference | other' },
        fact: { type: 'string', description: 'El hecho, en una frase' },
        confidence: { type: 'number', description: 'Qué tan seguro estás (0..1)' },
      },
      required: ['category', 'fact', 'confidence'],
    },
  },
  {
    name: 'recall_facts',
    description:
      'Trae los hechos que ya recordás del jugador (memoria episódica). Úsala al inicio de una conversación o cuando necesites contexto personal para afinar el consejo.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filtrar por categoría (opcional)' },
      },
      required: [],
    },
  },
  {
    name: 'get_focus',
    description:
      'Computa EL foco de mayor impacto hacia la meta del jugador a partir de su historial real (patrón + métrica + acción), o un fallback honesto si no hay datos suficientes. Úsala para proponer en qué concentrarse.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_progress',
    description:
      'Trae la evolución reciente del jugador hacia su meta (métricas relativas por ronda + resultados del plan activo). Úsala para mostrar avance medible.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
] as const

const MIN_HANDICAP = -10
const MAX_HANDICAP = 54
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function setTarget(
  ctx: FocusToolCtx,
  input: Record<string, unknown>,
  admin: SupabaseClient = createAdminClient(),
): Promise<ToolResult> {
  const handicap = input.handicap
  if (typeof handicap !== 'number' || !Number.isFinite(handicap) || handicap < MIN_HANDICAP || handicap > MAX_HANDICAP) {
    return { ok: false, error: `handicap inválido (debe ser número entre ${MIN_HANDICAP} y ${MAX_HANDICAP})` }
  }
  let deadline: string | null = null
  if (input.deadline != null && input.deadline !== '') {
    if (typeof input.deadline !== 'string' || !ISO_DATE.test(input.deadline)) {
      return { ok: false, error: 'deadline inválido (formato YYYY-MM-DD)' }
    }
    deadline = input.deadline
  }
  const target_set_at = new Date().toISOString()
  const { error } = await admin
    .from('profiles')
    .update({ target_handicap: handicap, target_deadline: deadline, target_set_at })
    .eq('id', ctx.userId)
  if (error) return { ok: false, error: String((error as { message?: string }).message ?? error) }

  // Re-estampar las métricas ya guardadas con la meta nueva, para que
  // delta_vs_target_handicap no quede NULL en rondas previas (best-effort).
  await admin
    .rpc('restamp_round_metrics_target', { p_user: ctx.userId, p_target: handicap })
    .then(undefined, () => undefined)

  return { ok: true, data: { target_handicap: handicap, target_deadline: deadline, target_set_at } }
}

export async function rememberFact(
  ctx: FocusToolCtx,
  input: Record<string, unknown>,
  admin: SupabaseClient = createAdminClient(),
): Promise<ToolResult> {
  const category = typeof input.category === 'string' ? input.category.trim() : ''
  const fact = typeof input.fact === 'string' ? input.fact.trim() : ''
  if (!category) return { ok: false, error: 'category requerida' }
  if (!fact) return { ok: false, error: 'fact requerido' }
  const rawConf = typeof input.confidence === 'number' && Number.isFinite(input.confidence) ? input.confidence : 0.5
  const confidence = Math.max(0, Math.min(1, rawConf))
  const { error } = await admin.from('coach_episodic_memory').insert({
    user_id: ctx.userId,
    category,
    fact,
    confidence,
    source_session_id: ctx.sessionId ?? null,
  })
  if (error) return { ok: false, error: String((error as { message?: string }).message ?? error) }
  return { ok: true, data: { category, fact, confidence } }
}

export async function recallFacts(
  ctx: FocusToolCtx,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const nowIso = new Date().toISOString()
  let q = ctx.supabase
    .from('coach_episodic_memory')
    .select('id, category, fact, confidence, created_at, expires_at')
    .eq('user_id', ctx.userId)
    .is('superseded_by', null)
  if (typeof input.category === 'string' && input.category.trim()) {
    q = q.eq('category', input.category.trim())
  }
  const { data, error } = await q.order('created_at', { ascending: false }).limit(50)
  if (error) return { ok: false, error: String((error as { message?: string }).message ?? error) }
  // Filtra expirados en memoria (el índice parcial no puede usar now()).
  const facts = (data ?? []).filter((f) => {
    const exp = (f as { expires_at?: string | null }).expires_at
    return !exp || exp > nowIso
  })
  return { ok: true, data: { facts } }
}

export async function getFocusTool(
  ctx: FocusToolCtx,
  deps: GetFocusDeps = defaultFocusDeps(ctx.supabase),
): Promise<ToolResult> {
  const focus = await getFocus(ctx.userId, deps)
  return { ok: true, data: focus }
}

export async function getProgress(
  ctx: FocusToolCtx,
  admin: SupabaseClient = createAdminClient(),
): Promise<ToolResult> {
  // Autopobla métricas relativas faltantes (idempotente, best-effort). Que falle
  // el backfill NUNCA debe romper la lectura del avance.
  try {
    await backfillRoundMetrics(admin, ctx.userId)
    // Ola 3 chunk 2: poblar observaciones de patrones (idempotente, best-effort).
    await backfillPatternObservations(admin, ctx.userId)
  } catch {
    /* best-effort: la serie ya persistida sigue sirviendo */
  }
  const [metricsRes, planRes] = await Promise.all([
    ctx.supabase
      .from('round_metrics')
      .select(
        'strokes_over_par_round, delta_vs_handicap_expected, delta_vs_target_handicap, holes_played, computed_at',
      )
      .eq('user_id', ctx.userId)
      .order('computed_at', { ascending: false })
      .limit(20),
    ctx.supabase
      .from('coach_plans')
      .select('id, pattern_id, metric, target_value, target_op, baseline_value, created_at')
      .eq('user_id', ctx.userId)
      .eq('status', 'active')
      .maybeSingle(),
  ])
  if (metricsRes.error) {
    return { ok: false, error: String((metricsRes.error as { message?: string }).message ?? metricsRes.error) }
  }
  const activePlan = planRes.data ?? null
  let outcomes: unknown[] = []
  const planId = (activePlan as { id?: string } | null)?.id
  if (planId) {
    const outRes = await ctx.supabase
      .from('plan_outcomes')
      .select('played_at, metric_value, delta_vs_baseline, target_reached, compliance')
      .eq('user_id', ctx.userId)
      .eq('plan_id', planId)
      .order('played_at', { ascending: false })
      .limit(10)
    outcomes = outRes.data ?? []
  }
  // round_metrics viene desc (reciente primero); lo damos cronológico para serie.
  const round_metrics = [...((metricsRes.data ?? []) as unknown[])].reverse()
  return { ok: true, data: { round_metrics, active_plan: activePlan, outcomes } }
}
