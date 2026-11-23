/**
 * Finalizar en una ronda de un celular por equipo (scramble rápido, plan §2): el creador no cierra mientras a un
 * equipo de otro celular le faltan hoyos, y nunca cierra con una lista de equipos vieja.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { useFinalizeGrupo } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useFinalizeGrupo'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import type { ResultadoEnvio } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const addToast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ addToast: (...a: unknown[]) => addToast(...a) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: vi.fn() }))
vi.mock('@/lib/ronda/score-storage', () => ({
  loadGroupScores: () => ({}), hayPendientes: () => false, limpiarCopiaLocalDeRonda: vi.fn(), cerrarCopiaLocalAlFinalizar: vi.fn(),
}))
const finalizarRondaLibre = vi.fn(async () => ({ finalizada: true, error: null as unknown }))
vi.mock('@/lib/data/ronda-libre-scores', () => ({
  finalizarRondaLibre: (...a: unknown[]) => finalizarRondaLibre(...(a as [])),
  ERRCODE_SIN_RESPUESTA: 'SIN_RESPUESTA',
}))
vi.mock('@/lib/data/ronda-libre-finalizar', async () => ({
  RONDA_NO_EXISTE: 'no_existe',
  esRondaCerrada: (await import('@/lib/data/ronda-libre-estado')).esRondaCerrada,
  fetchEstadoRondaLibre: async () => 'en_curso',
  guardarTarjetaEnHistorial: async () => ({ status: 'insertada', id: null, tarjeta: {} }),
  recalcularIndiceGolfers: async () => true,
  actualizarNivelDelJugador: async () => {},
  avisarAlCoachRondaNueva: vi.fn(),
}))
const lectura = { equipos: [] as unknown[], falla: false }
vi.mock('@/lib/data/ronda-libre', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/ronda-libre')>()),
  fetchEquiposConAnotador: async () => {
    if (lectura.falla) throw new Error('Failed to fetch')
    return lectura.equipos
  },
}))

const PAR: Record<number, number> = { 1: 4, 2: 3, 3: 4, 4: 4, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5 }
const hoyos = hoyosDeLaRonda(1, 9)
const lleno = Object.fromEntries(hoyos.map(h => [String(h), PAR[h]]))
const CREADOR = 'u-creador'
const ronda = {
  id: 'r1', codigo: 'ABC', course_name: 'X', course_id: 'c1', tees: 'azul', holes: 9, fecha: '2026-11-23', estado: 'en_curso',
  modo_juego: 'neto', formato_juego: 'scramble', hoyo_inicio: 1, admin_mode: false, creador_id: CREADOR,
  ronda_libre_jugadores: [{ id: 'p1', nombre: 'Juanjo', user_id: CREADOR, scores: {} }],
}
const eq = (id: string, nombre: string, anotador: string | null, scores: Record<string, number>) =>
  ({ id, nombre, handicap_equipo: 8, handicap_equipo_juego: 8, handicap_origen: 'club', scores, jugadorIds: [], jugadorNombres: [], anotador_user_id: anotador, anotador_nombre: null })

const enviarPendientes = vi.fn(async (): Promise<ResultadoEnvio> => ({ estado: 'ronda_abierta', rechazadas: [] }))
const completarEquiposConPar = vi.fn((eqs: unknown[]) => eqs)
const recargar = vi.fn(async () => {})

function montar(teamEquipos: unknown[]) {
  return renderHook(() => {
    const [scores, setScores] = useState<Record<string, Record<number, number>>>({})
    return useFinalizeGrupo({
      ronda: ronda as never, codigo: 'ABC', hoyos, scores, setScores, parMap: PAR,
      teamEquipos: teamEquipos as never, completarEquiposConPar: completarEquiposConPar as never, matchResult: null,
      authUserId: CREADOR, enviarPendientes: enviarPendientes as never, unCelularPorEquipo: { recargar },
    })
  })
}

async function finalizar(result: { current: ReturnType<typeof useFinalizeGrupo> }) {
  await act(async () => { await result.current.finalizeRound() }) // abre la hoja
  await act(async () => { await result.current.finalizeRound() }) // confirma
}

beforeEach(() => {
  vi.clearAllMocks()
  lectura.falla = false
})

describe('useFinalizeGrupo — un celular por equipo', () => {
  it('un equipo de otro celular sin terminar frena el cierre, con su nombre y el hoyo en que va', async () => {
    const mio = eq('e1', 'Los Tigres', CREADOR, lleno)
    lectura.equipos = [mio, eq('e2', 'Los Pumas', 'u-pedro', { 1: 4, 2: 3, 3: 4, 4: 4 })]
    const { result } = montar([mio])
    await finalizar(result)
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Los Pumas va en el hoyo 5. Espera a que termine o libéralo para cerrarlo tú.' }))
    expect(completarEquiposConPar).not.toHaveBeenCalled()
    expect(enviarPendientes).not.toHaveBeenCalled()
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
  })

  it('con todos los equipos de otro celular completos, cierra (y solo rellena los de este celular)', async () => {
    const mio = eq('e1', 'Los Tigres', CREADOR, { 1: 4 })
    lectura.equipos = [mio, eq('e2', 'Los Pumas', 'u-pedro', lleno)]
    const { result } = montar([mio])
    await finalizar(result)
    // Lo que no se rellena es lo recién leído: el equipo de otro celular.
    expect(completarEquiposConPar).toHaveBeenCalledWith([mio], hoyos, [lectura.equipos[1]])
    expect(finalizarRondaLibre).toHaveBeenCalledTimes(1)
  })

  it('P1-a: un equipo SIN RECLAMAR con hoyos sin golpes frena el cierre del creador (no se rellena con par)', async () => {
    const mio = eq('e1', 'Los Tigres', CREADOR, lleno)
    const sinReclamar = eq('e3', 'Los Cóndores', null, { 1: 4, 2: 3 })
    lectura.equipos = [mio, sinReclamar]
    const { result } = montar([mio, sinReclamar])
    await finalizar(result)
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Los Cóndores no tiene golpes en el hoyo 3. Anótalo para cerrar la ronda.' }))
    expect(completarEquiposConPar).not.toHaveBeenCalled()
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
  })

  it('P1-a: el equipo sin reclamar completo a mano no frena, y no se rellena (solo el reclamado)', async () => {
    const mio = eq('e1', 'Los Tigres', CREADOR, { 1: 4 })
    const sinReclamar = eq('e3', 'Los Cóndores', null, lleno)
    lectura.equipos = [mio, sinReclamar]
    const { result } = montar([mio, sinReclamar])
    await finalizar(result)
    expect(completarEquiposConPar).toHaveBeenCalledWith([mio, sinReclamar], hoyos, [sinReclamar])
    expect(finalizarRondaLibre).toHaveBeenCalledTimes(1)
  })

  it('le liberaron un equipo desde la última lectura: no cierra con la lista vieja, recarga y avisa', async () => {
    const mio = eq('e1', 'Los Tigres', CREADOR, lleno)
    lectura.equipos = [mio, eq('e2', 'Los Pumas', null, lleno)]
    const { result } = montar([mio])
    await finalizar(result)
    expect(recargar).toHaveBeenCalledTimes(1)
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cambió quién anota los equipos' }))
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
  })

  it('sin servidor al releer los equipos: no cierra (aviso de sin servidor)', async () => {
    lectura.falla = true
    const { result } = montar([eq('e1', 'Los Tigres', CREADOR, lleno)])
    await finalizar(result)
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
  })
})
