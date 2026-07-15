import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fetchHistorialStats } from '@/lib/data/historial'

export const dynamic = 'force-dynamic'

/**
 * Stats agregadas del historial. Handler delgado (refactor "el que toca,
 * ordena"): queries en src/lib/data/historial.ts (fetchHistorialStats) y
 * matemática de golf en src/golf/stats/historial.ts (computeHistorialStats)
 * — la MISMA fuente que consume el Server Component /perfil/historial, que
 * ya no llama a este endpoint (regla "un concepto, una fuente").
 *
 * El fix eagles/pares (bug inbox 2268163d / PR #254 — paginación determinista
 * de course_holes por (course_id, numero) + buildCourseParMap indexado por
 * numero) vive intacto en esas dos fuentes.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })
  }

  const stats = await fetchHistorialStats(supabase, user.id)
  if (!stats) {
    return NextResponse.json({ error: 'No pudimos cargar tu historial. Intenta de nuevo.' }, { status: 500 })
  }

  return NextResponse.json(stats)
}
