import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  GROUPS_SELECT,
  listGroups,
  createGroup,
  deleteGroup,
  setGroupTeeTime,
  assignPlayerToGroup,
} from './groups'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as unknown as Parameters<typeof listGroups>[0]
beforeEach(() => { mockFrom.mockReset() })

describe('GROUPS_SELECT', () => {
  it('incluye el id de la membresía (key de lista en la UI)', () => {
    expect(GROUPS_SELECT).toContain('tournament_group_players(id, player_id)')
  })
})

describe('listGroups', () => {
  it('lista grupos del torneo ordenados por sort_order', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'g1', name: 'Grupo 1' }], error: null })
    mockFrom.mockReturnValue({ select, eq, order })
    const out = await listGroups(mockSupabase, 't1')
    expect(mockFrom).toHaveBeenCalledWith('tournament_groups')
    expect(select).toHaveBeenCalledWith(GROUPS_SELECT)
    expect(eq).toHaveBeenCalledWith('tournament_id', 't1')
    expect(order).toHaveBeenCalledWith('sort_order')
    expect(out).toEqual([{ id: 'g1', name: 'Grupo 1' }])
  })

  it('propaga el error del select', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order })
    await expect(listGroups(mockSupabase, 't1')).rejects.toThrow('boom')
  })
})

describe('createGroup', () => {
  it('inserta tournament_id, name, tee_time, sort_order (mapea camelCase → snake)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert })
    await createGroup(mockSupabase, { tournamentId: 't1', name: 'Grupo A', teeTime: '2026-01-01T08:00:00', sortOrder: 2 })
    expect(mockFrom).toHaveBeenCalledWith('tournament_groups')
    expect(insert).toHaveBeenCalledWith({
      tournament_id: 't1',
      name: 'Grupo A',
      tee_time: '2026-01-01T08:00:00',
      sort_order: 2,
    })
  })
})

describe('deleteGroup', () => {
  it('elimina por id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn().mockReturnValue({ eq })
    mockFrom.mockReturnValue({ delete: del })
    await deleteGroup(mockSupabase, 'g1')
    expect(mockFrom).toHaveBeenCalledWith('tournament_groups')
    expect(eq).toHaveBeenCalledWith('id', 'g1')
  })
})

describe('setGroupTeeTime', () => {
  it('actualiza tee_time del grupo por id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    mockFrom.mockReturnValue({ update })
    await setGroupTeeTime(mockSupabase, 'g1', '2026-01-01T09:10:00')
    expect(update).toHaveBeenCalledWith({ tee_time: '2026-01-01T09:10:00' })
    expect(eq).toHaveBeenCalledWith('id', 'g1')
  })
})

describe('assignPlayerToGroup', () => {
  it('con groupId: saca de TODO grupo previo (por player_id) y luego inserta en el elegido', async () => {
    const delEq = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn().mockReturnValue({ eq: delEq })
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ delete: del, insert })
    await assignPlayerToGroup(mockSupabase, 'p1', 'g1')
    expect(mockFrom).toHaveBeenCalledWith('tournament_group_players')
    expect(delEq).toHaveBeenCalledWith('player_id', 'p1')
    expect(insert).toHaveBeenCalledWith({ group_id: 'g1', player_id: 'p1' })
  })

  it('con groupId null: sólo saca del grupo, no inserta', async () => {
    const delEq = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn().mockReturnValue({ eq: delEq })
    const insert = vi.fn()
    mockFrom.mockReturnValue({ delete: del, insert })
    await assignPlayerToGroup(mockSupabase, 'p1', null)
    expect(delEq).toHaveBeenCalledWith('player_id', 'p1')
    expect(insert).not.toHaveBeenCalled()
  })

  it('un duplicado en el insert NO es error (jugador ya está donde se pidió)', async () => {
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const insert = vi.fn().mockResolvedValue({ error: { message: 'duplicate key value violates unique constraint' } })
    mockFrom.mockReturnValue({ delete: del, insert })
    await expect(assignPlayerToGroup(mockSupabase, 'p1', 'g1')).resolves.toBeUndefined()
  })

  it('un error real del insert SÍ se propaga', async () => {
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const insert = vi.fn().mockResolvedValue({ error: { message: 'permission denied' } })
    mockFrom.mockReturnValue({ delete: del, insert })
    await expect(assignPlayerToGroup(mockSupabase, 'p1', 'g1')).rejects.toThrow('permission denied')
  })
})
