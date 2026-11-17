import { describe, it, expect, vi, beforeEach } from 'vitest'
import { closeTournament, cancelTournament, openTournament, reopenTournament, revertToDraft } from './lifecycle'
import { after } from 'next/server'
import { start } from 'workflow/api'
import { guardarRondasDelCierre, historialDelCierre } from './historial-del-cierre'
import { captureError } from '@/lib/error-tracking'
import { pushRoundUpdate } from '@/lib/push/round-update'

vi.mock('workflow/api', () => ({ start: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('./historial-del-cierre', () => ({ historialDelCierre: vi.fn(), guardarRondasDelCierre: vi.fn(async () => undefined) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => undefined) }))
vi.mock('@/lib/push/round-update', () => ({ pushRoundUpdate: vi.fn(async () => undefined) }))

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as unknown as Parameters<typeof closeTournament>[0]
beforeEach(() => {
  mockFrom.mockReset()
  vi.mocked(start).mockReset().mockResolvedValue({ runId: 'wrun_1' } as Awaited<ReturnType<typeof start>>)
  vi.mocked(guardarRondasDelCierre).mockClear()
  vi.mocked(captureError).mockClear()
  vi.mocked(after).mockClear()
  vi.mocked(pushRoundUpdate).mockClear()
})

// Builder chainable + thenable: cada método devuelve el builder; `await` resuelve
// al `result` de esa tabla. Permite auditar chains multi-tabla (rounds / groups /
// rondas_libres / tournaments) que congela el cierre.
function makeBuilder(result: { data?: unknown; error: unknown }) {
  const b: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {}
  for (const m of ['update', 'eq', 'neq', 'select', 'not', 'in', 'is']) b[m] = vi.fn(() => b)
  ;(b as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result)
  return b
}

describe('closeTournament', () => {
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
    expect(start).not.toHaveBeenCalled()
  })

  describe('aviso "Resultado final" a los seguidores de las rondas de equipo', () => {
    const conEquipos = () => {
      const tablas = {
        rounds: makeBuilder({ data: [], error: null }),
        tournament_groups: makeBuilder({ data: [{ ronda_libre_id: 'r1' }, { ronda_libre_id: 'r2' }], error: null }),
        rondas_libres: makeBuilder({ data: [{ codigo: 'AAA' }, { codigo: 'BBB' }], error: null }),
        tournaments: makeBuilder({ error: null }),
      }
      mockFrom.mockImplementation((table: string) => (tablas as Record<string, unknown>)[table])
      return tablas
    }

    it('por defecto avisa (cierre del organizador)', async () => {
      conEquipos()
      await closeTournament(mockSupabase, 't1')
      expect(vi.mocked(pushRoundUpdate).mock.calls.map(c => c[1])).toEqual(['AAA', 'BBB'])
    })

    it('con avisarSeguidores: false no avisa, pero congela y cierra igual (cierre automático)', async () => {
      const { rondas_libres, tournaments } = conEquipos()
      await closeTournament(mockSupabase, 't1', { avisarSeguidores: false })
      expect(pushRoundUpdate).not.toHaveBeenCalled()
      expect(rondas_libres.update).toHaveBeenCalledWith({ estado: 'finalizada' })
      expect(tournaments.update).toHaveBeenCalledWith({ status: 'closed' })
      expect(start).toHaveBeenCalled()
    })
  })

  describe('historial', () => {
    function armar(cerradas: unknown[]) {
      const tournaments = makeBuilder({ error: null })
      mockFrom.mockImplementation((table: string) => ({
        rounds: makeBuilder({ data: cerradas, error: null }),
        tournament_groups: makeBuilder({ data: [], error: null }),
        tournaments,
      } as Record<string, unknown>)[table])
      return { tournaments }
    }

    it('arranca el workflow con las rondas que cerró, después de marcar el torneo cerrado', async () => {
      const { tournaments } = armar([{ id: 'a' }, { id: 'b' }])
      await closeTournament(mockSupabase, 't1')
      expect(start).toHaveBeenCalledWith(historialDelCierre, ['t1', ['a', 'b']])
      expect(tournaments.update.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(start).mock.invocationCallOrder[0])
      expect(guardarRondasDelCierre).not.toHaveBeenCalled()
    })

    it('si el workflow no arranca, lo reporta y guarda las rondas después de responder', async () => {
      armar([{ id: 'a' }])
      vi.mocked(start).mockRejectedValue(new Error('cola caída'))
      await expect(closeTournament(mockSupabase, 't1')).resolves.toBeUndefined()
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'torneo.historial-cierre', meta: { tournamentId: 't1' } }))
      expect(guardarRondasDelCierre).not.toHaveBeenCalled()
      await (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)()
      expect(guardarRondasDelCierre).toHaveBeenCalledWith('t1', ['a'])
    })
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

describe('reopenTournament', () => {
  it('vuelve a in_progress y limpia las marcas del cierre automático, en el mismo UPDATE', async () => {
    const tablas = {
      tournaments: makeBuilder({ error: null }),
      rounds: makeBuilder({ error: null }),
      tournament_groups: makeBuilder({ data: [{ ronda_libre_id: 'r1' }], error: null }),
      rondas_libres: makeBuilder({ error: null }),
    }
    mockFrom.mockImplementation((table: string) => (tablas as Record<string, unknown>)[table])
    await reopenTournament(mockSupabase, 't1')
    expect(tablas.tournaments.update).toHaveBeenCalledWith({
      status: 'in_progress', aviso_cierre_enviado_at: null, cerrado_automaticamente_at: null,
    })
    expect(tablas.tournaments.eq).toHaveBeenCalledWith('id', 't1')
    expect(tablas.rounds.update).toHaveBeenCalledWith({ status: 'in_progress' })
    expect(tablas.rondas_libres.update).toHaveBeenCalledWith({ estado: 'en_curso' })
  })

  it('propaga error si no puede reabrir el torneo y no toca las rondas', async () => {
    const tablas = { tournaments: makeBuilder({ error: { message: 'RLS' } }), rounds: makeBuilder({ error: null }) }
    mockFrom.mockImplementation((table: string) => (tablas as Record<string, unknown>)[table])
    await expect(reopenTournament(mockSupabase, 't1')).rejects.toThrow('RLS')
    expect(tablas.rounds.update).not.toHaveBeenCalled()
  })
})
