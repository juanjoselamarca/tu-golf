import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listGroups, createGroup, deleteGroup,
  assignPlayerToGroup, removePlayerFromGroup,
} from './groups'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as unknown as Parameters<typeof listGroups>[0]
beforeEach(() => { mockFrom.mockReset() })

describe('listGroups', () => {
  it('lista grupos del torneo ordenados por sort_order', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'g1', name: 'Grupo 1' }], error: null })
    mockFrom.mockReturnValue({ select, eq, order })
    const out = await listGroups(mockSupabase, 't1')
    expect(mockFrom).toHaveBeenCalledWith('tournament_groups')
    expect(eq).toHaveBeenCalledWith('tournament_id', 't1')
    expect(order).toHaveBeenCalledWith('sort_order')
    expect(out).toEqual([{ id: 'g1', name: 'Grupo 1' }])
  })
})

describe('createGroup', () => {
  it('inserta con tournament_id, name, tee_time, sort_order y devuelve id', async () => {
    const insert = vi.fn().mockReturnThis()
    const select = vi.fn().mockReturnThis()
    const single = vi.fn().mockResolvedValue({ data: { id: 'g-new' }, error: null })
    mockFrom.mockReturnValue({ insert, select, single })
    const out = await createGroup(mockSupabase, { tournament_id: 't1', name: 'Grupo A', tee_time: '08:00', sort_order: 0 })
    expect(insert).toHaveBeenCalledWith([{ tournament_id: 't1', name: 'Grupo A', tee_time: '08:00', sort_order: 0 }])
    expect(out).toEqual({ id: 'g-new' })
  })
})

describe('deleteGroup', () => {
  it('elimina por id', async () => {
    const del = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ delete: del, eq })
    await deleteGroup(mockSupabase, 'g1')
    expect(eq).toHaveBeenCalledWith('id', 'g1')
  })
})

describe('assignPlayerToGroup', () => {
  it('upsert en tournament_group_players con onConflict group_id+player_id', async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ upsert })
    await assignPlayerToGroup(mockSupabase, 'g1', 'p1')
    expect(mockFrom).toHaveBeenCalledWith('tournament_group_players')
    expect(upsert).toHaveBeenCalledWith([{ group_id: 'g1', player_id: 'p1' }], { onConflict: 'group_id,player_id' })
  })
})

describe('removePlayerFromGroup', () => {
  it('delete por (group_id, player_id)', async () => {
    const eq2 = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const del = vi.fn().mockReturnValue({ eq: eq1 })
    mockFrom.mockReturnValue({ delete: del })
    await removePlayerFromGroup(mockSupabase, 'g1', 'p1')
    expect(mockFrom).toHaveBeenCalledWith('tournament_group_players')
    expect(eq1).toHaveBeenCalledWith('group_id', 'g1')
    expect(eq2).toHaveBeenCalledWith('player_id', 'p1')
  })
})
