import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { calcularDiferencial, calcularNivel } from '@/lib/indice-golfers'

export const dynamic = 'force-dynamic'

function validateScoreInputs(body: Record<string, unknown>): string | null {
  const { hole_number, gross_score, par } = body
  if (!Number.isInteger(hole_number) || (hole_number as number) < 1 || (hole_number as number) > 18)
    return 'hole_number debe ser entero entre 1 y 18'
  if (gross_score !== null && gross_score !== undefined) {
    if (!Number.isInteger(gross_score) || (gross_score as number) < 1 || (gross_score as number) > 19)
      return 'El score debe ser entre 1 y 19'
  }
  if (par !== undefined && (!Number.isInteger(par) || (par as number) < 3 || (par as number) > 5))
    return 'El par debe ser 3, 4 o 5'
  return null
}

async function getAuthUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            )
          } catch {}
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return { user, supabase }
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const { user, supabase } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })

  const body = await request.json()
  const { action, tournament_id } = body

  if (!action || typeof action !== 'string') {
    return NextResponse.json({ error: 'Acción requerida o no válida' }, { status: 400 })
  }

  // Verify tournament exists and is in a valid state for scoring
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('organizer_id, status')
    .eq('id', tournament_id)
    .single()

  if (!tournament) {
    return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 })
  }

  // Block scoring on tournaments that aren't active
  const scorableStatuses = ['active', 'in_progress']
  if (!scorableStatuses.includes(tournament.status) && action === 'upsert_score') {
    return NextResponse.json({ error: 'El torneo no está activo. No se pueden registrar scores.' }, { status: 409 })
  }

  // Si no es organizador, verifica si es el jugador de la ronda
  // cancel_tournament y withdraw_player hacen sus propios checks de auth más abajo
  const selfAuthActions = ['cancel_tournament', 'withdraw_player']
  let isAllowed = tournament.organizer_id === user.id
  if (!isAllowed && action === 'upsert_score') {
    const { round_id } = body
    const { data: round } = await supabase
      .from('rounds')
      .select('player_id, players(user_id)')
      .eq('id', round_id)
      .single()
    const playerUserId = (round?.players as unknown as { user_id: string } | null)?.user_id
    isAllowed = playerUserId === user.id
  }
  if (!isAllowed && !selfAuthActions.includes(action)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const svc = serviceClient()

  // ── upsert_score ────────────────────────────────────────
  if (action === 'upsert_score') {
    const validationError = validateScoreInputs(body)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
    const { round_id, hole_number, par, gross_score, putts, fairway_hit, gir } = body

    // Validate round is not closed/finalized before accepting scores
    const { data: roundCheck } = await svc.from('rounds').select('status').eq('id', round_id).single()
    if (roundCheck?.status === 'closed' || roundCheck?.status === 'official') {
      return NextResponse.json({ error: 'La ronda ya está finalizada. No se pueden registrar scores.' }, { status: 409 })
    }
    let { net_score, points } = body as { net_score: number | null; points: number | null }

    // Auto-calculate net_score and points if not provided
    if (gross_score != null && (net_score == null || points == null)) {
      // Look up player HCP and stroke_index
      const { data: roundData } = await svc
        .from('rounds')
        .select('player_id, players(handicap_at_registration, tournament_id)')
        .eq('id', round_id)
        .single()
      const rd = roundData as unknown as {
        player_id: string
        players: { handicap_at_registration: number | null; tournament_id: string } | null
      } | null

      if (rd?.players) {
        const hcp          = rd.players.handicap_at_registration ?? 18
        const tournId      = rd.players.tournament_id
        const { data: chData } = await svc
          .from('tournaments')
          .select('courses(id)')
          .eq('id', tournId)
          .single()
        const courseId = (chData as unknown as { courses: { id: string } | null } | null)?.courses?.id

        let strokeIndex = hole_number  // fallback
        if (courseId) {
          const { data: holeRow } = await svc
            .from('course_holes')
            .select('stroke_index')
            .eq('course_id', courseId)
            .eq('numero', hole_number)
            .single()
          if (holeRow) strokeIndex = (holeRow as unknown as { stroke_index: number }).stroke_index
        }

        if (net_score == null) {
          const grossNeto = gross_score - strokesRecibidosEnHoyo(hcp, strokeIndex)
          net_score       = grossNeto  // store gross-strokes (absolute), not over/under
        }
        if (points == null) {
          points = puntosStablefordHoyo(gross_score, par, hcp, strokeIndex)
        }
      }
    }

    const upsertData: Record<string, unknown> = {
      round_id, hole_number, par, gross_score, net_score, points,
      source: 'manual_organizer', status: 'loaded',
    }
    if (putts       !== undefined && putts       !== null) upsertData.putts       = putts
    if (fairway_hit !== undefined && fairway_hit !== null) upsertData.fairway_hit = fairway_hit
    if (gir         !== undefined && gir         !== null) upsertData.gir         = gir

    const { error } = await svc.from('hole_scores').upsert(
      upsertData,
      { onConflict: 'round_id,hole_number' }
    )

    if (error) return NextResponse.json({ error: 'No se pudo guardar el score. Intenta de nuevo.' }, { status: 500 })

    // Registro de auditoría — no bloquear si falla
    if (gross_score != null) {
      try {
        await svc.from('score_audit_log').insert({
          hole_score_id: round_id + '_' + hole_number,
          changed_by: user.id,
          new_value: gross_score,
          reason: 'manual_organizer',
        })
      } catch { /* audit log failure should not block score save */ }
    }

    // Recalculate round totals
    const { data: allScores } = await svc
      .from('hole_scores')
      .select('gross_score, net_score, points')
      .eq('round_id', round_id)
      .not('gross_score', 'is', null)

    const totalGross   = allScores?.reduce((s, h) => s + (h.gross_score  ?? 0), 0) ?? 0
    const totalNet     = allScores?.reduce((s, h) => s + (h.net_score    ?? 0), 0) ?? 0
    const totalPoints  = allScores?.reduce((s, h) => s + (h.points       ?? 0), 0) ?? 0

    await svc
      .from('rounds')
      .update({ total_gross: totalGross, total_net: totalNet, total_points: totalPoints })
      .eq('id', round_id)

    return NextResponse.json({ success: true, totalGross, totalNet, totalPoints })
  }

  // ── finalize_round ──────────────────────────────────────
  if (action === 'finalize_round') {
    const { round_id } = body
    const { data: currentRound } = await svc
      .from('rounds')
      .select('status')
      .eq('id', round_id)
      .single()
    if (currentRound?.status === 'closed' || currentRound?.status === 'official') {
      return NextResponse.json({ error: 'La ronda ya está finalizada' }, { status: 409 })
    }
    const { error } = await svc
      .from('rounds')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', round_id)

    if (error) return NextResponse.json({ error: 'No se pudo finalizar la ronda. Intenta de nuevo.' }, { status: 500 })

    // Save to historical_rounds if tournament.afecta_estadisticas = true
    try {
      const { data: round } = await svc
        .from('rounds')
        .select('player_id, total_gross, tournament_id')
        .eq('id', round_id)
        .single()

      if (round) {
        const { data: tourneyData } = await svc
          .from('tournaments')
          .select('afecta_estadisticas, course_id, courses(nombre, slope_rating, course_rating)')
          .eq('id', round.tournament_id)
          .single()

        const tourney = tourneyData as unknown as {
          afecta_estadisticas: boolean | null
          course_id: string | null
          courses: { nombre: string; slope_rating: number; course_rating: number } | null
        } | null

        const { data: player } = await svc
          .from('players')
          .select('user_id')
          .eq('id', round.player_id)
          .single()

        if (tourney?.afecta_estadisticas && player?.user_id && round.total_gross > 0) {
          const { data: holeScores } = await svc
            .from('hole_scores')
            .select('hole_number, gross_score')
            .eq('round_id', round_id)
            .order('hole_number')

          const scoresArray = Array.from({ length: 18 }, (_, i) => {
            const hs = holeScores?.find((h: { hole_number: number }) => h.hole_number === i + 1)
            return hs?.gross_score ?? null
          })

          const slopeRating = tourney.courses?.slope_rating ?? null
          const courseRating = tourney.courses?.course_rating ?? null
          const diferencial = (slopeRating && courseRating)
            ? calcularDiferencial(round.total_gross, courseRating, slopeRating)
            : null

          await svc.from('historical_rounds').insert({
            user_id: player.user_id,
            course_name: tourney.courses?.nombre ?? 'Torneo',
            course_id: tourney.course_id ?? null,
            played_at: new Date().toISOString().split('T')[0],
            total_gross: round.total_gross,
            scores: scoresArray,
            privacy: 'private',
            slope_rating: slopeRating,
            course_rating: courseRating,
            diferencial,
            import_source: 'tournament',
          })

          // Recalculate index and nivel (non-blocking)
          svc.rpc('calcular_indice_golfers', { p_user_id: player.user_id }).then(() => {})

          const hace90Dias = new Date()
          hace90Dias.setDate(hace90Dias.getDate() - 90)
          svc.from('historical_rounds')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', player.user_id)
            .gte('played_at', hace90Dias.toISOString())
            .then(({ count }: { count: number | null }) => {
              const nuevoNivel = calcularNivel(count ?? 0)
              const expira = new Date()
              expira.setDate(expira.getDate() + 60)
              svc.from('profiles').update({
                nivel: nuevoNivel,
                nivel_updated_at: new Date().toISOString(),
                nivel_expires_at: expira.toISOString(),
              }).eq('id', player.user_id).then(() => {})
            })
        }
      }
    } catch { /* historical_rounds save is non-blocking */ }

    // Check next round availability for multi-round tournaments
    let nextRoundInfo: { ready: boolean; currentRound: number; totalRounds: number } | null = null
    try {
      const { data: roundInfo } = await svc
        .from('rounds')
        .select('round_number')
        .eq('id', round_id)
        .single()
      const { data: tInfo } = await svc
        .from('tournaments')
        .select('id, total_rounds')
        .eq('id', tournament_id)
        .single()
      const currentRoundNum = (roundInfo as { round_number: number } | null)?.round_number ?? 1
      const totalRounds = (tInfo as { id: string; total_rounds: number } | null)?.total_rounds ?? 1

      if (totalRounds > 1) {
        // Check if ALL rounds of the current round_number are closed
        const { count: openCount } = await svc
          .from('rounds')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', tournament_id)
          .eq('round_number', currentRoundNum)
          .neq('status', 'closed')
          .neq('status', 'official')

        nextRoundInfo = {
          ready: (openCount ?? 0) === 0 && currentRoundNum < totalRounds,
          currentRound: currentRoundNum,
          totalRounds,
        }
      }
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true, nextRoundInfo })
  }

  // ── start_next_round ───────────────────────────────────
  if (action === 'start_next_round') {
    // Only organizer can start next round
    if (tournament.organizer_id !== user.id) {
      return NextResponse.json({ error: 'Solo el organizador puede iniciar la siguiente ronda' }, { status: 403 })
    }

    const { data: tInfo } = await svc
      .from('tournaments')
      .select('id, total_rounds')
      .eq('id', tournament_id)
      .single()
    const totalRounds = (tInfo as { id: string; total_rounds: number } | null)?.total_rounds ?? 1

    // Find current max round_number
    const { data: maxRoundData } = await svc
      .from('rounds')
      .select('round_number')
      .eq('tournament_id', tournament_id)
      .order('round_number', { ascending: false })
      .limit(1)
      .single()

    const currentRound = (maxRoundData as { round_number: number } | null)?.round_number ?? 1
    const nextRound = currentRound + 1

    if (nextRound > totalRounds) {
      return NextResponse.json({ error: 'Ya se completaron todas las rondas del torneo' }, { status: 409 })
    }

    // Check all current rounds are closed
    const { count: openCount } = await svc
      .from('rounds')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournament_id)
      .eq('round_number', currentRound)
      .neq('status', 'closed')
      .neq('status', 'official')

    if ((openCount ?? 0) > 0) {
      return NextResponse.json({ error: `Hay rondas de la ronda ${currentRound} sin finalizar` }, { status: 409 })
    }

    // Get all approved players
    const { data: playersData } = await svc
      .from('players')
      .select('id')
      .eq('tournament_id', tournament_id)

    if (!playersData || playersData.length === 0) {
      return NextResponse.json({ error: 'No hay jugadores en el torneo' }, { status: 400 })
    }

    // Create new rounds for all players
    const newRounds = playersData.map((p: { id: string }) => ({
      tournament_id,
      player_id: p.id,
      round_number: nextRound,
      status: 'in_progress',
    }))

    const { error: insertErr } = await svc.from('rounds').insert(newRounds)
    if (insertErr) {
      return NextResponse.json({ error: 'No se pudieron crear las rondas. Intenta de nuevo.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, roundNumber: nextRound, playersCount: playersData.length })
  }

  // ── cancel_tournament ────────────────────────────────────
  if (action === 'cancel_tournament') {
    if (tournament.organizer_id !== user.id) {
      return NextResponse.json({ error: 'Solo el organizador puede cancelar el torneo' }, { status: 403 })
    }
    if (tournament.status !== 'draft') {
      return NextResponse.json({ error: 'Solo se puede cancelar un torneo en borrador' }, { status: 409 })
    }

    // Cascade delete: scores → rounds → group_players → groups → players → categories → tournament
    const { data: rounds } = await svc.from('rounds').select('id').eq('tournament_id', tournament_id)
    if (rounds && rounds.length > 0) {
      const roundIds = rounds.map((r: { id: string }) => r.id)
      await svc.from('hole_scores').delete().in('round_id', roundIds)
      await svc.from('rounds').delete().eq('tournament_id', tournament_id)
    }

    const { data: grps } = await svc.from('tournament_groups').select('id').eq('tournament_id', tournament_id)
    if (grps && grps.length > 0) {
      const grpIds = grps.map((g: { id: string }) => g.id)
      await svc.from('tournament_group_players').delete().in('group_id', grpIds)
      await svc.from('tournament_groups').delete().eq('tournament_id', tournament_id)
    }

    await svc.from('players').delete().eq('tournament_id', tournament_id)
    await svc.from('categories').delete().eq('tournament_id', tournament_id)
    await svc.from('tournaments').delete().eq('id', tournament_id)

    return NextResponse.json({ success: true })
  }

  // ── withdraw_player ─────────────────────────────────────
  if (action === 'withdraw_player') {
    const { player_id } = body
    if (!player_id) return NextResponse.json({ error: 'player_id requerido' }, { status: 400 })

    // Only organizer or the player themselves can withdraw
    const { data: playerData } = await svc
      .from('players')
      .select('id, user_id')
      .eq('id', player_id)
      .eq('tournament_id', tournament_id)
      .single()

    if (!playerData) {
      return NextResponse.json({ error: 'Jugador no encontrado en este torneo' }, { status: 404 })
    }

    const isOrganizer = tournament.organizer_id === user.id
    const isSelf = playerData.user_id === user.id
    if (!isOrganizer && !isSelf) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    if (tournament.status === 'closed') {
      return NextResponse.json({ error: 'No se puede retirar jugadores de un torneo cerrado' }, { status: 409 })
    }

    // Delete hole_scores → rounds → group_players → player
    const { data: rounds } = await svc.from('rounds').select('id').eq('player_id', player_id)
    if (rounds && rounds.length > 0) {
      const roundIds = rounds.map((r: { id: string }) => r.id)
      await svc.from('hole_scores').delete().in('round_id', roundIds)
      await svc.from('rounds').delete().eq('player_id', player_id)
    }

    await svc.from('tournament_group_players').delete().eq('player_id', player_id)
    await svc.from('players').delete().eq('id', player_id)

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}
