/**
 * Capa de acceso a `llm_models`. Devuelve el modelo active para un rol y
 * resuelve la cadena de fallback (siguiendo fallback_to_model_id).
 *
 * Útil para Vercel AI Gateway que acepta lista de modelos a probar en
 * orden y degrada automáticamente cuando un provider falla.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type LLMModelRole = 'primary_chat' | 'reasoning' | 'evaluator' | 'embedding' | 'rerank'
export type LLMModelStatus = 'active' | 'fallback' | 'deprecated' | 'retired'

export type LLMModel = {
  id: string
  model_id: string
  role: LLMModelRole
  status: LLMModelStatus
  context_window: number | null
  cost_per_1m_tokens_input: number | null
  cost_per_1m_tokens_output: number | null
  embedding_dim: number | null
  fallback_to_model_id: string | null
  config: Record<string, unknown> | null
}

let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('cerebro/llm-models: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  }
  _client = createClient(url, key)
  return _client
}

export async function resolveModelByRole(role: LLMModelRole): Promise<LLMModel | null> {
  const { data, error } = await client()
    .from('llm_models')
    .select('*')
    .eq('role', role)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as LLMModel | null
}

/**
 * Devuelve la cadena de model_ids empezando por el active y siguiendo
 * fallback_to_model_id hasta que se acaba.
 */
export async function resolveFallbackChain(role: LLMModelRole): Promise<string[]> {
  const primary = await resolveModelByRole(role)
  if (!primary) return []
  const chain: string[] = [primary.model_id]
  let current: LLMModel = primary
  while (current.fallback_to_model_id) {
    const { data, error } = await client()
      .from('llm_models')
      .select('*')
      .eq('model_id', current.fallback_to_model_id)
      .maybeSingle()
    if (error) throw error
    if (!data) break
    chain.push((data as LLMModel).model_id)
    current = data as LLMModel
  }
  return chain
}
