import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/hooks/useToast', () => ({ addToast: mocks.toast }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
// La cola es la real (localStorage); solo la RPC es simulada.
vi.mock('@/lib/data/ronda-libre-scores', () => ({ marcarDriveEquipo: mocks.rpc }))

import { useDrivesDelScorer } from './useDrivesDelScorer'
import { hayDrivesPendientes } from '@/lib/ronda/drives-pendientes'

const H18 = Array.from({ length: 18 }, (_, i) => i + 1)
const base: EquipoDelScorer = {
  id: 'e1', nombre: 'Los Tigres', handicap_equipo: null, handicap_equipo_juego: null, jugadorIds: [], jugadorNombres: [],
  scores: {}, handicap_origen: 'club',
}
const conDrives: EquipoDelScorer = { ...base, drive_jugadores: ['Juanjo', 'Pedro', 'Diego', 'Tomás'], drives: { '1': 0, '2': 0 } }

const SIN_SENAL = { drives: null, error: { code: '', message: 'sin señal' } }

function montar(equipos: EquipoDelScorer[], opts: { conexion?: string; hoyo?: number; minimo?: number | null } = {}) {
  return renderHook(
    ({ conexion }) => {
      const [teamEquipos, setTeamEquipos] = useState(equipos)
      const drivesDe = useDrivesDelScorer({
        codigo: 'DRV1', drivesMinimo: opts.minimo === undefined ? 4 : opts.minimo, teamEquipos, setTeamEquipos,
        ordenHoyos: H18, currentHole: opts.hoyo ?? 3, conexion, deshabilitado: false,
      })
      return { drives: teamEquipos.map(drivesDe), teamEquipos }
    },
    { initialProps: { conexion: opts.conexion ?? 'ok' } },
  )
}

beforeEach(() => {
  localStorage.clear()
  mocks.rpc.mockReset()
  mocks.toast.mockReset()
})

describe('useDrivesDelScorer', () => {
  it('un equipo sin drives: null (la tarjeta queda igual) y no llama a nada', () => {
    const { result } = montar([base])
    expect(result.current.drives).toEqual([null])
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('conteo inicial desde lo guardado', () => {
    const { result } = montar([conDrives])
    expect(result.current.drives[0]?.conteo.map(c => c.drives)).toEqual([2, 0, 0, 0])
    expect(result.current.drives[0]?.driveDelHoyo).toBeNull()
  })

  it('sin señal: el toque se ve al instante y queda en la cola', async () => {
    mocks.rpc.mockResolvedValue(SIN_SENAL)
    const { result } = montar([conDrives], { conexion: 'sin_conexion' })
    act(() => result.current.drives[0]!.elegir(1))
    expect(result.current.drives[0]?.driveDelHoyo).toBe(1)
    expect(result.current.drives[0]?.conteo.map(c => c.drives)).toEqual([2, 1, 0, 0])
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1))
    expect(mocks.rpc.mock.calls[0][1]).toEqual({ codigo: 'DRV1', equipoId: 'e1', hoyo: 3, jugador: 1 })
    expect(hayDrivesPendientes('DRV1')).toBe(true)
    expect(result.current.drives[0]?.driveDelHoyo).toBe(1)
  })

  it('al volver la señal sube lo pendiente y queda guardado en el equipo', async () => {
    mocks.rpc.mockResolvedValue(SIN_SENAL)
    const { result, rerender } = montar([conDrives], { conexion: 'sin_conexion' })
    act(() => result.current.drives[0]!.elegir(2))
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1))
    mocks.rpc.mockResolvedValue({ drives: { '1': 0, '2': 0, '3': 2 }, error: null })
    rerender({ conexion: 'ok' })
    await waitFor(() => expect(hayDrivesPendientes('DRV1')).toBe(false))
    await waitFor(() => expect(result.current.teamEquipos[0].drives).toEqual({ '1': 0, '2': 0, '3': 2 }))
    expect(result.current.drives[0]?.driveDelHoyo).toBe(2)
  })

  it('tocar el jugador ya marcado lo quita', async () => {
    mocks.rpc.mockResolvedValue({ drives: { '1': 0 }, error: null })
    const { result } = montar([conDrives], { hoyo: 2 })
    expect(result.current.drives[0]?.driveDelHoyo).toBe(0)
    act(() => result.current.drives[0]!.elegir(0))
    expect(result.current.drives[0]?.driveDelHoyo).toBeNull()
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith({}, { codigo: 'DRV1', equipoId: 'e1', hoyo: 2, jugador: null }))
  })

  it('rechazo definitivo: vuelve a lo guardado y avisa', async () => {
    mocks.rpc.mockResolvedValue({ drives: null, error: { code: 'P0003', message: 'prohibido' } })
    const { result } = montar([conDrives])
    act(() => result.current.drives[0]!.elegir(3))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1))
    expect(mocks.toast.mock.calls[0][0].title).toBe('No se guardó el drive del hoyo 3')
    await waitFor(() => expect(result.current.drives[0]?.driveDelHoyo).toBeNull())
  })

  it('aviso de riesgo cuando los hoyos que quedan no alcanzan', () => {
    // 15 hoyos con drive de Juanjo: quedan 3 hoyos y a Pedro, Diego y Tomás les faltan 4 cada uno.
    const drives = Object.fromEntries(H18.slice(0, 15).map(h => [String(h), 0]))
    const { result } = montar([{ ...conDrives, drives }])
    expect(result.current.drives[0]?.aviso).toMatch(/^A Pedro le faltan 4 drives/)
  })
})
