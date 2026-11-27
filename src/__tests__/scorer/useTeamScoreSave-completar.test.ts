// #602 — Al finalizar un scramble / foursome, los hoyos sin score del EQUIPO se completan
// con par y quedan PENDIENTES en el teléfono antes de enviar (si no, el último hoyo sin
// tocar +/- quedaba fuera del total del equipo).
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { useTeamScoreSave } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useTeamScoreSave'
import { leerPendientes, loadGroupTeamScores, ID_PENDIENTE_EQUIPO, apartarRechazados, leerRechazados } from '@/lib/ronda/score-storage'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'

const PAR: Record<number, number> = { 10: 4, 11: 3, 12: 5 }
const hoyos = [10, 11, 12]
const eq = (id: string, scores: Record<string, number>): EquipoDelScorer =>
  ({ id, nombre: id, handicap_equipo: null, scores, jugadorIds: [], jugadorNombres: [] }) as unknown as EquipoDelScorer

function montar(
  inicial: EquipoDelScorer[], ajenos?: { id: string }[], envio = { programarEnvio: vi.fn(), enviarYa: vi.fn(async () => {}) },
  noConfirmanElHoyo?: { id: string }[],
) {
  return renderHook(() => {
    const [teamEquipos, setTeamEquipos] = useState(inicial)
    const save = useTeamScoreSave({ codigo: 'QA602', parMap: PAR, teamEquipos, setTeamEquipos, setHasUnsaved: vi.fn(), ...envio, sinParAutomatico: ajenos, noConfirmanElHoyo })
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

// PR #763, vuelta 7: corregir un hoyo del equipo cuya tarjeta el servidor rechazó olvida el valor rechazado
// (si no, Finalizar lo reenviaría encima de la corrección).
describe('useTeamScoreSave.handleTeamScoreChange con la tarjeta del equipo rechazada', () => {
  it('olvida el valor rechazado del hoyo corregido y deja la corrección pendiente', () => {
    apartarRechazados('QA602', ID_PENDIENTE_EQUIPO('e1'), { 10: 7, 11: 3 })
    const { result } = montar([eq('e1', { '10': 7, '11': 3 })])
    act(() => { result.current.save.handleTeamScoreChange('e1', 10, -1) })
    expect(leerRechazados('QA602')).toEqual({ [ID_PENDIENTE_EQUIPO('e1')]: { 11: 3 } })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e1')]).toEqual({ 10: 6 })
  })
})

describe('useTeamScoreSave — un celular por equipo: el par nunca toca un equipo de otro celular', () => {
  // Lista vieja: e2 todavía en pantalla aunque ya lo anota otro celular (ajenos al día).
  const AJENOS = [{ id: 'e2' }]
  it('al pasar de hoyo rellena solo los propios', async () => {
    const { result } = montar([eq('e1', {}), eq('e2', {})], AJENOS)
    await act(async () => { await result.current.save.confirmarHoyo(10, 4) })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e1')]).toEqual({ '10': 4 })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e2')]).toBeUndefined()
    expect(result.current.teamEquipos.find(e => e.id === 'e2')?.scores).toEqual({})
  })
  it('al finalizar completa solo los propios', () => {
    const { result } = montar([eq('e1', { '10': 4 }), eq('e2', { '10': 5 })], AJENOS)
    let out: EquipoDelScorer[] = []
    act(() => { out = result.current.save.completarEquiposConPar(result.current.teamEquipos, hoyos) })
    expect(out.find(e => e.id === 'e1')?.scores).toEqual({ '10': 4, '11': 3, '12': 5 })
    expect(out.find(e => e.id === 'e2')?.scores).toEqual({ '10': 5 })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e2')]).toBeUndefined()
  })
})

describe('useTeamScoreSave — par fantasma (P1-a): el equipo sin reclamar del creador no recibe par', () => {
  it('al pasar de hoyo: e1 (reclamado por el creador) sí, e3 (sin reclamar, en pantalla del creador) no', async () => {
    const { result } = montar([eq('e1', {}), eq('e3', {})], [{ id: 'e3' }])
    await act(async () => { await result.current.save.confirmarHoyo(10, 4) })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e1')]).toEqual({ '10': 4 })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e3')]).toBeUndefined()
    expect(loadGroupTeamScores('QA602').e3).toEqual({})
  })
  it('a mano sí se edita el equipo sin reclamar', () => {
    const { result } = montar([eq('e1', {}), eq('e3', {})], [{ id: 'e3' }])
    act(() => { result.current.save.handleTeamScoreChange('e3', 10, 1) })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e3')]).toEqual({ '10': 5 })
  })
  it('al finalizar, la lista recién leída (`sinPar`) manda sobre la de pantalla', () => {
    // En pantalla nadie está excluido (lista vieja); el servidor dice que e3 está sin reclamar.
    const { result } = montar([eq('e1', {}), eq('e3', {})], [])
    let out: EquipoDelScorer[] = []
    act(() => { out = result.current.save.completarEquiposConPar(result.current.teamEquipos, hoyos, [{ id: 'e3' }]) })
    expect(out.find(e => e.id === 'e1')?.scores).toEqual({ '10': 4, '11': 3, '12': 5 })
    expect(out.find(e => e.id === 'e3')?.scores).toEqual({})
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e3')]).toBeUndefined()
  })
})

// Ensayo del scramble (25-nov), P0-1: quien anota un equipo desde su celular (no cierra la ronda) llegaba al último
// hoyo con el par gris y no tenía cómo guardarlo. «Terminar mi equipo» usa la misma regla que Siguiente.
describe('useTeamScoreSave.confirmarHoyo — inmediato (último hoyo)', () => {
  it('deja el par en la cola ANTES de enviar y envía sin debounce', async () => {
    let enCola: unknown = null
    const envio = { programarEnvio: vi.fn(), enviarYa: vi.fn(async () => { enCola = leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e1')] }) }
    const { result } = montar([eq('e1', { '10': 5, '11': 3 })], [], envio)
    await act(async () => { await result.current.save.confirmarHoyo(12, 5, { inmediato: true }) })
    expect(envio.enviarYa).toHaveBeenCalledTimes(1)
    expect(envio.programarEnvio).not.toHaveBeenCalled()
    expect(enCola).toEqual({ '12': 5 })
    expect(result.current.teamEquipos[0].scores).toEqual({ '10': 5, '11': 3, '12': 5 })
    expect(loadGroupTeamScores('QA602').e1).toEqual({ '10': 5, '11': 3, '12': 5 })
  })
  it('un valor ya anotado en el hoyo no se pisa con el par', async () => {
    const envio = { programarEnvio: vi.fn(), enviarYa: vi.fn(async () => {}) }
    const { result } = montar([eq('e1', { '12': 7 })], [], envio)
    await act(async () => { await result.current.save.confirmarHoyo(12, 5, { inmediato: true }) })
    expect(result.current.teamEquipos[0].scores).toEqual({ '12': 7 })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e1')]).toBeUndefined()
  })
  it('Siguiente (sin inmediato): mismo relleno, envío con debounce', async () => {
    const envio = { programarEnvio: vi.fn(), enviarYa: vi.fn(async () => {}) }
    const { result } = montar([eq('e1', {})], [], envio)
    await act(async () => { await result.current.save.confirmarHoyo(10, 4) })
    expect(envio.programarEnvio).toHaveBeenCalledTimes(1)
    expect(envio.enviarYa).not.toHaveBeenCalled()
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e1')]).toEqual({ '10': 4 })
  })
})

// Ensayo 24-nov (P1): tras «Liberar», el creador pasaba el hoyo con Siguiente y el par gris del equipo liberado no se
// guardaba. Ese equipo confirma el hoyo en pantalla (`equiposQueConfirmanElHoyo`), pero el cierre no le rellena hoyos.
describe('useTeamScoreSave — equipo liberado que anota el creador', () => {
  it('Siguiente guarda su par gris; completar al cerrar no lo toca', async () => {
    const envio = { programarEnvio: vi.fn(), enviarYa: vi.fn(async () => {}) }
    const { result } = montar([eq('e1', {}), eq('e3', { '10': 5 })], [{ id: 'e3' }], envio, [])
    await act(async () => { await result.current.save.confirmarHoyo(11, 3) })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e3')]).toEqual({ '11': 3 })
    expect(leerPendientes('QA602')[ID_PENDIENTE_EQUIPO('e1')]).toEqual({ '11': 3 })
    let out: EquipoDelScorer[] = []
    act(() => { out = result.current.save.completarEquiposConPar(result.current.teamEquipos, hoyos) })
    expect(out.find(e => e.id === 'e3')?.scores).toEqual({ '10': 5, '11': 3 })
  })
})
