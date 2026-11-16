import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { fetchProfile } from '@/lib/data/perfil'
import { fetchRondasNormalizadas } from '@/lib/data/historial'
import { StatsView } from './components/StatsView'
import { loginUrl } from '@/lib/auth/login-url'

export const metadata: Metadata = { title: 'Mis estadísticas — Golfers+' }
export const dynamic = 'force-dynamic'

/**
 * Estadísticas personales. Server Component (patrón Ola 5, igual que /perfil):
 * resuelve auth con getPageUser (sin round-trip duplicado — el middleware ya
 * validó: /perfil/stats está bajo protectedRoutes) y fetchea rondas + índices
 * en paralelo server-side. Antes era 'use client' con carga tras hidratar
 * (auth check + 2 queries en el cliente) → spinner + waterfall; además el
 * import estático de recharts metía ~120KB de route JS en el First Load.
 * Ahora StatsView pinta con datos al instante y recharts baja lazy
 * (dynamic ssr:false en StatsView). Datos: fetchRondasNormalizadas, la MISMA
 * lectura que /perfil/historial (src/lib/data/historial.ts); matemática de golf:
 * src/golf/stats/rondas-normalizadas.ts. Así las dos pantallas no se contradicen.
 */
export default async function StatsPage() {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect(loginUrl('/perfil/stats'))

  const [rondas, profile] = await Promise.all([
    fetchRondasNormalizadas(supabase, user.id),
    fetchProfile(supabase, user.id),
  ])

  return (
    <StatsView
      rondas={rondas}
      profileIndex={{
        indice: profile?.indice ?? null,
        indice_golfers: profile?.indice_golfers ?? null,
      }}
    />
  )
}
