// ─── Supabase Error Handler ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSupabaseError(error: any, context: string): string {
  console.error(`[Supabase ${context}]`, error)

  if (error?.code === '23505') return 'Este registro ya existe'
  if (error?.code === '23503') return 'Referencia inválida'
  if (error?.code === 'PGRST116') return 'No se encontró el registro'
  if (error?.code === '42P01') return 'La tabla no existe — ejecuta el SQL de configuración'
  if (error?.message?.includes('JWT')) return 'Sesión expirada, inicia sesión nuevamente'
  if (error?.message?.includes('schema cache') || error?.message?.includes("Could not find the table"))
    return 'Error de configuración de base de datos — ejecuta EJECUTAR_EN_SUPABASE.sql'

  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}
