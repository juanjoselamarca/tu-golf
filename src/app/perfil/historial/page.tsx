import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { fetchHistorialRounds, fetchHistorialStats } from '@/lib/data/historial'
import { HistorialView } from './components/HistorialView'

export const metadata: Metadata = { title: 'Mi historial — Golfers+' }
export const dynamic = 'force-dynamic'

/**
 * Historial de rondas. Server Component (patrón Ola 5, igual que /perfil y
 * /perfil/stats — PR #262): resuelve auth con getPageUser (sin round-trip
 * duplicado — el middleware ya validó: /perfil/historial está bajo
 * protectedRoutes) y fetchea la lista de rondas + stats agregadas en paralelo
 * server-side. Antes era un client component con waterfall tras hidratar:
 * auth.getUser() → query de rondas client-side → fetch('/api/historial/stats')
 * (que a su vez repetía getUser). Ahora HistorialView pinta con datos al
 * instante; toda la interactividad (menú portal #256, borrar, editar,
 * agregar ronda) sigue client con paridad 1:1.
 *
 * Capa de datos: src/lib/data/historial.ts. Matemática de golf:
 * src/golf/stats/historial.ts (misma fuente que el route /api/historial/stats
 * — un concepto, una fuente; preserva el fix eagles/pares #254).
 *
 * stats puede venir null (query falló): la vista cae al cálculo local desde
 * las rondas, igual que caía cuando fallaba el fetch client (non-blocking).
 */
export default async function HistorialPage({
  searchParams,
}: {
  searchParams?: { add?: string }
}) {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?redirect=/perfil/historial')

  const [{ rounds, loadError }, stats] = await Promise.all([
    fetchHistorialRounds(supabase, user.id),
    fetchHistorialStats(supabase, user.id),
  ])

  return (
    <HistorialView
      userId={user.id}
      initialRounds={rounds}
      initialLoadError={loadError}
      stats={stats}
      initialShowForm={searchParams?.add === 'true'}
    />
  )
}
