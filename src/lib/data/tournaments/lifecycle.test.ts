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
  // Builder chainable + thenable: cada método devuelve el builder; `await` resuelve
  // al `result` de esa tabla. Permite auditar chains multi-tabla (rounds / groups /
  // rondas_libres / tournaments) que congela el cierre.
  function makeBuilder(result: { data?: unknown; error: unknown }) {
    const b: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {}
    for (const m of ['update', 'eq', 'neq', 'select', 'not', 'in']) b[m] = vi.fn(() => b)
    ;(b as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result)
    return b
  }

  it('CONGELA al cerrar: rounds→closed, rondas_libres materializadas→finalizada, tournaments→closed', async () => {
    const rounds = makeBuilder({ error: null })
    const groups = makeBuilder({ data: [{ ronda_libre_id: 'r1' }, { ronda_libre_id: 'r2' }, { ronda_libre_id: null }], error: null })
    const rondas = makeBuilder({ error: null })
    const tournaments = makeBuilder({ error: null })
    mockFrom.mockImplementation((table: string) => ({
      rounds, tournament_groups: groups, rondas_libres: rondas, tournaments,
    } as Record<string, unknown>)[table])

    await closeTournament(mockSupabase, 't1')

    // Path individual: rondas del torneo cerradas.
    expect(rounds.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }))
    // Path de equipos: rondas_libres materializadas (r1, r2 — no el null) finalizadas.
    expect(rondas.update).toHaveBeenCalledWith({ estado: 'finalizada' })
    expect(rondas.in).toHaveBeenCalledWith('id', ['r1', 'r2'])
    // El torneo queda 'closed'.
    expect(tournaments.update).toHaveBeenCalledWith({ status: 'closed' })
  })

  it('no toca rondas_libres si el torneo no tiene grupos materializados', async () => {
    const rounds = makeBuilder({ error: null })
    const groups = makeBuilder({ data: [], error: null })
    const rondas = makeBuilder({ error: null })
    const tournaments = makeBuilder({ error: null })
    mockFrom.mockImplementation((table: string) => ({
      rounds, tournament_groups: groups, rondas_libres: rondas, tournaments,
    } as Record<string, unknown>)[table])

    await closeTournament(mockSupabase, 't1')
    expect(rondas.update).not.toHaveBeenCalled()
    expect(tournaments.update).toHaveBeenCalledWith({ status: 'closed' })
  })

  it('propaga error si falla el freeze de rondas de equipo', async () => {
    const rounds = makeBuilder({ error: null })
    const groups = makeBuilder({ data: [{ ronda_libre_id: 'r1' }], error: null })
    const rondas = makeBuilder({ error: { message: 'rls denied' } })
    const tournaments = makeBuilder({ error: null })
    mockFrom.mockImplementation((table: string) => ({
      rounds, tournament_groups: groups, rondas_libres: rondas, tournaments,
    } as Record<string, unknown>)[table])
    await expect(closeTournament(mockSupabase, 't1')).rejects.toThrow('rls denied')
    // Si el freeze de equipos falla, el torneo NO queda 'closed' (reintentable).
    expect(tournaments.update).not.toHaveBeenCalled()
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
