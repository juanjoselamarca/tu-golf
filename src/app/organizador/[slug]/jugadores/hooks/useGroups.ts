import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import {
  listGroups,
  createGroup,
  deleteGroup,
  setGroupTeeTime,
  assignPlayerToGroup,
} from '@/lib/data/tournaments/groups'
import { isTeamFormat } from '@/golf/formats'
import { captureError } from '@/lib/error-tracking'
import type { Player, Tournament, TournamentGroup } from '../types'

interface UseGroupsArgs {
  tournament: Tournament & { codigo?: string | null }
  players: Player[]
}

/**
 * Estado + operaciones sobre los grupos del torneo (crear / borrar / generar
 * horarios de salida / asignar jugador a grupo). El acceso a datos vive en la
 * capa `src/lib/data/tournaments/groups.ts` (fuente única del SELECT + las
 * mutaciones). Este hook sólo orquesta el estado de la UI y mapea las filas a
 * la vista (resuelve nombres desde el prop `players` ya cargado). El effect que
 * dispara `fetchGroups` lo mantiene el componente (orquesta con
 * checkAllRoundsClosed).
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
    try {
      const rows = await listGroups(createClient(), tournament.id)
      const mapped: TournamentGroup[] = rows.map((g) => ({
        id: g.id,
        name: g.name,
        tee_time: g.tee_time,
        sort_order: g.sort_order || 0,
        ronda_libre_id: g.ronda_libre_id,
        players: (g.tournament_group_players ?? []).map((gp) => {
          const p = players.find((pl) => pl.id === gp.player_id)
          return { id: gp.id, player_id: gp.player_id, playerName: p?.profiles?.name || 'Jugador' }
        }),
      }))
      setGroups(mapped)
    } catch {
      setGroups([])
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) { showWarning('Nombre requerido', 'Escribe un nombre para el grupo.'); return }
    setCreatingGroup(true)
    // Convierte "HH:MM" a TIMESTAMPTZ usando la fecha del torneo.
    let teeTimeValue: string | null = null
    if (newGroupTeeTime) {
      const dateBase = tournament.date_start || new Date().toISOString().split('T')[0]
      teeTimeValue = `${dateBase}T${newGroupTeeTime}:00`
    }
    try {
      await createGroup(createClient(), {
        tournamentId: tournament.id,
        name: newGroupName.trim(),
        teeTime: teeTimeValue,
        sortOrder: groups.length,
      })
      showSuccess('Grupo creado', `"${newGroupName.trim()}" agregado.`)
      setNewGroupName('')
      setNewGroupTeeTime('')
      await fetchGroups()
    } catch (e) {
      showError('Error al crear grupo', e instanceof Error ? e.message : 'No se pudo crear el grupo.')
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await deleteGroup(createClient(), groupId)
    } catch (e) {
      showError('Error', e instanceof Error ? e.message : 'No se pudo borrar el grupo.')
    }
    await fetchGroups()
  }

  const handleGenerateTeeTimes = async () => {
    if (groups.length === 0) { showWarning('Sin grupos', 'Crea grupos primero antes de generar horarios.'); return }
    setGeneratingTees(true)
    const supabase = createClient()
    const dateBase = tournament.date_start || new Date().toISOString().split('T')[0]
    const [startH, startM] = teeStartTime.split(':').map(Number)
    try {
      for (let i = 0; i < groups.length; i++) {
        const totalMinutes = startH * 60 + startM + (i * teeInterval)
        const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0')
        const m = (totalMinutes % 60).toString().padStart(2, '0')
        await setGroupTeeTime(supabase, groups[i].id, `${dateBase}T${h}:${m}:00`)
      }
      await fetchGroups()
      // noun canónico (equipo/grupo) desde isTeamFormat — regla "un concepto, una fuente".
      const noun = isTeamFormat(tournament.format) ? 'equipo' : 'grupo'
      const plural = groups.length !== 1 ? 's' : ''
      showSuccess('Horarios generados', `${groups.length} ${noun}${plural} con horarios desde las ${teeStartTime} cada ${teeInterval} min.`)
    } catch (e) {
      showError('Error', e instanceof Error ? e.message : 'No se pudieron generar los horarios.')
    } finally {
      setGeneratingTees(false)
    }
  }

  const handleAssignPlayer = async (playerId: string, groupId: string) => {
    try {
      // groupId vacío ('') = quitar del grupo → null.
      await assignPlayerToGroup(createClient(), playerId, groupId || null)
    } catch (e) {
      // NO tragamos el error (histórico: un `catch {}` ciego dejó 4 fallos de campo
      // sin traza — reporte inbox e637b979). Lo mandamos a error_logs con contexto y
      // refrescamos la lista: la causa típica es un jugador stale (fila fantasma en la
      // UI cuya inscripción ya no existe → viola el FK a `players`). El refetch la
      // elimina en vez de dejar al organizador reintentando contra una fila muerta.
      const msg = e instanceof Error ? e.message : String(e)
      captureError(e, {
        context: 'useGroups.handleAssignPlayer',
        meta: { playerId, groupId: groupId || null, tournamentId: tournament.id, dbMessage: msg },
      })
      await fetchGroups()
      const isStale = /foreign key|violates|not present/i.test(msg)
      showError(
        'No se pudo asignar',
        isStale
          ? 'Ese jugador ya no está inscrito. Actualizamos la lista.'
          : 'No se pudo asignar al grupo. Intenta de nuevo.',
      )
      return
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
