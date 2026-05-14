// src/lib/draft/ai-cost-tracker.ts
import type { SupabaseClient } from '@supabase/supabase-js'

const ALARM_THRESHOLD_USD = 100

export async function logAiCall(
  supabase: SupabaseClient,
  draftId: string,
  actorId: string,
  message: string,
  explanation: string,
  costUsd: number,
  latencyMs: number,
  configPartial: object,
  configBefore: object,
) {
  await supabase.from('tournament_draft_events').insert({
    draft_id: draftId,
    actor_id: actorId,
    config_partial: configPartial,
    config_before: configBefore,
    source: 'ai',
    ai_message: message,
    ai_explanation: explanation,
    ai_cost_usd: costUsd,
    ai_latency_ms: latencyMs,
  })
}

export async function getMonthlyAiCostUsd(supabase: SupabaseClient): Promise<number> {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('tournament_draft_events')
    .select('ai_cost_usd')
    .eq('source', 'ai')
    .gte('created_at', monthStart.toISOString())

  return (data || []).reduce((sum, r: any) => sum + (Number(r.ai_cost_usd) || 0), 0)
}

export function shouldAlarm(monthlyCostUsd: number): boolean {
  return monthlyCostUsd >= ALARM_THRESHOLD_USD
}

export const AI_COST_ALARM_THRESHOLD_USD = ALARM_THRESHOLD_USD
