import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTournament, closeTournament, cancelTournament, openTournament, revertToDraft } from './lifecycle'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as unknown as Parameters<typeof startTournament>[0]
beforeEach(() => { mockFrom.mockReset() })

describe('startTournament', () => {
  it('marca tournaments.status = in_progress', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await startTournament(mockSupabase, 't1')
    expect(mockFrom).toHaveBeenCalledWith('tournaments')
    expect(update).toHaveBeenCalledWith({ status: 'in_progress' })
    expect(eq).toHaveBeenCalledWith('id', 't1')
  })
})

describe('closeTournament', () => {
  it('marca tournaments.status = closed', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await closeTournament(mockSupabase, 't1')
    expect(update).toHaveBeenCalledWith({ status: 'closed' })
  })
})

describe('openTournament', () => {
  it('marca tournaments.status = open (abre inscripciones)', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await openTournament(mockSupabase, 't1')
    expect(mockFrom).toHaveBeenCalledWith('tournaments')
    expect(update).toHaveBeenCalledWith({ status: 'open' })
    expect(eq).toHaveBeenCalledWith('id', 't1')
  })

  it('propaga error', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } })
    mockFrom.mockReturnValue({ update, eq })
    await expect(openTournament(mockSupabase, 't1')).rejects.toThrow('denied')
  })
})

describe('revertToDraft', () => {
  it('marca tournaments.status = draft (cierra inscripciones sin perder jugadores)', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await revertToDraft(mockSupabase, 't1')
    expect(update).toHaveBeenCalledWith({ status: 'draft' })
    expect(eq).toHaveBeenCalledWith('id', 't1')
  })
})

describe('cancelTournament', () => {
  it('marca tournaments.status = cancelled', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await cancelTournament(mockSupabase, 't1')
    expect(update).toHaveBeenCalledWith({ status: 'cancelled' })
  })

  it('propaga error', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } })
    mockFrom.mockReturnValue({ update, eq })
    await expect(cancelTournament(mockSupabase, 't1')).rejects.toThrow('denied')
  })
})
