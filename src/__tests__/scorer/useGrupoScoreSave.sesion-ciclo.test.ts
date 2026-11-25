import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEstadoConRef } from '@/hooks/useEstadoConRef'
import { useGrupoScoreSave } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave'
import { marcarPendientes } from '@/lib/ronda/score-storage'

// Follow-ups P2 del #789 en el scorer de grupo: (1) el aviso de sesión quedaba pegado si, con la sesión de
// vuelta, el envío fallaba por 5xx; (2) hasta 3 consultas de sesión por ciclo; (3) caso mixto P0004 + 42501.

const saveRondaLibreScores = vi.fn()
const saveRondaEquiposScores = vi.fn()
vi.mock('@/lib/data/ronda-libre-scores', () => ({
  saveRondaLibreScores: (...a: unknown[]) => saveRondaLibreScores(...a),
  saveRondaEquiposScores: (...a: unknown[]) => saveRondaEquiposScores(...a),
  ERRCODE_SIN_RESPUESTA: 'SIN_RESPUESTA',
}))
const { getSession, cliente } = vi.hoisted(() => {
  const getSession = vi.fn()
  const cliente = {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { estado: 'en_curso' }, error: null }) }) }) }),
    auth: { getSession },
  }
  return { getSession, cliente }
})
vi.mock('@/lib/supabase', () => ({ createClient: () => cliente }))
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: vi.fn() }))

const ronda = {
  id: 'r1', codigo: 'ABC', course_name: 'X', course_id: null, tees: 'azul', holes: 9, fecha: '2026-09-30', estado: 'en_curso',
  modo_juego: 'gross', formato_juego: 'stroke_play', hoyo_inicio: 1,
  ronda_libre_jugadores: [{ id: 'p1', nombre: 'Ana', user_id: 'u1', scores: {} }],
} as never
const PAR = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 }
const CON_SESION = { data: { session: { user: { id: 'u1' } } }, error: null }
const SIN_SESION = { data: { session: null }, error: null }
const E42501 = { error: { code: '42501', message: 'permission denied for function' } }

function montar() {
  return renderHook(() => {
    const [scores, setScores, scoresRef] = useEstadoConRef<Record<string, Record<number, number>>>({ p1: {} })
    return useGrupoScoreSave({ ronda, codigo: 'ABC', currentHole: 1, scores, setScores, scoresRef, parMap: PAR })
  })
}

async function ciclo(result: ReturnType<typeof montar>['result']) {
  await act(async () => { void result.current.saveAllScores(); await vi.advanceTimersByTimeAsync(3000) })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  saveRondaLibreScores.mockReset().mockResolvedValue({ error: null })
  saveRondaEquiposScores.mockReset().mockResolvedValue({ error: null })
  getSession.mockReset().mockResolvedValue(CON_SESION)
})
afterEach(() => vi.useRealTimers())

describe('useGrupoScoreSave — sesión: una consulta por ciclo, caso mixto y aviso que se apaga', () => {
  it('42501 con sesión en los 3 intentos: la sesión se consulta UNA vez en el ciclo', async () => {
    saveRondaEquiposScores.mockResolvedValue(E42501)
    marcarPendientes('ABC', 'eq:e1', { 3: 4 })
    const { result } = montar()
    await ciclo(result)
    expect(saveRondaEquiposScores).toHaveBeenCalledTimes(3)
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(result.current.sesionPerdida).toBe(false)
  })

  it('caso mixto: P0004 de un jugador y 42501 de equipos sin sesión en el mismo envío → aviso de sesión', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: 'P0004', message: 'delta invalido' } })
    saveRondaEquiposScores.mockResolvedValue(E42501)
    getSession.mockResolvedValue(SIN_SESION)
    marcarPendientes('ABC', 'p1', { 1: 4 })
    marcarPendientes('ABC', 'eq:e1', { 3: 4 })
    const { result } = montar()
    await ciclo(result)
    expect(result.current.sesionPerdida).toBe(true)
  })

  it('aviso puesto, la sesión vuelve y el envío falla por 5xx: el aviso se apaga (los golpes siguen pendientes)', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: 'P0003', message: 'RONDA_FORBIDDEN' } })
    getSession.mockResolvedValue(SIN_SESION)
    marcarPendientes('ABC', 'p1', { 1: 4 })
    const { result } = montar()
    await ciclo(result)
    expect(result.current.sesionPerdida).toBe(true)

    saveRondaLibreScores.mockResolvedValue({ error: { code: '', message: 'Service Unavailable' } })
    getSession.mockReset().mockResolvedValue(CON_SESION)
    await ciclo(result)
    expect(result.current.sesionPerdida).toBe(false)
    expect(result.current.pendienteDeEnvio).toBe(true)
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('aviso puesto y el 5xx llega todavía sin sesión: el aviso se queda', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: 'P0003', message: 'RONDA_FORBIDDEN' } })
    getSession.mockResolvedValue(SIN_SESION)
    marcarPendientes('ABC', 'p1', { 1: 4 })
    const { result } = montar()
    await ciclo(result)
    saveRondaLibreScores.mockResolvedValue({ error: { code: '', message: 'Service Unavailable' } })
    await ciclo(result)
    expect(result.current.sesionPerdida).toBe(true)
  })

  // Fable #833 P2-a: con el aviso puesto, un rechazo firme sin problema de sesión (P0004) lo dejaba pegado.
  it('aviso puesto, la sesión vuelve y llega un rechazo firme (P0004): el aviso se apaga', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: 'P0003', message: 'RONDA_FORBIDDEN' } })
    getSession.mockResolvedValue(SIN_SESION)
    marcarPendientes('ABC', 'p1', { 1: 4 })
    const { result } = montar()
    await ciclo(result)
    expect(result.current.sesionPerdida).toBe(true)

    saveRondaLibreScores.mockResolvedValue({ error: { code: 'P0004', message: 'delta invalido' } })
    getSession.mockReset().mockResolvedValue(CON_SESION)
    await ciclo(result)
    expect(result.current.sesionPerdida).toBe(false)
  })
})
