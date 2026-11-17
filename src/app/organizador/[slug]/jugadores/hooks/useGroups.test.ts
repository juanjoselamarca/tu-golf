// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const showWarning = vi.fn()
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError: vi.fn(), showWarning, showSuccess: vi.fn() }),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

type Fila = { id: string; name: string; tee_time: null; sort_order: number; ronda_libre_id: string | null; tournament_group_players: Array<{ id: string; player_id: string; jugador_ronda_id: string | null }> }
let filas: Fila[] = []
const assignPlayerToGroup = vi.fn(async () => {})
const deleteGroup = vi.fn(async () => {})
vi.mock('@/lib/data/tournaments/groups', () => ({
  listGroups: vi.fn(async () => filas),
  createGroup: vi.fn(),
  deleteGroup: (...a: unknown[]) => deleteGroup(...(a as [])),
  setGroupTeeTime: vi.fn(),
  assignPlayerToGroup: (...a: unknown[]) => assignPlayerToGroup(...(a as [])),
  teeTimeDesdeHoraLocal: vi.fn(),
}))

import { useGroups } from './useGroups'

const tournament = { id: 't1', slug: 's', format: 'stroke_play' } as never
const players = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] as never

function grupo(id: string, ronda: string | null, ids: string[]): Fila {
  return {
    id, name: id, tee_time: null, sort_order: 0, ronda_libre_id: ronda,
    tournament_group_players: ids.map((pid) => ({ id: `gp-${pid}`, player_id: pid, jugador_ronda_id: ronda ? `rlj-${pid}` : null })),
  }
}

async function montar(status: string) {
  const h = renderHook(() => useGroups({ tournament, players, tournamentStatus: status }))
  await act(async () => { await h.result.current.fetchGroups() })
  return h
}

beforeEach(() => {
  showWarning.mockClear()
  assignPlayerToGroup.mockClear()
  deleteGroup.mockClear()
})

describe('useGroups con el torneo iniciado (#810)', () => {
  it('en juego: reasignar de grupo no toca la base y avisa', async () => {
    filas = [grupo('g1', 'r1', ['p1', 'p2']), grupo('g2', 'r2', ['p3'])]
    const h = await montar('in_progress')
    expect(h.result.current.gruposFijos).toBe(true)
    await act(async () => { await h.result.current.handleAssignPlayer('p1', 'g2') })
    expect(assignPlayerToGroup).not.toHaveBeenCalled()
    expect(showWarning).toHaveBeenCalled()
  })

  it('pestaña vieja en "open" con grupos que ya tienen tarjeta: tampoco reasigna', async () => {
    filas = [grupo('g1', 'r1', ['p1', 'p2']), grupo('g2', 'r2', ['p3'])]
    const h = await montar('open')
    await act(async () => { await h.result.current.handleAssignPlayer('p1', '') })
    expect(assignPlayerToGroup).not.toHaveBeenCalled()
  })

  it('en juego: rebalancear no mueve ni borra nada', async () => {
    filas = [grupo('g1', 'r1', ['p1', 'p2']), grupo('g2', 'r2', ['p3'])]
    const h = await montar('in_progress')
    let r: boolean | undefined
    await act(async () => { r = await h.result.current.removePlayerAndRebalance('p1') })
    expect(r).toBe(false)
    expect(assignPlayerToGroup).not.toHaveBeenCalled()
    expect(deleteGroup).not.toHaveBeenCalled()
  })

  it('en juego: un grupo con tarjeta no se borra; uno vacío y sin tarjeta sí', async () => {
    filas = [grupo('g1', 'r1', ['p1']), grupo('vacio', null, [])]
    const h = await montar('in_progress')
    await act(async () => { await h.result.current.handleDeleteGroup('g1') })
    expect(deleteGroup).not.toHaveBeenCalled()
    await act(async () => { await h.result.current.handleDeleteGroup('vacio') })
    expect(deleteGroup).toHaveBeenCalledTimes(1)
  })

  it('antes del inicio todo sigue igual: reasigna y borra', async () => {
    filas = [grupo('g1', null, ['p1', 'p2']), grupo('g2', null, ['p3'])]
    const h = await montar('open')
    expect(h.result.current.gruposFijos).toBe(false)
    await act(async () => { await h.result.current.handleAssignPlayer('p1', 'g2') })
    expect(assignPlayerToGroup).toHaveBeenCalledWith({}, 'p1', 'g2')
    await act(async () => { await h.result.current.handleDeleteGroup('g1') })
    expect(deleteGroup).toHaveBeenCalledWith({}, 'g1')
  })
})
