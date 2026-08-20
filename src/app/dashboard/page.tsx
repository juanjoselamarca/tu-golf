// src/app/dashboard/page.tsx
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { redirect } from 'next/navigation'
import { ExperiencePopupWrapper } from '@/components/ExperiencePopupWrapper'
import { PostLoginRedirect } from '@/components/PostLoginRedirect'
import { MiGolfTabs } from '@/components/mi-golf/MiGolfTabs'
import { CompetenciaSection } from '@/components/mi-golf/CompetenciaSection'
import { IdentidadSection } from '@/components/mi-golf/IdentidadSection'
import { CompetenciaSkeleton } from '@/components/mi-golf/CompetenciaSkeleton'
import { IdentidadSkeleton } from '@/components/mi-golf/IdentidadSkeleton'
import { isNewUser } from '@/lib/data/dashboard'
import { OnboardingWizard } from './components/OnboardingWizard'

export const metadata: Metadata = {
  title: 'Inicio — Golfers+',
}

export const dynamic = 'force-dynamic'

/**
 * Mi Golf. El shell (barra de tabs) pinta apenas resuelve el auth; cada tab es
 * una sección server que streamea independiente dentro de su <Suspense>. Antes
 * la página esperaba 9 queries antes de pintar nada (primera carga MUY lenta).
 * El fetch + derivación de cada tab vive en su Section + la capa de datos
 * `src/lib/data/dashboard.ts` (regla "el que toca, ordena": sin supabase.from
 * directo en la page).
 *
 * Onboarding: si el usuario no tiene rondas (nuevo), muestra un wizard de 3
 * pasos para recoger handicap, club habitual, y enviarle a scorear su primera
 * ronda. El check es server-side (2 head-only count queries).
 */
export default async function DashboardPage() {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login')

  const userName = user.user_metadata?.name || user.email?.split('@')[0] || 'Golfista'

  // Lightweight server check — shows onboarding wizard for brand new users
  const showOnboarding = await isNewUser(supabase, user.id)

  if (showOnboarding) {
    return (
      <div style={{ background: '#ffffff', minHeight: '100vh' }}>
        <PostLoginRedirect />
        <OnboardingWizard userId={user.id} userName={userName} />
      </div>
    )
  }

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <PostLoginRedirect />
      <ExperiencePopupWrapper />

      <MiGolfTabs
        competencia={
          <Suspense fallback={<CompetenciaSkeleton />}>
            <CompetenciaSection userId={user.id} userName={userName} />
          </Suspense>
        }
        identidad={
          <Suspense fallback={<IdentidadSkeleton />}>
            <IdentidadSection userId={user.id} userName={userName} />
          </Suspense>
        }
      />
    </div>
  )
}
