import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { calcularCPI } from '@/golf/stats/cpi'

export const dynamic = 'force-dynamic'

// Endpoint solo-lectura: calcula el CPI en vivo para mostrarlo al usuario.
// El cache `cpi_score` en `profiles` se mantiene al importar rondas
// (`api/import/confirm/route.ts`), no acá — escribir en un GET es anti-patrón
// y agrega latencia a cada apertura del perfil.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })

  // El CPI usa solo las rondas recientes; traer todas es desperdicio de payload.
  const { data: rondas, error } = await supabase
    .from('historical_rounds')
    .select('played_at, total_gross, course_rating, slope_rating, holes_played')
    .eq('user_id', user.id)
    .order('played_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'No pudimos calcular tu índice. Intenta de nuevo.' }, { status: 500 })

  // Solo rondas de 18 hoyos (9H no tienen course_rating comparable)
  const rondasCPI = (rondas ?? [])
    .filter(r => {
      const holes = (r as Record<string, unknown>).holes_played as number | null
      return !holes || holes >= 18
    })
    .map(r => ({
      played_at: r.played_at,
      total_gross: r.total_gross,
      course_rating: r.course_rating ?? null,
      slope_rating: r.slope_rating ?? null,
    }))

  const resultado = calcularCPI(rondasCPI)

  return NextResponse.json({ ...resultado, updatedAt: new Date().toISOString() })
}
