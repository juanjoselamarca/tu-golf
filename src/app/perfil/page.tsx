import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { fetchProfile, countTournaments, fetchCpi, fetchFedegolfStatus } from '@/lib/data/perfil'
import { PerfilView } from './components/PerfilView'

export const metadata: Metadata = { title: 'Perfil — Golfers+' }
export const dynamic = 'force-dynamic'

/**
 * Perfil. Server Component: resuelve auth con getPageUser (sin round-trip
 * duplicado — el middleware ya validó) y fetchea perfil + conteo de torneos +
 * CPI en paralelo server-side, co-locado con Supabase (gru1). Antes era un
 * client component con carga diferida tras hidratar (2 auth checks + 2 queries +
 * fetch al endpoint de CPI que re-autenticaba) → waterfall + spinner. Ahora
 * PerfilView pinta con datos al instante. Capa de datos: src/lib/data/perfil.ts.
 */
export default async function PerfilPage() {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?redirect=/perfil')

  const [profile, tourneysPlayed, cpiData, fedegolfStatus] = await Promise.all([
    fetchProfile(supabase, user.id),
    countTournaments(supabase, user.id),
    fetchCpi(supabase, user.id),
    fetchFedegolfStatus(supabase, user.id),
  ])

  if (!profile) {
    // Sin profile (caso borde: usuario auth sin fila en profiles). Antes la page
    // hacía `return null` (pantalla en blanco). Mantener ese comportamiento: el
    // trigger de creación de profile vive en el flujo de onboarding/login.
    return null
  }

  return (
    <PerfilView
      initialProfile={profile}
      userEmail={user.email ?? null}
      tourneysPlayed={tourneysPlayed}
      cpiData={cpiData}
      initialFedegolfStatus={fedegolfStatus}
    />
  )
}
