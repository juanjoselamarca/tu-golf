import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listPlayers, setPlayerTeeId,
  withdrawPlayer, disqualifyPlayer,
} from './players'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as unknown as Parameters<typeof listPlayers>[0]

beforeEach(() => { mockFrom.mockReset() })

describe('listPlayers', () => {
  it('selecciona players con profiles, categories y tee_id, filtra por tournament_id', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: [{ id: 'p1', tee_id: null }], error: null })
    mockFrom.mockReturnValue({ select, eq })
    const out = await listPlayers(mockSupabase, 'torneo-1')
    expect(mockFrom).toHaveBeenCalledWith('players')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('tee_id'))
    expect(eq).toHaveBeenCalledWith('tournament_id', 'torneo-1')
    expect(out).toEqual([{ id: 'p1', tee_id: null }])
  })

  it('propaga error de Supabase', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'rls denied' } })
    mockFrom.mockReturnValue({ select, eq })
    await expect(listPlayers(mockSupabase, 't1')).rejects.toThrow('rls denied')
  })
})

describe('setPlayerTeeId', () => {
  it('llama update con tee_id string', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await setPlayerTeeId(mockSupabase, 'p1', 't-azul')
    expect(update).toHaveBeenCalledWith({ tee_id: 't-azul' })
    expect(eq).toHaveBeenCalledWith('id', 'p1')
  })

  it('acepta null para limpiar la asignación', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await setPlayerTeeId(mockSupabase, 'p1', null)
    expect(update).toHaveBeenCalledWith({ tee_id: null })
  })

  it('propaga error de Supabase', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockFrom.mockReturnValue({ update, eq })
    await expect(setPlayerTeeId(mockSupabase, 'p1', 't-azul')).rejects.toThrow('boom')
  })
})

describe('withdrawPlayer', () => {
  it('marca status="withdrawn"', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await withdrawPlayer(mockSupabase, 'p1')
    expect(update).toHaveBeenCalledWith({ status: 'withdrawn' })
  })
})

describe('disqualifyPlayer', () => {
  it('marca status="disqualified"', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await disqualifyPlayer(mockSupabase, 'p1')
    expect(update).toHaveBeenCalledWith({ status: 'disqualified' })
  })
})
