// GET /api/torneos/[slug]/nombres
//
// Nombre visible de cada inscrito del torneo, por `players.id`. Existe porque el
// scorer del jugador (`/torneo/[slug]/score`) es un componente de cliente: lee el
// roster con el cliente del navegador y la única policy SELECT de `profiles` es
// `TO authenticated`. Un invitado sin cuenta (el caso central del guest scoring,
// al que `guest-join` redirige acá) recibía el embed `profiles(name)` en null y el
// selector "¿Quién eres?" le mostraba N filas idénticas que decían "Jugador":
// no podía identificarse y un toque equivocado anotaba en la tarjeta de otro.
//
// Público, sin sesión: son los MISMOS nombres que el board `/torneo/[slug]` ya
// publica (el organizador comparte ese link para que se vean). Acotado a los
// torneos visibles públicamente, para no exponer el roster de un borrador.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { esVisiblePublicamente } from '@/lib/data/tournaments/joinFlow'
import { nombresDePerfil } from '@/lib/data/nombres-de-perfil'
import { resolveLegacyPlayerName } from '@/golf/leaderboard/board-rules'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const admin = createAdminClient()

  const { data: tournament, error } = await admin
    .from('tournaments')
    .select('id, status')
    .eq('slug', slug)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
  if (!tournament || !esVisiblePublicamente(tournament.status as string)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const { data: filas, error: errFilas } = await admin
    .from('players')
    .select('id, user_id, player_name')
    .eq('tournament_id', tournament.id)
  if (errFilas) return NextResponse.json({ error: 'db_error' }, { status: 500 })

  const roster = (filas ?? []) as Array<{ id: string; user_id: string | null; player_name: string | null }>
  const perfiles = await nombresDePerfil(roster.map((p) => p.user_id).filter(Boolean) as string[])

  const nombres: Record<string, string> = {}
  for (const p of roster) {
    // Misma fuente única que el board: perfil → player_name → "Jugador".
    nombres[p.id] = resolveLegacyPlayerName({
      profiles: p.user_id ? { name: perfiles.get(p.user_id) ?? null } : null,
      player_name: p.player_name,
    })
  }

  return NextResponse.json({ nombres })
}
