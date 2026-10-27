// #602 — Al finalizar un scramble / foursome, los hoyos sin score del EQUIPO se completan
// con par y quedan PENDIENTES en el teléfono antes de enviar (si no, el último hoyo sin
// tocar +/- quedaba fuera del total del equipo).
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { useTeamScoreSave } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useTeamScoreSave'
import { leerPendientes, loadGroupTeamScores, ID_PENDIENTE_EQUIPO } from '@/lib/ronda/score-storage'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'

const PAR: Record<number, number> = { 10: 4, 11: 3, 12: 5 }
const hoyos = [10, 11, 12]
const eq = (id: string, scores: Record<string, number>): EquipoDelScorer =>
  ({ id, nombre: id, handicap_equipo: null, scores, jugadorIds: [], jugadorNombres: [] }) as unknown as EquipoDelScorer

function montar(inicial: EquipoDelScorer[]) {
  return renderHook(() => {
    const [teamEquipos, setTeamEquipos] = useState(inicial)
    const save = useTeamScoreSave({ codigo: 'QA602', parMap: PAR, teamEquipos, setTeamEquipos, setHasUnsaved: vi.fn(), programarEnvio: vi.fn() })
    return { teamEquipos, save }
  })
}

beforeEach(() => { localStorage.clear() })

describe('useTeamScoreSave.completarEquiposConPar', () => {
  it('completa SÓLO los hoyos de la ronda que faltan, los deja pendientes y respaldados', () => {
    const e1 = eq('e1', { '10': 5, '11': 3 })
    const { result } = montar([e1])
    let devueltos: EquipoDelScorer[] = []
    act(() => { devueltos = result.current.save.completarEquiposConPar([e1], hoyos) })

    expect(devueltos[0].scores).toEqual({ '10': 5, '11': 3, '12': 5 })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e1')]).toEqual({ '12': 5 })
    expect(loadGroupTeamScores('QA602').e1).toEqual({ '10': 5, '11': 3, '12': 5 })
    expect(result.current.teamEquipos[0].scores).toEqual({ '10': 5, '11': 3, '12': 5 })
  })

  it('equipo completo: devuelve el mismo objeto y no marca nada', () => {
    const e1 = eq('e1', { '10': 4, '11': 3, '12': 5 })
    const { result } = montar([e1])
    let devueltos: EquipoDelScorer[] = []
    act(() => { devueltos = result.current.save.completarEquiposConPar([e1], hoyos) })
    expect(devueltos[0]).toBe(e1)
    expect(leerPendientes('QA602')).toEqual({})
  })
})
