import type { SupabaseClient } from '@supabase/supabase-js'

/** Rows of a read-only catalog query run through exec_sql, which only service_role executes. */
export async function execSql<T>(service: SupabaseClient, query: string): Promise<T[]> {
  const { data, error } = await service.rpc('exec_sql', { query })
  if (error) throw error
  if (!Array.isArray(data)) throw new Error(`exec_sql: ${JSON.stringify(data)}`)
  return data as T[]
}
