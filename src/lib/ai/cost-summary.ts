/**
 * Resumen de unit-economics de IA a partir de filas de `ai_usage`.
 *
 * `buildCostSummary` es PURA (testeable sin DB). `getCostSummary` consulta la
 * tabla y la agrega. Responde la pregunta que motiva PR-0:
 * **¿cuánto cuesta un usuario activo al mes → hay margen contra el precio del plan?**
 *
 * Convención: el unit-economics se mide SOLO sobre `ai_env='prod'`. El gasto de
 * dev/eval/scripts se reporta aparte (no diluye el costo real por usuario).
 *
 * Spec: docs/superpowers/specs/2026-06-11-medicion-costo-ia-design.md §5
 */
import { createAdminClient } from '@/lib/supabaseAdmin'

export interface CostUsageRow {
  created_at: string
  ai_env: string
  surface: string | null
  model: string | null
  user_id: string | null
  session_id: string | null
  cost_usd: number | string | null
  tokens_in: number | null
  cache_read_tokens: number | null
  cache_write_tokens: number | null
}

export interface CostByKey {
  key: string
  costUsd: number
  calls: number
}

export interface CostBySurface {
  surface: string
  costUsd: number
  calls: number
}
export interface CostByModel {
  model: string
  costUsd: number
  calls: number
}
export interface CostByDay {
  day: string
  costUsd: number
  calls: number
}
export interface CostByUser {
  userId: string
  costUsd: number
  calls: number
}

export interface CostSummary {
  periodDays: number
  planPriceUsd: number
  /** Costo total prod (la base del unit-economics). */
  prodCostUsd: number
  /** Costo total dev/eval/scripts (nuestro testing, excluido del cálculo por usuario). */
  devCostUsd: number
  totalCalls: number
  /** Usuarios prod distintos con al menos una llamada (user_id no nulo). */
  activeUsers: number
  /** prodCostUsd / activeUsers (≈ costo por usuario en el período). 0 si no hay usuarios. */
  costPerActiveUser: number
  /** planPriceUsd − costPerActiveUser. */
  marginPerUser: number
  // Coach (el mayor consumidor)
  coachCostUsd: number
  coachConversations: number
  costPerCoachConversation: number
  /** Fracción del input del coach servida por caché (cache_read / total input). */
  coachCacheHitPct: number
  // Desgloses (prod)
  bySurface: CostBySurface[]
  byModel: CostByModel[]
  byDay: CostByDay[]
  topUsers: CostByUser[]
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

const TOP_USERS = 20

export interface CostSummaryOpts {
  planPriceUsd: number
  periodDays: number
}

export function buildCostSummary(rows: CostUsageRow[], opts: CostSummaryOpts): CostSummary {
  const prod = rows.filter((r) => r.ai_env === 'prod')
  const dev = rows.filter((r) => r.ai_env !== 'prod')

  const prodCostUsd = prod.reduce((a, r) => a + num(r.cost_usd), 0)
  const devCostUsd = dev.reduce((a, r) => a + num(r.cost_usd), 0)

  const activeUsersSet = new Set<string>()
  for (const r of prod) if (r.user_id) activeUsersSet.add(r.user_id)
  const activeUsers = activeUsersSet.size
  const costPerActiveUser = activeUsers > 0 ? prodCostUsd / activeUsers : 0

  // Coach
  const coachRows = prod.filter((r) => r.surface === 'coach_chat')
  const coachCostUsd = coachRows.reduce((a, r) => a + num(r.cost_usd), 0)
  const coachSessions = new Set<string>()
  for (const r of coachRows) if (r.session_id) coachSessions.add(r.session_id)
  const coachConversations = coachSessions.size
  const costPerCoachConversation = coachConversations > 0 ? coachCostUsd / coachConversations : 0
  let coachCacheRead = 0
  let coachInputTotal = 0
  for (const r of coachRows) {
    const cr = num(r.cache_read_tokens)
    coachCacheRead += cr
    coachInputTotal += num(r.tokens_in) + cr + num(r.cache_write_tokens)
  }
  const coachCacheHitPct = coachInputTotal > 0 ? coachCacheRead / coachInputTotal : 0

  // Desgloses (prod)
  const bySurface = groupBy(prod, (r) => r.surface ?? 'other').map((g) => ({
    surface: g.key,
    costUsd: g.costUsd,
    calls: g.calls,
  }))
  const byModel = groupBy(prod, (r) => r.model ?? 'desconocido').map((g) => ({
    model: g.key,
    costUsd: g.costUsd,
    calls: g.calls,
  }))
  const byDay = groupBy(prod, (r) => r.created_at.slice(0, 10))
    .map((g) => ({ day: g.key, costUsd: g.costUsd, calls: g.calls }))
    .sort((a, b) => a.day.localeCompare(b.day))
  const topUsers = groupBy(
    prod.filter((r) => r.user_id),
    (r) => r.user_id as string,
  )
    .map((g) => ({ userId: g.key, costUsd: g.costUsd, calls: g.calls }))
    .slice(0, TOP_USERS)

  return {
    periodDays: opts.periodDays,
    planPriceUsd: opts.planPriceUsd,
    prodCostUsd,
    devCostUsd,
    totalCalls: rows.length,
    activeUsers,
    costPerActiveUser,
    marginPerUser: opts.planPriceUsd - costPerActiveUser,
    coachCostUsd,
    coachConversations,
    costPerCoachConversation,
    coachCacheHitPct,
    bySurface,
    byModel,
    byDay,
    topUsers,
  }
}

/** Agrupa por clave, suma costo y cuenta llamadas, ordenado por costo desc. */
function groupBy(rows: CostUsageRow[], keyFn: (r: CostUsageRow) => string): CostByKey[] {
  const map = new Map<string, { costUsd: number; calls: number }>()
  for (const r of rows) {
    const k = keyFn(r)
    const cur = map.get(k) ?? { costUsd: 0, calls: 0 }
    cur.costUsd += num(r.cost_usd)
    cur.calls += 1
    map.set(k, cur)
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, costUsd: v.costUsd, calls: v.calls }))
    .sort((a, b) => b.costUsd - a.costUsd)
}

const SELECT_COLS =
  'created_at, ai_env, surface, model, user_id, session_id, cost_usd, tokens_in, cache_read_tokens, cache_write_tokens'

/**
 * Consulta `ai_usage` de los últimos `periodDays` días y arma el resumen.
 * service-role (RLS la deja leer todo). Cap a 100k filas por seguridad.
 */
export async function getCostSummary(
  periodDays = 30,
  planPriceUsd = 0,
): Promise<CostSummary> {
  const sb = createAdminClient()
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString()
  const { data, error } = await sb
    .from('ai_usage')
    .select(SELECT_COLS)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100_000)
  if (error) throw error
  return buildCostSummary((data ?? []) as CostUsageRow[], { planPriceUsd, periodDays })
}
