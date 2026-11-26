/**
 * Un celular por equipo (scramble rápido, plan §2 y §6): ningún envío de este celular toca un equipo de otro.
 *  - Lo pendiente de un equipo que otro celular reclamó NO viaja (el creador pasa puede_anotar_ronda y pisaría).
 *  - P0003 en un equipo = este celular ya no lo anota (lo liberaron): sale de pendientes, sin reintento ni aviso
 *    genérico, y la pantalla relee quién anota qué («Ya no anotas este equipo.»).
 *  - Sin `unCelularPorEquipo` (ronda de un celular) nada cambia: un P0003 se reintenta como siempre.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEstadoConRef } from '@/hooks/useEstadoConRef'
import { useGrupoScoreSave } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave'
import { hayPendientes, leerPendientes, marcarPendientes } from '@/lib/ronda/score-storage'

const saveRondaEquiposScores = vi.fn()
vi.mock('@/lib/data/ronda-libre-scores', () => ({
  saveRondaLibreScores: vi.fn(async () => ({ error: null })),
  saveRondaEquiposScores: (...a: unknown[]) => saveRondaEquiposScores(...a),
  ERRCODE_SIN_RESPUESTA: 'SIN_RESPUESTA',
}))
const cliente = vi.hoisted(() => ({
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { estado: 'en_curso' }, error: null }) }) }) }),
  auth: { getSession: async () => ({ data: { session: { user: { id: 'u-creador' } } }, error: null }) },
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => cliente }))
const addToast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ addToast: (...a: unknown[]) => addToast(...a) }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: vi.fn() }))

const ronda = {
  id: 'r1', codigo: 'ABC', course_name: 'X', course_id: null, tees: 'azul', holes: 9, fecha: '2026-11-23', estado: 'en_curso',
  modo_juego: 'neto', formato_juego: 'scramble', hoyo_inicio: 1, admin_mode: false, creador_id: 'u-creador',
  ronda_libre_jugadores: [{ id: 'p1', nombre: 'Creador', user_id: 'u-creador', scores: {} }],
} as never

function montar(teamEquipos: { id: string; scores: Record<string, number> }[], porCelular?: { ajenos: { id: string }[]; alPerderEquipo: () => void }) {
  return renderHook(() => {
    const [scores, setScores, scoresRef] = useEstadoConRef<Record<string, Record<number, number>>>({ p1: {} })
    return useGrupoScoreSave({ ronda, codigo: 'ABC', currentHole: 1, setScores, scoresRef, parMap: {}, teamEquipos, unCelularPorEquipo: porCelular })
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  saveRondaEquiposScores.mockReset()
  saveRondaEquiposScores.mockResolvedValue({ error: null })
  addToast.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('useGrupoScoreSave — un celular por equipo', () => {
  it('lo pendiente de un equipo que reclamó otro celular no se envía y sale de pendientes', async () => {
    // El creador anotó el hoyo 3 del equipo 2 (libre) y Pedro lo reclamó antes de que subiera.
    marcarPendientes('ABC', 'eq:e1', { 3: 4 })
    marcarPendientes('ABC', 'eq:e2', { 3: 4 })
    const { result } = montar([{ id: 'e1', scores: { '3': 4 } }], { ajenos: [{ id: 'e2' }], alPerderEquipo: vi.fn() })
    await act(async () => { await result.current.saveAllScores() })
    expect(saveRondaEquiposScores).toHaveBeenCalledTimes(1)
    expect(saveRondaEquiposScores).toHaveBeenCalledWith(cliente, expect.objectContaining({ equipoId: 'e1' }))
    expect(saveRondaEquiposScores).not.toHaveBeenCalledWith(cliente, expect.objectContaining({ equipoId: 'e2' }))
    expect(hayPendientes('ABC')).toBe(false)
  })

  it('P0003 después de que lo liberaron: sale de pendientes, sin reintento ni aviso genérico, y avisa a la pantalla', async () => {
    saveRondaEquiposScores.mockResolvedValue({ error: { code: 'P0003', message: 'RONDA_FORBIDDEN' } })
    const alPerderEquipo = vi.fn()
    marcarPendientes('ABC', 'eq:e2', { 5: 4 })
    const { result } = montar([{ id: 'e2', scores: { '5': 4 } }], { ajenos: [], alPerderEquipo })
    await act(async () => { await result.current.saveAllScores() })
    expect(saveRondaEquiposScores).toHaveBeenCalledTimes(1)
    expect(alPerderEquipo).toHaveBeenCalledTimes(1)
    expect(leerPendientes('ABC')['eq:e2']).toBeUndefined()
    expect(addToast).not.toHaveBeenCalled()
    expect(result.current.pendienteDeEnvio).toBe(false)
  })

  it('P0003 «equipo_de_otro_anotador» (otro celular lo reclamó antes de que la pantalla se enterara): definitivo, se descarta y se relee', async () => {
    saveRondaEquiposScores.mockResolvedValue({ error: { code: 'P0003', message: 'RONDA_FORBIDDEN', details: 'equipo_de_otro_anotador' } })
    const alPerderEquipo = vi.fn()
    // Pendiente de antes del reclamo: la lista de ajenos todavía no lo sabe.
    marcarPendientes('ABC', 'eq:e3', { 2: 5 })
    const { result } = montar([{ id: 'e3', scores: { '2': 5 } }], { ajenos: [], alPerderEquipo })
    await act(async () => { await result.current.saveAllScores() })
    expect(saveRondaEquiposScores).toHaveBeenCalledTimes(1)
    expect(leerPendientes('ABC')['eq:e3']).toBeUndefined()
    expect(alPerderEquipo).toHaveBeenCalledTimes(1)
    expect(addToast).not.toHaveBeenCalled()
  })

  it('P0003 «equipo_de_otro_anotador» sin datos de un celular por equipo (copia vieja): igual definitivo, no queda en cola', async () => {
    saveRondaEquiposScores.mockResolvedValue({ error: { code: 'P0003', message: 'RONDA_FORBIDDEN', details: 'equipo_de_otro_anotador' } })
    marcarPendientes('ABC', 'eq:e3', { 2: 5 })
    const { result } = montar([{ id: 'e3', scores: { '2': 5 } }])
    await act(async () => { const p = result.current.saveAllScores(); await vi.runAllTimersAsync(); await p })
    expect(saveRondaEquiposScores).toHaveBeenCalledTimes(1)
    expect(leerPendientes('ABC')['eq:e3']).toBeUndefined()
  })

  it('ronda de un celular: un P0003 en un equipo sigue pendiente y se reintenta, como siempre', async () => {
    saveRondaEquiposScores.mockResolvedValue({ error: { code: 'P0003', message: 'RONDA_FORBIDDEN' } })
    marcarPendientes('ABC', 'eq:e2', { 5: 4 })
    const { result } = montar([{ id: 'e2', scores: { '5': 4 } }])
    await act(async () => { const p = result.current.saveAllScores(); await vi.runAllTimersAsync(); await p })
    expect(saveRondaEquiposScores.mock.calls.length).toBeGreaterThan(1)
    expect(leerPendientes('ABC')['eq:e2']).toEqual({ '5': 4 })
  })
})
