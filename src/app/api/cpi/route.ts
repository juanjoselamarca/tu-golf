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
    .select('played_at, diferencial')
    .eq('user_id', user.id)
    .order('played_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'No pudimos calcular tu índice. Intenta de nuevo.' }, { status: 500 })

  // El CPI usa el diferencial persistido (el mismo del índice, con el tope WHS
  // 3.1 y la conversión de 9h ya aplicados): /perfil, /coach e import-confirm
  // leen exactamente el mismo dato (#545).
  const rondasCPI = (rondas ?? []).map(r => ({ played_at: r.played_at, diferencial: r.diferencial ?? null }))

  const resultado = calcularCPI(rondasCPI)

  return NextResponse.json({ ...resultado, updatedAt: new Date().toISOString() })
}
