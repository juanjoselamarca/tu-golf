import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { calcularCPI } from '@/golf/stats/cpi'
import { fetchRondasCPI } from '@/lib/data/perfil'

export const dynamic = 'force-dynamic'

// Endpoint solo-lectura: calcula el CPI en vivo para mostrarlo al usuario.
// El cache `cpi_score` en `profiles` se mantiene al importar rondas
// (`lib/import/confirmar.ts`), no acá — escribir en un GET es anti-patrón
// y agrega latencia a cada apertura del perfil.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })

  // Las mismas rondas que /perfil, /coach y el caché de import-confirm
  // (`fetchRondasCPI`: sin FedeGolf ni rondas excluidas, diferencial persistido).
  const rondasCPI = await fetchRondasCPI(supabase, user.id)
  if (!rondasCPI) return NextResponse.json({ error: 'No pudimos calcular tu índice. Intenta de nuevo.' }, { status: 500 })

  const resultado = calcularCPI(rondasCPI)

  return NextResponse.json({ ...resultado, updatedAt: new Date().toISOString() })
}
