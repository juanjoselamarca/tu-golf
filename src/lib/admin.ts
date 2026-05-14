import type { SupabaseClient } from '@supabase/supabase-js'

// Verificación async basada en columna role (método principal)
export async function isAdmin(
  userId: string | undefined,
  supabase: SupabaseClient
): Promise<boolean> {
  if (!userId) return false
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  return data?.role === 'admin'
}
