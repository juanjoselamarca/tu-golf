// ─── Supabase Error Handler ───────────────────────────────────────────────────


export function handleSupabaseError(error: any, context: string): string {
  console.error(`[Supabase ${context}]`, error)

  if (error?.code === '23505') return 'Este registro ya existe'
  if (error?.code === '23503') return 'Referencia inválida'
  if (error?.code === 'PGRST116') return 'No se encontró el registro'
  if (error?.code === '42P01') return 'Error de configuración. Contacta al administrador.'
  if (error?.message?.includes('JWT')) return 'Sesión expirada, inicia sesión nuevamente'
  if (error?.message?.includes('schema cache') || error?.message?.includes("Could not find the table"))
    return 'Error interno. Contacta al administrador.'

  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}
