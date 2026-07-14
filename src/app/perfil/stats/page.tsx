import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { fetchProfile } from '@/lib/data/perfil'
import { fetchStatsRounds } from '@/lib/data/stats'
import { StatsView } from './components/StatsView'

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
 * (dynamic ssr:false en StatsView). Capa de datos: src/lib/data/stats.ts;
 * matemática de golf: src/golf/stats/personal.ts + src/golf/core/compare.ts.
 */
export default async function StatsPage() {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?redirect=/perfil/stats')

  const [allRounds, profile] = await Promise.all([
    fetchStatsRounds(supabase, user.id),
    fetchProfile(supabase, user.id),
  ])

  return (
    <StatsView
      allRounds={allRounds}
      profileIndex={{
        indice: profile?.indice ?? null,
        indice_golfers: profile?.indice_golfers ?? null,
      }}
    />
  )
}
