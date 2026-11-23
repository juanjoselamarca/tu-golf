// src/lib/data/ronda-libre-crear.ts
//
// Lecturas que necesita POST /api/ronda-libre/create antes de insertar la ronda.
// Vivían dentro de la ruta; se sacaron para que el handler quede en validar,
// llamar y responder ("el que toca, ordena", 23-nov-2026). Sin cambio de conducta.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Código de 6 caracteres con azar criptográfico que todavía no usa ninguna ronda. */
export async function generarCodigoDeRonda(supabase: SupabaseClient): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const bytes = new Uint8Array(4)
    crypto.getRandomValues(bytes)
    const codigo = Array.from(bytes).map(b => b.toString(36)).join('').substring(0, 6).toUpperCase()
    const { data } = await supabase.from('rondas_libres').select('id').eq('codigo', codigo).maybeSingle()
    if (!data) return codigo
  }
  // Cinco choques seguidos: prefijo de un UUID.
  return crypto.randomUUID().substring(0, 8).toUpperCase()
}

/**
 * El nombre de la cancha con que se graba la ronda: si la cancha es del
 * catálogo, el más usado en sus rondas anteriores, para que En Vivo no muestre
 * variantes del mismo club ("Lomas de La Dehesa" y "Club de Golf Lomas de La
 * Dehesa"; un usuario abandonó una ronda por eso el 30-ago-2026). No se usa
 * `courses.nombre`: es el formato largo de FedeGolf, peor para leer.
 */
export async function nombreDeCanchaDeRonda(
  supabase: SupabaseClient,
  courseId: string | null,
  nombreEscrito: string,
): Promise<string> {
  if (!courseId) return nombreEscrito
  const { data: prevRondas } = await supabase
    .from('rondas_libres')
    .select('course_name')
    .eq('course_id', courseId)
    .not('course_name', 'is', null)
    .limit(20)
  if (!prevRondas || prevRondas.length === 0) return nombreEscrito

  const counts: Record<string, number> = {}
  for (const r of prevRondas as { course_name: string }[]) {
    counts[r.course_name] = (counts[r.course_name] ?? 0) + 1
  }
  let maxName = nombreEscrito
  let maxCount = 0
  for (const name of Object.keys(counts)) {
    if (counts[name] > maxCount) { maxCount = counts[name]; maxName = name }
  }
  return maxName
}
