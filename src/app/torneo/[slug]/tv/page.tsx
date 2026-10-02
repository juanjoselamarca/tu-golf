// src/app/torneo/[slug]/tv/page.tsx
// Server component: gate billing server-side antes de cargar el board de TV.
// El componente cliente TVBoard solo carga si el usuario tiene acceso Pro.

import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { canAccessServer } from '@/golf/billing/server'
import TVBoard from './TVBoard'
import { TvUpsell } from './TvUpsell'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function TVPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()

  // PRIMERO verificar que el torneo exista — un slug inexistente es 404,
  // NO un upsell de PRO (confunde al usuario haciéndole creer que el
  // torneo existe detrás de un paywall).
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tournament) notFound()

  // Ruta pública: usar getUser() (no getPageUser) — no hay middleware redirect acá.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !(await canAccessServer('tournament-tv', supabase, user.id))) {
    return <TvUpsell loginNext={user ? undefined : `/torneo/${slug}/tv`} />
  }

  // Acceso confirmado server-side: renderizar el board completo.
  // TVBoard es client component y usa su propio ProGate como defensa en profundidad.
  return <TVBoard />
}
