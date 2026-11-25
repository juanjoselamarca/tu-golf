// Ensayo del scramble (25-nov): un golpe anotado justo antes de salir del scorer (volver atrás, bloquear el teléfono,
// cerrar la app) quedaba en la cola del teléfono pero NO salía al servidor: el envío esperaba el debounce de 500 ms
// y el desmontaje lo cancelaba. Al volver a la app se reenviaba, pero si el anotador no volvía (hoyo 18), el creador
// veía su equipo 17/18 y no podía cerrar. Ahora lo pendiente se envía YA al ocultarse la página y al desmontar.
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEstadoConRef } from '@/hooks/useEstadoConRef'
import { useGrupoScoreSave, SAVE_DEBOUNCE_MS, REENVIO_CONFIRMACION_MS } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave'
import { leerPendientes, marcarPendientes } from '@/lib/ronda/score-storage'
import { haptic } from '@/lib/ronda/helpers'

const saveRondaLibreScores = vi.fn(async () => ({ error: null as unknown }))
vi.mock('@/lib/data/ronda-libre-scores', () => ({
  saveRondaLibreScores: (...a: unknown[]) => saveRondaLibreScores(...(a as [])),
  saveRondaEquiposScores: vi.fn(async () => ({ error: null })),
  ERRCODE_SIN_RESPUESTA: 'SIN_RESPUESTA',
}))
const { cliente } = vi.hoisted(() => ({
  cliente: {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { estado: 'en_curso' }, error: null }) }) }) }),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }) },
  },
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => cliente }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: vi.fn() }))

const ronda = {
  id: 'r1', codigo: 'ABC', course_name: 'X', course_id: null, tees: 'azul', holes: 9, fecha: '2026-11-28', estado: 'en_curso',
  modo_juego: 'gross', formato_juego: 'stroke_play', hoyo_inicio: 1,
  ronda_libre_jugadores: [{ id: 'p1', nombre: 'Ana', user_id: 'u1', scores: {} }],
} as never
const PAR = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 }

function montar() {
  return renderHook(() => {
    const [scores, setScores, scoresRef] = useEstadoConRef<Record<string, Record<number, number>>>({ p1: {} })
    return useGrupoScoreSave({ ronda, codigo: 'ABC', currentHole: 9, setScores, scoresRef, parMap: PAR })
  })
}

function ocultarPagina() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  saveRondaLibreScores.mockReset()
  saveRondaLibreScores.mockResolvedValue({ error: null })
})
afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})

describe('useGrupoScoreSave — lo pendiente sale al dejar la pantalla', () => {
  it('anota y sale del scorer antes del debounce: el golpe se envía al desmontar', async () => {
    const { result, unmount } = montar()
    act(() => { result.current.handleScoreChange('p1', 9, 1) })
    expect(saveRondaLibreScores).not.toHaveBeenCalled()
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(saveRondaLibreScores).toHaveBeenCalledWith(cliente, { codigo: 'ABC', jugadorId: 'p1', delta: { 9: 6 } })
  })

  it('anota y bloquea el teléfono / cambia de app (página oculta): se envía YA, sin esperar el debounce', async () => {
    const { result } = montar()
    act(() => { result.current.handleScoreChange('p1', 9, 1) })
    act(() => { ocultarPagina() })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(1)
    expect(leerPendientes('ABC')).toEqual({})
    // El debounce ya no dispara un segundo envío de lo mismo.
    await act(async () => { await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS) })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(1)
  })

  it('pagehide (la página se va): intenta el envío YA', async () => {
    const { result } = montar()
    act(() => { result.current.handleScoreChange('p1', 9, -1) })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(saveRondaLibreScores).toHaveBeenCalledWith(cliente, { codigo: 'ABC', jugadorId: 'p1', delta: { 9: 4 } })
  })

  it('golpes pendientes de antes (sin envío programado) también salen al ocultarse', async () => {
    montar()
    marcarPendientes('ABC', 'p1', { 8: 5 })
    act(() => { ocultarPagina() })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(saveRondaLibreScores).toHaveBeenCalledWith(cliente, { codigo: 'ABC', jugadorId: 'p1', delta: { 8: 5 } })
  })

  it('sin nada pendiente: salir no consulta al servidor', async () => {
    const { unmount } = montar()
    act(() => { ocultarPagina() })
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS) })
    expect(saveRondaLibreScores).not.toHaveBeenCalled()
  })

  it('enviarYa: manda lo pendiente sin esperar el debounce (Guardar el último hoyo)', async () => {
    const { result } = montar()
    act(() => { result.current.handleScoreChange('p1', 9, 1) })
    await act(async () => { await result.current.enviarYa() })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS) })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(1)
  })

  it('venía sin señal y sale: el envío del desmontaje NO agenda reenvíos con los golpes viejos de esa pantalla', async () => {
    // Fable PR A: sin esto, a los 30 s / 180 s el timer re-marcaba pendientes los golpes congelados al salir y los
    // reenviaba con secuencia nueva, pisando en el servidor una corrección hecha al volver al scorer.
    saveRondaLibreScores.mockResolvedValue({ error: { message: 'Failed to fetch' } })
    const { result, unmount } = montar()
    act(() => { result.current.handleScoreChange('p1', 9, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 5_000) })
    expect(result.current.pendienteDeEnvio).toBe(true)
    saveRondaLibreScores.mockResolvedValue({ error: null })
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(leerPendientes('ABC')).toEqual({})
    const llamadas = saveRondaLibreScores.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.max(...REENVIO_CONFIRMACION_MS) + 1_000) })
    expect(saveRondaLibreScores.mock.calls.length).toBe(llamadas)
    expect(leerPendientes('ABC')).toEqual({})
  })

  it('quedó «sin enviar» y la cola se vació por otro lado: el siguiente intento apaga el aviso (no queda pegado)', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { message: 'Failed to fetch' } })
    const { result } = montar()
    act(() => { result.current.handleScoreChange('p1', 9, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 5_000) })
    expect(result.current.pendienteDeEnvio).toBe(true)
    localStorage.clear() // la vació el envío del desmontaje de una visita anterior
    await act(async () => { await result.current.enviarYa() })
    expect(result.current.pendienteDeEnvio).toBe(false)
    expect(result.current.saveStatus).toBe('idle')
    expect(result.current.hasUnsaved).toBe(false)
  })

  it('algo lanza a mitad del envío: no queda en «saving», queda «sin enviar» con reintento', async () => {
    saveRondaLibreScores.mockRejectedValue(new Error('boom'))
    const { result } = montar()
    act(() => { result.current.handleScoreChange('p1', 9, 1) })
    await act(async () => { await result.current.enviarYa().catch(() => {}) })
    expect(result.current.saveStatus).toBe('error')
    expect(result.current.pendienteDeEnvio).toBe(true)
  })

  it('lanza DESPUÉS de que todo entró: sin barra de error fija y el guardado se cuenta', async () => {
    const { result } = montar()
    act(() => { result.current.handleScoreChange('p1', 9, 1) })
    vi.mocked(haptic).mockImplementationOnce(() => { throw new Error('boom') })
    await act(async () => { await result.current.enviarYa() })
    expect(leerPendientes('ABC')).toEqual({})
    expect(result.current.saveStatus).toBe('idle')
    expect(result.current.pendienteDeEnvio).toBe(false)
    expect(result.current.guardados).toBe(1)
  })
})
