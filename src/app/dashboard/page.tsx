// src/app/dashboard/page.tsx
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { ExperiencePopupWrapper } from '@/components/ExperiencePopupWrapper'
import { PostLoginRedirect } from '@/components/PostLoginRedirect'
import { MiGolfTabs } from '@/components/mi-golf/MiGolfTabs'
import { CompetenciaSection } from '@/components/mi-golf/CompetenciaSection'
import { IdentidadSection } from '@/components/mi-golf/IdentidadSection'
import { CompetenciaSkeleton } from '@/components/mi-golf/CompetenciaSkeleton'
import { IdentidadSkeleton } from '@/components/mi-golf/IdentidadSkeleton'

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
 */
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const userName = user.user_metadata?.name || user.email?.split('@')[0] || 'Golfista'

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
