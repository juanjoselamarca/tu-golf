import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import type { Player, Tournament, TournamentGroup } from '../types'

interface UseGroupsArgs {
  tournament: Tournament & { codigo?: string | null }
  players: Player[]
}

/**
 * Estado + operaciones sobre los grupos del torneo (crear / borrar / generar
 * horarios de salida / asignar jugador a grupo). Extraído verbatim de
 * JugadoresPanel — sin cambio de comportamiento. El effect que dispara
 * `fetchGroups` lo mantiene el componente (orquesta con checkAllRoundsClosed).
 *
 * Nota: usa el SELECT inline (incluye el id de la membresía, usado como key en
 * el JSX) y no la data-layer listGroups, que tiene otro shape. Migrar a la capa
 * de datos es una pasada separada y verificada (no en este refactor).
 */
export function useGroups({ tournament, players }: UseGroupsArgs) {
  const { showError, showWarning, showSuccess } = useToast()

  const [groups, setGroups] = useState<TournamentGroup[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupTeeTime, setNewGroupTeeTime] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [teeStartTime, setTeeStartTime] = useState('08:00')
  const [teeInterval, setTeeInterval] = useState(10)
  const [generatingTees, setGeneratingTees] = useState(false)

  const fetchGroups = async () => {
    const supabase = createClient()
    const { data: gData } = await supabase
      .from('tournament_groups')
      .select('id, name, tee_time, sort_order, ronda_libre_id, tournament_group_players(id, player_id)')
      .eq('tournament_id', tournament.id)
      .order('sort_order')

    if (!gData) { setGroups([]); return }

    const mapped: TournamentGroup[] = gData.map((g: Record<string, unknown>) => {
      const gPlayers = (g.tournament_group_players as Array<{ id: string; player_id: string }>) || []
      return {
        id: g.id as string,
        name: g.name as string,
        tee_time: g.tee_time as string | null,
        sort_order: (g.sort_order as number) || 0,
        ronda_libre_id: g.ronda_libre_id as string | null,
        players: gPlayers.map((gp) => {
          const p = players.find((pl) => pl.id === gp.player_id)
          return { id: gp.id, player_id: gp.player_id, playerName: p?.profiles?.name || 'Jugador' }
        }),
      }
    })
    setGroups(mapped)
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) { showWarning('Nombre requerido', 'Escribe un nombre para el grupo.'); return }
    setCreatingGroup(true)
    const supabase = createClient()
    // Convert time string "HH:MM" to full TIMESTAMPTZ using tournament date
    let teeTimeValue: string | null = null
    if (newGroupTeeTime) {
      const dateBase = tournament.date_start || new Date().toISOString().split('T')[0]
      teeTimeValue = `${dateBase}T${newGroupTeeTime}:00`
    }

    const { error } = await supabase.from('tournament_groups').insert({
      tournament_id: tournament.id,
      name: newGroupName.trim(),
      tee_time: teeTimeValue,
      sort_order: groups.length,
    })
    if (error) {
      showError('Error al crear grupo', error.message)
    } else {
      showSuccess('Grupo creado', `"${newGroupName.trim()}" agregado.`)
      setNewGroupName('')
      setNewGroupTeeTime('')
      await fetchGroups()
    }
    setCreatingGroup(false)
  }

  const handleDeleteGroup = async (groupId: string) => {
    const supabase = createClient()
    await supabase.from('tournament_groups').delete().eq('id', groupId)
    await fetchGroups()
  }

  const handleGenerateTeeTimes = async () => {
    if (groups.length === 0) { showWarning('Sin grupos', 'Crea grupos primero antes de generar horarios.'); return }
    setGeneratingTees(true)
    const supabase = createClient()
    const dateBase = tournament.date_start || new Date().toISOString().split('T')[0]
    const [startH, startM] = teeStartTime.split(':').map(Number)

    for (let i = 0; i < groups.length; i++) {
      const totalMinutes = startH * 60 + startM + (i * teeInterval)
      const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0')
      const m = (totalMinutes % 60).toString().padStart(2, '0')
      const teeTimeValue = `${dateBase}T${h}:${m}:00`

      await supabase
        .from('tournament_groups')
        .update({ tee_time: teeTimeValue })
        .eq('id', groups[i].id)
    }

    await fetchGroups()
    setGeneratingTees(false)
    showSuccess('Horarios generados', `${groups.length} grupos con horarios desde las ${teeStartTime} cada ${teeInterval} min.`)
  }

  const handleAssignPlayer = async (playerId: string, groupId: string) => {
    const supabase = createClient()
    // Remove from any current group first
    await supabase.from('tournament_group_players').delete().eq('player_id', playerId)
    if (groupId) {
      const { error } = await supabase.from('tournament_group_players').insert({
        group_id: groupId,
        player_id: playerId,
      })
      if (error && !error.message.includes('duplicate')) {
        showError('Error', 'No se pudo asignar al grupo.')
        return
      }
    }
    await fetchGroups()
  }

  const getPlayerGroupId = (playerId: string): string => {
    for (const g of groups) {
      if (g.players.some((gp) => gp.player_id === playerId)) return g.id
    }
    return ''
  }

  return {
    groups,
    newGroupName, setNewGroupName,
    newGroupTeeTime, setNewGroupTeeTime,
    creatingGroup,
    teeStartTime, setTeeStartTime,
    teeInterval, setTeeInterval,
    generatingTees,
    fetchGroups, handleCreateGroup, handleDeleteGroup,
    handleGenerateTeeTimes, handleAssignPlayer, getPlayerGroupId,
  }
}
