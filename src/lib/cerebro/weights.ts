/**
 * Capa de acceso a la tabla `cerebro_weights` — pesos paramétricos vivos
 * del cerebro v3. Las mutaciones via setWeight() disparan el trigger
 * Postgres `notify_cerebro_weights_change` que emite pg_notify sobre el
 * canal 'cerebro_weights_updated' para invalidación distribuida (Task 14).
 *
 * Cliente service_role: este módulo se importa desde APIs admin server-side
 * y desde el harness de evaluación. NO usar desde el browser (expondría
 * SUPABASE_SERVICE_ROLE_KEY).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type ParameterType = 'block' | 'pattern' | 'source' | 'user_cluster'
export type WeightSource = 'auto' | 'manual' | 'seed'

export type CerebroWeight = {
  id: string
  parameter_type: ParameterType
  parameter_key: string
  current_weight: number
  previous_weight: number | null
  user_cluster_id: string | null
  source: WeightSource
  version: number
  locked_until: string | null
  last_auto_update_at: string | null
  last_manual_override_at: string | null
  updated_at: string
}

let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('cerebro/weights: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  }
  _client = createClient(url, key)
  return _client
}

/** Solo para tests: permite inyectar un cliente custom. */
export function __setClient(sb: SupabaseClient | null): void {
  _client = sb
}

export async function getAllWeights(): Promise<CerebroWeight[]> {
  const { data, error } = await client().from('cerebro_weights').select('*')
  if (error) throw error
  return (data ?? []) as CerebroWeight[]
}

export async function getWeightByKey(
  type: ParameterType,
  key: string,
): Promise<CerebroWeight | null> {
  const { data, error } = await client()
    .from('cerebro_weights')
    .select('*')
    .eq('parameter_type', type)
    .eq('parameter_key', key)
    .is('user_cluster_id', null)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as CerebroWeight | null
}

export async function setWeight(
  type: ParameterType,
  key: string,
  newWeight: number,
  source: 'auto' | 'manual',
): Promise<void> {
  if (newWeight < 0 || newWeight > 1) {
    throw new Error(`cerebro/weights: peso fuera de [0,1]: ${newWeight}`)
  }
  const existing = await getWeightByKey(type, key)
  const now = new Date().toISOString()

  // UPDATE explícito vs INSERT — no usamos upsert porque Postgres trata
  // NULL como distinto en UNIQUE constraints por default, lo que crearía
  // duplicados para pesos globales (user_cluster_id IS NULL).
  if (existing) {
    const { error } = await client()
      .from('cerebro_weights')
      .update({
        current_weight: newWeight,
        previous_weight: existing.current_weight,
        source,
        version: existing.version + 1,
        last_auto_update_at: source === 'auto' ? now : existing.last_auto_update_at,
        last_manual_override_at: source === 'manual' ? now : existing.last_manual_override_at,
        updated_at: now,
      })
      .eq('id', existing.id)
    if (error) throw error
    return
  }

  const { error } = await client()
    .from('cerebro_weights')
    .insert({
      parameter_type: type,
      parameter_key: key,
      current_weight: newWeight,
      previous_weight: null,
      source,
      version: 1,
      last_auto_update_at: source === 'auto' ? now : null,
      last_manual_override_at: source === 'manual' ? now : null,
      updated_at: now,
    })
  if (error) throw error
}
