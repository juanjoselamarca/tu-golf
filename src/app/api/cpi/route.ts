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

  // Incluye 9h y 18h: calcularCPI usa el calcularDiferencial canónico, que
  // convierte 9h → equivalente-18h con holes_played. Antes se filtraban las 9h
  // (sin holes_played), lo que daba un CPI distinto al de /coach para el mismo
  // jugador. Ahora las tres superficies (/perfil, /coach, import-confirm) usan
  // exactamente los mismos inputs.
  const rondasCPI = (rondas ?? []).map(r => ({
    played_at: r.played_at,
    total_gross: r.total_gross,
    course_rating: r.course_rating ?? null,
    slope_rating: r.slope_rating ?? null,
    holes_played: (r as { holes_played?: number | null }).holes_played ?? null,
  }))

  const resultado = calcularCPI(rondasCPI)

  return NextResponse.json({ ...resultado, updatedAt: new Date().toISOString() })
}
