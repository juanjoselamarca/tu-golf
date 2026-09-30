// src/app/torneo/[slug]/tv/page.tsx
// Server component: gate billing server-side antes de cargar el board de TV.
// El componente cliente TVBoard solo carga si el usuario tiene acceso Pro.

import { createClient } from '@/utils/supabase/server'
import { canAccessServer } from '@/golf/billing/server'
import TVBoard from './TVBoard'
import { TvUpsell } from './TvUpsell'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function TVPage({ params }: PageProps) {
  const supabase = await createClient()
  // Ruta pública: usar getUser() (no getPageUser) — no hay middleware redirect acá.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !(await canAccessServer('tournament-tv', supabase, user.id))) {
    return <TvUpsell />
  }

  // Acceso confirmado server-side: renderizar el board completo.
  // TVBoard es client component y usa su propio ProGate como defensa en profundidad.
  void params // slug lo lee TVBoard desde useParams()
  return <TVBoard />
}
