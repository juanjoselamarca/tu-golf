// src/app/torneo/[slug]/en-vivo/page.tsx
// Server component: gate PRO de la VISTA + render inicial. Los datos salen de la
// fuente única `armarTorneoEnVivo` (la misma que la ruta pública cacheable
// `/api/torneo/[slug]/live`, de la que LiveView se actualiza por polling).

import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { canAccessServer } from '@/golf/billing/server'
import LiveView from './LiveView'
import { LiveUpsell } from './LiveUpsell'
import { armarTorneoEnVivo, fetchTorneoEnVivoRow } from '@/lib/data/tournaments/en-vivo'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function LivePage(props: PageProps) {
  const { slug } = await props.params
  const supabase = await createClient()

  // PRIMERO verificar que el torneo exista — un slug inexistente es 404, NO un
  // upsell de PRO (haría creer que el torneo existe detrás de un paywall).
  const row = await fetchTorneoEnVivoRow(supabase, slug)
  if (!row) notFound()

  // Gate server-side de la vista: ruta pública, usar getUser() (no getPageUser).
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await canAccessServer('leaderboard-live', supabase, user.id))) {
    return <LiveUpsell loginNext={user ? undefined : `/torneo/${slug}/en-vivo`} />
  }

  const data = await armarTorneoEnVivo(supabase, row)
  return (
    <LiveView
      tournament={data.tournament}
      players={data.players}
      teams={data.teams}
      matches={[]}
      categories={data.categories}
      groups={data.groups}
    />
  )
}
