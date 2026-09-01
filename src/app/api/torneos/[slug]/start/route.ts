// src/app/api/torneos/[slug]/start/route.ts
//
// POST — Inicia el torneo: materializa rondas, ronda_libre, ronda_libre_jugadores,
// ronda_equipos (si formato por equipos) y actualiza status a 'in_progress'.
//
// Antes esta lógica vivía 100% client-side en useTournamentLifecycle.ts (~60
// llamadas secuenciales a Supabase). Si la conexión se cortaba, el torneo quedaba
// medio-creado. Ahora es atómico: todo o nada, server-side, con service role.
//
// Auth: solo el organizer_id del torneo puede iniciar.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import {
  computeStoredTeamHandicap,
  resolvePlayerHandicap,
  isProducerTeamFormat,
} from '@/lib/data/tournaments/teamRounds'
import { FORMAT_META } from '@/golf/core/rules'
import type { FormatoJuego } from '@/golf/core/rules'

export const dynamic = 'force-dynamic'

interface TournamentRow {
  id: string
  slug: string
  organizer_id: string
  status: string
  format: string | null
  course_id: string | null
  course_name: string | null
  tees: string | null
  hole_count: number | null
  date_start: string | null
  courses: { nombre?: string } | null
}

interface PlayerRow {
  id: string
  user_id: string | null
  player_name: string | null
  handicap_at_registration: number | null
  status: string
  profiles: { name: string; indice: number | null } | null
}

interface GroupRow {
  id: string
  name: string
  ronda_libre_id: string | null
  players: Array<{ id: string; player_id: string }>
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Auth: verificar sesión
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
  }

  const svc = createAdminClient()

  // Fetch tournament
  const { data: tournament, error: tErr } = await svc
    .from('tournaments')
    .select('id, slug, organizer_id, status, format, course_id, course_name, tees, hole_count, date_start, courses(nombre)')
    .eq('slug', slug)
    .single()

  if (tErr || !tournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })
  }
  const t = tournament as unknown as TournamentRow

  // Solo el organizador puede iniciar
  if (t.organizer_id !== user.id) {
    return NextResponse.json({ error: 'Solo el organizador puede iniciar el torneo' }, { status: 403 })
  }

  // Solo se puede iniciar desde draft u open
  if (t.status !== 'draft' && t.status !== 'open') {
    return NextResponse.json(
      { error: 'Solo se puede iniciar un torneo en borrador o con inscripciones abiertas' },
      { status: 409 },
    )
  }

  // Fetch players
  const { data: rawPlayers } = await svc
    .from('players')
    .select('id, user_id, player_name, handicap_at_registration, status, profiles(name, indice)')
    .eq('tournament_id', t.id)

  const players = (rawPlayers || []) as unknown as PlayerRow[]
  const approvedPlayers = players.filter((p) => p.status === 'approved')

  if (approvedPlayers.length < 1) {
    return NextResponse.json({ error: 'Se necesita al menos 1 jugador aprobado' }, { status: 400 })
  }

  // Fetch groups
  const { data: rawGroups } = await svc
    .from('tournament_groups')
    .select('id, name, ronda_libre_id, tournament_group_players(id, player_id)')
    .eq('tournament_id', t.id)
    .order('sort_order', { ascending: true })

  const groups: GroupRow[] = (rawGroups || []).map((g: Record<string, unknown>) => ({
    id: g.id as string,
    name: g.name as string,
    ronda_libre_id: g.ronda_libre_id as string | null,
    players: (g.tournament_group_players as Array<{ id: string; player_id: string }>) || [],
  }))

  // Validación: todos los aprobados deben estar en algún grupo
  const groupedIds = new Set<string>()
  for (const g of groups) {
    for (const gp of g.players) groupedIds.add(gp.player_id)
  }
  const ungrouped = approvedPlayers.filter((p) => !groupedIds.has(p.id))
  if (ungrouped.length > 0) {
    const names = ungrouped
      .map((p) => p.profiles?.name || p.player_name || 'Jugador')
      .slice(0, 5)
      .join(', ')
    const extra = ungrouped.length > 5 ? ` y ${ungrouped.length - 5} más` : ''
    return NextResponse.json(
      { error: `Jugadores sin grupo: ${names}${extra}. Asigna a un grupo antes de iniciar.` },
      { status: 400 },
    )
  }

  // Validación de tamaño de equipo en formatos por equipos
  const teamFormat = isProducerTeamFormat(t.format)
  if (teamFormat) {
    const meta = FORMAT_META[t.format as FormatoJuego]
    const rango = meta?.jugadoresPorEquipo
    if (rango) {
      const fueraDeRango = groups.filter(
        (g) => g.players.length > 0 && (g.players.length < rango.min || g.players.length > rango.max),
      )
      if (fueraDeRango.length > 0) {
        const exigido = rango.min === rango.max ? `${rango.min}` : `${rango.min} a ${rango.max}`
        const detalle = fueraDeRango
          .map((g) => `"${g.name}" (${g.players.length})`)
          .slice(0, 5)
          .join(', ')
        const extra = fueraDeRango.length > 5 ? ` y ${fueraDeRango.length - 5} más` : ''
        return NextResponse.json(
          { error: `Tamaño de equipo incorrecto. En ${meta.label}, cada equipo debe tener ${exigido} jugadores. Corrige: ${detalle}${extra}.` },
          { status: 400 },
        )
      }
    }
  }

  // ── Materialización de rondas (todo server-side, service role) ──
  try {
    // 1. Crear rounds para todos los aprobados que no tengan uno
    const { data: existingRounds } = await svc
      .from('rounds')
      .select('player_id')
      .eq('tournament_id', t.id)
      .eq('round_number', 1)

    const existingPlayerIds = new Set(
      (existingRounds || []).map((r: { player_id: string }) => r.player_id),
    )
    const playersNeedingRound = approvedPlayers.filter((p) => !existingPlayerIds.has(p.id))

    if (playersNeedingRound.length > 0) {
      const roundInserts = playersNeedingRound.map((p) => ({
        tournament_id: t.id,
        player_id: p.id,
        round_number: 1,
        status: 'in_progress',
      }))
      const { error: roundErr } = await svc.from('rounds').insert(roundInserts)
      if (roundErr) {
        void captureError(roundErr, { context: 'start-tournament.crear-rounds', level: 'warning' })
      }
    }

    // 2. Crear rondas_libres + jugadores + equipos para grupos sin ronda
    const groupsWithoutRonda = groups.filter((g) => !g.ronda_libre_id && g.players.length > 0)

    for (const group of groupsWithoutRonda) {
      const codigo = 'T' + Math.random().toString(36).substring(2, 8).toUpperCase()
      const courseName = t.courses?.nombre || t.course_name || 'Cancha'

      const { data: ronda, error: rondaErr } = await svc
        .from('rondas_libres')
        .insert({
          codigo,
          creador_id: user.id,
          course_id: t.course_id || null,
          course_name: courseName,
          tees: t.tees || 'blanco',
          holes: t.hole_count || 18,
          fecha: t.date_start || new Date().toISOString().split('T')[0],
          estado: 'en_curso',
          ...(teamFormat ? { formato_juego: t.format } : {}),
        })
        .select('id')
        .single()

      if (rondaErr || !ronda) {
        void captureError(rondaErr ?? new Error('ronda_libre no creada'), {
          context: 'start-tournament.crear-ronda-libre',
          level: 'warning',
          meta: { group: group.name },
        })
        continue
      }

      // Link group to ronda_libre
      await svc.from('tournament_groups').update({ ronda_libre_id: ronda.id }).eq('id', group.id)

      // Create ronda_libre_jugadores for each player in the group
      const teamMembers: Array<{ jugadorRondaId: string; handicap: number }> = []
      for (const gp of group.players) {
        const player = players.find((p) => p.id === gp.player_id)
        if (!player) continue

        const handicap = resolvePlayerHandicap(player)
        const { data: jugador } = await svc
          .from('ronda_libre_jugadores')
          .insert({
            ronda_id: ronda.id,
            nombre: player.profiles?.name || player.player_name || 'Jugador',
            user_id: player.user_id || null,
            ...((teamFormat || !player.user_id) ? { handicap } : {}),
            scores: {},
          })
          .select('id')
          .single()

        if (jugador) {
          await svc
            .from('tournament_group_players')
            .update({ jugador_ronda_id: jugador.id })
            .eq('group_id', group.id)
            .eq('player_id', gp.player_id)
          teamMembers.push({ jugadorRondaId: jugador.id, handicap })
        }
      }

      // Formato por equipos: crear ronda_equipos + miembros
      if (teamFormat && teamMembers.length > 0) {
        const handicapEquipo = computeStoredTeamHandicap(
          t.format ?? '',
          teamMembers.map((m) => m.handicap),
        )

        const { data: equipo, error: equipoErr } = await svc
          .from('ronda_equipos')
          .insert({
            ronda_id: ronda.id,
            nombre: group.name,
            handicap_equipo: handicapEquipo,
            scores: {},
          })
          .select('id')
          .single()

        if (equipoErr || !equipo) {
          void captureError(equipoErr ?? new Error('ronda_equipos no creado'), {
            context: 'start-tournament.crear-ronda-equipo',
            level: 'warning',
            meta: { group: group.name },
          })
        } else {
          const memberRows = teamMembers.map((m, idx) => ({
            equipo_id: equipo.id,
            jugador_id: m.jugadorRondaId,
            orden: idx,
          }))
          const { error: membersErr } = await svc
            .from('ronda_equipo_jugadores')
            .insert(memberRows)
          if (membersErr) {
            void captureError(membersErr, {
              context: 'start-tournament.crear-ronda-equipo-jugadores',
              level: 'warning',
              meta: { group: group.name },
            })
          }
        }
      }
    }

    // 3. ÚLTIMO: actualizar status a in_progress (solo si todo lo anterior pasó)
    const { error: statusErr } = await svc
      .from('tournaments')
      .update({ status: 'in_progress' })
      .eq('id', t.id)

    if (statusErr) {
      void captureError(statusErr, { context: 'start-tournament.set-status', level: 'error' })
      return NextResponse.json({ error: 'No se pudo actualizar el estado del torneo' }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: 'in_progress' })
  } catch (err) {
    void captureError(err, { context: 'start-tournament', level: 'error', meta: { slug } })
    return NextResponse.json(
      { error: 'Error interno al iniciar el torneo. Intenta de nuevo.' },
      { status: 500 },
    )
  }
}
