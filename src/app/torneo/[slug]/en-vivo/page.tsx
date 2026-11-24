// src/app/torneo/[slug]/en-vivo/page.tsx
// Server component: exige SESIÓN (cualquier cuenta, gratis incluida) + render inicial.
// No es PRO (decisión 24-nov-2026: la parte operativa del torneo nunca se bloquea),
// pero tampoco se abre a anónimos: el polling en pleno torneo pesa sobre Supabase.
// El Modo TV (/torneo/[slug]/tv) sí sigue siendo PRO. Los datos salen de la
// fuente única `armarTorneoEnVivo` (la misma que la ruta pública cacheable
// `/api/torneo/[slug]/live`, de la que LiveView se actualiza por polling).

import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { loginUrl } from '@/lib/auth/login-url'
import LiveView from './LiveView'
import { armarTorneoEnVivo, fetchTorneoEnVivoRow } from '@/lib/data/tournaments/en-vivo'
import { indicesDePerfil } from '@/lib/data/indices-de-perfil'
import { nombresDePerfil } from '@/lib/data/nombres-de-perfil'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function LivePage(props: PageProps) {
  const { slug } = await props.params
  const supabase = await createClient()

  // PRIMERO verificar que el torneo exista — un slug inexistente es 404, NO un
  // pedido de login (haría creer que el torneo existe detrás del login).
  const row = await fetchTorneoEnVivoRow(supabase, slug)
  if (!row) notFound()

  // Sin sesión → login, y vuelve acá al entrar. Ruta pública: getUser() (no getPageUser).
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(loginUrl(`/torneo/${slug}/en-vivo`))

  // Visor con sesión (cualquier plan): ve todo. Índices: lectura canónica de #509.
  const data = await armarTorneoEnVivo(supabase, row, { visorConSesion: true, leerIndices: indicesDePerfil, leerNombres: nombresDePerfil })
  return (
    <LiveView
      tournament={data.tournament}
      players={data.players}
      teams={data.teams}
      matches={[]}
      categories={data.categories}
      groups={data.groups}
      audiencia={row.organizer_id === user.id ? 'organizer' : 'player'}
      fuera={data.fuera}
    />
  )
}
