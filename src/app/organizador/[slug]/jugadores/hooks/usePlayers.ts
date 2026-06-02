import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import type { Category, Player, Tournament } from '../types'
import type { Profile } from './useProfileSearch'

function calcCourseHandicap(indice: number, slope: number, rating: number, par: number) {
  return Math.round(indice * (slope / 113) + (rating - par))
}

interface UsePlayersArgs {
  tournament: Tournament & { codigo?: string | null }
  categories: Category[]
  initialPlayers: Player[]
  tournamentStatus: string
}

/**
 * Estado + operaciones sobre los jugadores del torneo (inscribir / retirar /
 * descalificar). Extraído verbatim de JugadoresPanel — sin cambio de
 * comportamiento. `inscribirPlayer` recibe el perfil/categoría seleccionados
 * desde el componente (que los obtiene de useProfileSearch) para mantener el
 * orquestador delgado.
 */
export function usePlayers({ tournament, categories, initialPlayers, tournamentStatus }: UsePlayersArgs) {
  const { showError, showWarning, showSuccess } = useToast()
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [loading, setLoading] = useState(false)

  const fetchPlayers = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('players')
      .select(
        'id, user_id, handicap_at_registration, status, profiles(name, email, indice), categories(name)'
      )
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: true })
    setPlayers((data as unknown as Player[]) || [])
  }

  const inscribirPlayer = async (
    selectedProfile: Profile | null,
    selectedCat: string,
    onInscribed: () => void,
  ) => {
    if (!selectedProfile) { showWarning('Jugador requerido', 'Busca y selecciona un jugador primero.'); return }

    setLoading(true)
    const supabase = createClient()
    const course = tournament.courses

    const courseHandicap =
      selectedProfile.indice != null && course
        ? calcCourseHandicap(
            selectedProfile.indice,
            course.slope_rating,
            course.course_rating,
            course.par_total
          )
        : null

    // Auto-assign default category if none selected
    const catId = selectedCat || categories[0]?.id || null

    const { data: player, error: pErr } = await supabase
      .from('players')
      .insert({
        tournament_id:           tournament.id,
        user_id:                 selectedProfile.id,
        category_id:             catId,
        handicap_at_registration: courseHandicap,
        status:                  'approved',
      })
      .select()
      .single()

    if (pErr || !player) {
      const msg = pErr?.message?.toLowerCase() || ''
      if (msg.includes('duplicate') || msg.includes('unique')) {
        showError('Jugador duplicado', 'Este jugador ya está inscrito en el torneo.')
      } else if (msg.includes('permission') || msg.includes('policy') || pErr?.code === '42501') {
        showError('Sin permisos', 'No tienes permisos para inscribir jugadores. Verifica que eres el organizador.')
      } else {
        showError('Error al inscribir', `No pudimos inscribir al jugador: ${pErr?.message || 'error desconocido'}`)
      }
      setLoading(false)
      return
    }

    const { error: rErr } = await supabase.from('rounds').insert({
      tournament_id: tournament.id,
      player_id:     player.id,
      status:        'in_progress',
    })
    if (rErr) {
      console.warn('[rounds] Error al crear ronda:', rErr.message)
    }

    const playerName = selectedProfile.name
    onInscribed()
    await fetchPlayers()
    setLoading(false)
    showSuccess('¡Jugador inscrito!', `${playerName} fue agregado al torneo correctamente.`)
  }

  const withdrawPlayer = async (playerId: string) => {
    const playerName = players.find(p => p.id === playerId)?.profiles?.name || 'este jugador'

    if (tournamentStatus === 'in_progress') {
      if (!window.confirm(`Retirar a ${playerName} (WD)? Sus scores se conservan en el historial.`)) return
      // Marca status='withdrawn' — preserva scores
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'withdraw_player', tournament_id: tournament.id, player_id: playerId }),
      })
      if (!res.ok) {
        const data = await res.json()
        showError('Error', data.error || 'No se pudo retirar al jugador.')
        return
      }
      showSuccess('Jugador retirado (WD)', `${playerName} fue marcado como retirado.`)
    } else {
      // Torneo aún no empezó: se puede eliminar la inscripción sin penalizar historial
      const supabase = createClient()
      await supabase.from('players').delete().eq('id', playerId)
    }
    await fetchPlayers()
  }

  const disqualifyPlayer = async (playerId: string) => {
    const playerName = players.find(p => p.id === playerId)?.profiles?.name || 'este jugador'
    const reason = window.prompt(`Descalificar a ${playerName} (DQ). Motivo (opcional):`)
    if (reason === null) return // canceló el prompt
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'disqualify_player',
        tournament_id: tournament.id,
        player_id: playerId,
        reason: reason.trim() || null,
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      showError('Error', data.error || 'No se pudo descalificar al jugador.')
      return
    }
    showSuccess('Jugador descalificado (DQ)', `${playerName} fue marcado como descalificado.`)
    await fetchPlayers()
  }

  return {
    players, setPlayers, loading,
    fetchPlayers, inscribirPlayer, withdrawPlayer, disqualifyPlayer,
  }
}
