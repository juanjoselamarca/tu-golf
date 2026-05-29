// hooks/useGroups.ts
//
// Estado + handlers para tournament_groups + tournament_group_players.

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import {
  listGroups,
  createGroup,
  deleteGroup,
  assignPlayerToGroup,
  removePlayerFromGroup,
  type GroupRow,
  type CreateGroupInput,
} from '@/lib/data/tournaments/groups'
import { captureError } from '@/lib/error-tracking'

export function useGroups({ tournamentId }: { tournamentId: string }) {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const supabase = createClient()

  const refresh = useCallback(async () => {
    try {
      const rows = await listGroups(supabase, tournamentId)
      setGroups(rows)
    } catch (err) {
      void captureError(err, {
        context: 'useGroups.refresh',
        meta: { tournamentId },
      })
    }
  }, [supabase, tournamentId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (input: Omit<CreateGroupInput, 'tournament_id'>) => {
      await createGroup(supabase, { ...input, tournament_id: tournamentId })
      await refresh()
    },
    [supabase, tournamentId, refresh]
  )

  const remove = useCallback(
    async (groupId: string) => {
      await deleteGroup(supabase, groupId)
      await refresh()
    },
    [supabase, refresh]
  )

  const assignPlayer = useCallback(
    async (groupId: string, playerId: string) => {
      await assignPlayerToGroup(supabase, groupId, playerId)
      await refresh()
    },
    [supabase, refresh]
  )

  const unassignPlayer = useCallback(
    async (groupId: string, playerId: string) => {
      await removePlayerFromGroup(supabase, groupId, playerId)
      await refresh()
    },
    [supabase, refresh]
  )

  return { groups, create, remove, assignPlayer, unassignPlayer, refresh }
}
