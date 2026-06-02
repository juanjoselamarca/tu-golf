import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import type { Player, Tournament, TournamentGroup } from '../types'

interface UseTournamentLifecycleArgs {
  tournament: Tournament & { codigo?: string | null }
  players: Player[]
  groups: TournamentGroup[]
  setTournamentStatus: (status: string) => void
}

/**
 * Ciclo de vida del torneo (iniciar / cancelar / cerrar) + chequeo de rondas
 * cerradas. Extraído verbatim de JugadoresPanel — sin cambio de comportamiento.
 *
 * `tournamentStatus` se queda en el componente (lo consume usePlayers) y acá
 * sólo recibimos `setTournamentStatus` para evitar dependencia circular
 * (lifecycle necesita players+groups; usePlayers necesita tournamentStatus).
 */
export function useTournamentLifecycle({
  tournament,
  players,
  groups,
  setTournamentStatus,
}: UseTournamentLifecycleArgs) {
  const router = useRouter()
  const { showError, showSuccess } = useToast()

  const [starting, setStarting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [allRoundsClosed, setAllRoundsClosed] = useState(false)

  // Check if all rounds in the latest round_number are closed
  const checkAllRoundsClosed = async () => {
    const supabase = createClient()
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id, status, round_number')
      .eq('tournament_id', tournament.id)
    if (!rounds || rounds.length === 0) { setAllRoundsClosed(false); return }
    const maxRound = Math.max(...rounds.map((r: { round_number: number }) => r.round_number || 1))
    const lastRoundEntries = rounds.filter((r: { round_number: number }) => (r.round_number || 1) === maxRound)
    setAllRoundsClosed(lastRoundEntries.length > 0 && lastRoundEntries.every((r: { status: string }) => r.status === 'closed'))
  }

  const handleCancelTournament = async () => {
    if (!window.confirm('Cancelar y eliminar este torneo? Esta acción no se puede deshacer.')) return
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel_tournament', tournament_id: tournament.id }),
    })
    if (!res.ok) {
      const data = await res.json()
      showError('Error', data.error || 'No se pudo cancelar el torneo.')
      return
    }
    showSuccess('Torneo eliminado', 'El torneo fue eliminado.')
    router.push('/dashboard')
  }

  const handleStartTournament = async () => {
    if (players.length < 1) return

    // Validación previa: todos los jugadores aprobados deben estar en algún
    // grupo. Si no, no se les crea ronda_libre_jugador y el leaderboard rompe
    // (rounds existe pero no hay scoring path). Mostramos warning con la lista.
    const groupedIds = new Set<string>()
    for (const g of groups) {
      for (const gp of g.players) groupedIds.add(gp.player_id)
    }
    const ungrouped = players.filter(
      (p) => p.status === 'approved' && !groupedIds.has(p.id),
    )
    if (ungrouped.length > 0) {
      const names = ungrouped
        .map((p) => p.profiles?.name || 'Jugador')
        .slice(0, 5)
        .join(', ')
      const extra = ungrouped.length > 5 ? ` y ${ungrouped.length - 5} más` : ''
      showError(
        'Jugadores sin grupo',
        `Asigná a un grupo antes de iniciar: ${names}${extra}.`,
      )
      return
    }

    if (!window.confirm(`Iniciar torneo con ${players.length} jugador${players.length !== 1 ? 'es' : ''}? Se crearán las rondas para todos.`)) return
    setStarting(true)
    const supabase = createClient()

    // 1. Update tournament status
    const { error: statusErr } = await supabase
      .from('tournaments')
      .update({ status: 'in_progress' })
      .eq('id', tournament.id)

    if (statusErr) {
      showError('Error', 'No se pudo iniciar el torneo.')
      setStarting(false)
      return
    }

    // 2. Create round_number=1 for all approved players who don't already have one
    const { data: existingRounds } = await supabase
      .from('rounds')
      .select('player_id')
      .eq('tournament_id', tournament.id)
      .eq('round_number', 1)

    const existingPlayerIds = new Set((existingRounds || []).map((r: { player_id: string }) => r.player_id))
    const approvedPlayers = players.filter((p) => p.status === 'approved' && !existingPlayerIds.has(p.id))

    if (approvedPlayers.length > 0) {
      const roundInserts = approvedPlayers.map((p) => ({
        tournament_id: tournament.id,
        player_id: p.id,
        round_number: 1,
        status: 'in_progress',
      }))
      const { error: roundErr } = await supabase.from('rounds').insert(roundInserts)
      if (roundErr) {
        console.warn('[rounds] Error al crear rondas:', roundErr.message)
      }
    }

    // 3. Create rondas_libres for groups that don't have one yet
    const groupsWithoutRonda = groups.filter((g) => !g.ronda_libre_id && g.players.length > 0)
    for (const group of groupsWithoutRonda) {
      const codigo = 'T' + Math.random().toString(36).substring(2, 8).toUpperCase()
      const courseName = (tournament.courses as unknown as { nombre: string })?.nombre || tournament.course_name || 'Cancha'

      const { data: ronda, error: rondaErr } = await supabase
        .from('rondas_libres')
        .insert({
          codigo,
          creador_id: (await supabase.auth.getUser()).data.user?.id,
          course_id: tournament.course_id || null,
          course_name: courseName,
          tees: tournament.tees || 'blanco',
          holes: tournament.hole_count || 18,
          fecha: tournament.date_start || new Date().toISOString().split('T')[0],
          estado: 'en_curso',
        })
        .select('id')
        .single()

      if (rondaErr || !ronda) {
        console.warn('[rondas_libres] Error para grupo', group.name, rondaErr?.message)
        continue
      }

      // Link group to ronda_libre
      await supabase.from('tournament_groups').update({ ronda_libre_id: ronda.id }).eq('id', group.id)

      // Create ronda_libre_jugadores for each player in the group
      for (const gp of group.players) {
        const player = players.find((p) => p.id === gp.player_id)
        if (!player) continue

        const { data: jugador } = await supabase
          .from('ronda_libre_jugadores')
          .insert({
            ronda_id: ronda.id,
            nombre: player.profiles?.name || 'Jugador',
            user_id: player.user_id || null,
            scores: {},
          })
          .select('id')
          .single()

        if (jugador) {
          await supabase
            .from('tournament_group_players')
            .update({ jugador_ronda_id: jugador.id })
            .eq('group_id', group.id)
            .eq('player_id', gp.player_id)
        }
      }
    }

    setTournamentStatus('in_progress')
    showSuccess('Torneo iniciado', 'Las rondas fueron creadas. Los jugadores ya pueden cargar scores.')
    setStarting(false)
    router.push(`/organizador/${tournament.slug}/scoring`)
  }

  const handleCloseTournament = async () => {
    if (!window.confirm('Cerrar el torneo? Los resultados seran definitivos.')) return
    setClosing(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('tournaments')
      .update({ status: 'closed' })
      .eq('id', tournament.id)

    if (error) {
      showError('Error', 'No se pudo cerrar el torneo.')
    } else {
      setTournamentStatus('closed')
      showSuccess('Torneo cerrado', 'Los resultados son definitivos.')
    }
    setClosing(false)
  }

  return {
    starting, closing, allRoundsClosed,
    checkAllRoundsClosed, handleStartTournament,
    handleCancelTournament, handleCloseTournament,
  }
}
