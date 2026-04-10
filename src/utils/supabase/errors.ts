// ─── Supabase Error Handler ───────────────────────────────────────────────────


interface SupabaseErrorLike {
  code?: string
  message?: string
}

export function handleSupabaseError(error: unknown, context: string): string {
  console.error(`[Supabase ${context}]`, error)

  const e = (error ?? {}) as SupabaseErrorLike

  if (e.code === '23505') return 'Este registro ya existe'
  if (e.code === '23503') return 'Referencia inválida'
  if (e.code === 'PGRST116') return 'No se encontró el registro'
  if (e.code === '42P01') return 'Error de configuración. Contacta al administrador.'
  if (e.message?.includes('JWT')) return 'Sesión expirada, inicia sesión nuevamente'
  if (e.message?.includes('schema cache') || e.message?.includes("Could not find the table"))
    return 'Error interno. Contacta al administrador.'

  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}
