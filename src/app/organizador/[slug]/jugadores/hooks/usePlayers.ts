import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import type { Category, Player, Tournament } from '../types'
import type { Profile } from './useProfileSearch'

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

  /**
   * Mapea la respuesta de error del endpoint de inscripción a un toast. El cupo
   * lleno (`tournament_full`) se muestra como warning con la acción de ampliar,
   * no como error rojo — es un límite esperado, no una falla.
   */
  const showEnrollError = (reason: string | undefined, message: string | undefined, quien: string) => {
    if (reason === 'tournament_full') {
      showWarning('Cupo lleno', message || 'El torneo alcanzó su cupo máximo. Amplía el cupo para agregar más.')
    } else if (reason === 'already_registered') {
      showError(`${quien} duplicado`, message || 'Ya está inscrito en el torneo.')
    } else if (reason === 'forbidden') {
      showError('Sin permisos', message || 'No tienes permisos para inscribir. Verifica que eres el organizador.')
    } else {
      showError('Error al inscribir', message || `No pudimos inscribir al ${quien.toLowerCase()}.`)
    }
  }

  const inscribirPlayer = async (
    selectedProfile: Profile | null,
    selectedCat: string,
    onInscribed: () => void,
  ) => {
    if (!selectedProfile) { showWarning('Jugador requerido', 'Busca y selecciona un jugador primero.'); return }

    setLoading(true)
    // Auto-assign default category if none selected
    const catId = selectedCat || categories[0]?.id || null

    try {
      const res = await fetch(`/api/torneos/${tournament.slug}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'registered', userId: selectedProfile.id, categoryId: catId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showEnrollError(data?.error, data?.message, 'Jugador')
        return
      }
      onInscribed()
      await fetchPlayers()
      showSuccess('¡Jugador inscrito!', `${selectedProfile.name} fue agregado al torneo correctamente.`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Inscribe un INVITADO sin cuenta: una fila en `players` con `user_id = null`
   * y `player_name`. El índice lo tipea el organizador y se guarda en
   * `handicap_at_registration` (resolvePlayerHandicap cae a esa columna cuando no
   * hay perfil → el índice viaja a ronda_libre_jugadores.handicap y el leaderboard
   * calcula el neto). Server-side vía `enrollPlayer` (valida cupo).
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
    const catId = selectedCat || categories[0]?.id || null

    try {
      const res = await fetch(`/api/torneos/${tournament.slug}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'guest', guestName: name, handicapIndex, categoryId: catId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showEnrollError(data?.error, data?.message, 'Invitado')
        return
      }
      onInscribed()
      await fetchPlayers()
      showSuccess('¡Invitado inscrito!', `${name} fue agregado al torneo.`)
    } finally {
      setLoading(false)
    }
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
