import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
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
        'id, user_id, player_name, handicap_at_registration, status, profiles(name, indice), categories(name)'
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
      void captureError(rErr, { context: 'usePlayers.inscribirPlayer.crearRonda', level: 'warning' })
    }

    const playerName = selectedProfile.name
    onInscribed()
    await fetchPlayers()
    setLoading(false)
    showSuccess('¡Jugador inscrito!', `${playerName} fue agregado al torneo correctamente.`)
  }

  /**
   * Inscribe un INVITADO sin cuenta: una fila en `players` con `user_id = null`
   * y `player_name`. Espeja `inscribirPlayer` pero el índice lo tipea el
   * organizador y se guarda en `handicap_at_registration` (resolvePlayerHandicap
   * cae a esa columna cuando no hay perfil → el índice viaja a
   * ronda_libre_jugadores.handicap al iniciar y el leaderboard calcula el neto).
   */
  const inscribirGuest = async (
    nombre: string,
    handicapIndex: number | null,
    selectedCat: string,
    onInscribed: () => void,
  ) => {
    const name = nombre.trim()
    if (!name) { showWarning('Nombre requerido', 'Escribe el nombre del invitado.'); return }

    setLoading(true)
    const supabase = createClient()
    const catId = selectedCat || categories[0]?.id || null

    const { data: player, error: pErr } = await supabase
      .from('players')
      .insert({
        tournament_id:            tournament.id,
        user_id:                  null,
        // CHECK players_identity_check (migración 029): una fila sin user_id DEBE
        // llevar pending_user_id (o el insert se rechaza con 23514). El invitado
        // queda con una identidad placeholder; si más adelante reclama su cuenta,
        // se linkea por acá. UNIQUE(tournament_id, pending_user_id) evita choques.
        pending_user_id:          crypto.randomUUID(),
        player_name:              name,
        category_id:              catId,
        // Índice tal cual lo ingresó el organizador (no course handicap): el
        // leaderboard lo convierte a course handicap con el tee del jugador.
        handicap_at_registration: handicapIndex,
        status:                   'approved',
      })
      .select()
      .single()

    if (pErr || !player) {
      const msg = pErr?.message?.toLowerCase() || ''
      if (msg.includes('permission') || msg.includes('policy') || pErr?.code === '42501') {
        showError('Sin permisos', 'No tienes permisos para inscribir. Verifica que eres el organizador.')
      } else {
        showError('Error al inscribir', `No pudimos inscribir al invitado: ${pErr?.message || 'error desconocido'}`)
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
      void captureError(rErr, { context: 'usePlayers.inscribirGuest.crearRonda', level: 'warning' })
    }

    onInscribed()
    await fetchPlayers()
    setLoading(false)
    showSuccess('¡Invitado inscrito!', `${name} fue agregado al torneo.`)
  }

  const withdrawPlayer = async (playerId: string) => {
    const _pl = players.find(p => p.id === playerId)
    const playerName = _pl?.profiles?.name ?? _pl?.player_name ?? 'este jugador'

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
    const _pl = players.find(p => p.id === playerId)
    const playerName = _pl?.profiles?.name ?? _pl?.player_name ?? 'este jugador'
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
    fetchPlayers, inscribirPlayer, inscribirGuest, withdrawPlayer, disqualifyPlayer,
  }
}
