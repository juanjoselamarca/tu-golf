import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { useGrupoScoreSave } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreSave'

const saveRondaLibreScores = vi.fn(async () => ({ error: null as unknown }))
vi.mock('@/lib/data/ronda-libre-scores', () => ({
  saveRondaLibreScores: (...a: unknown[]) => saveRondaLibreScores(...(a as [])),
  saveRondaEquiposScores: vi.fn(async () => ({ error: null })),
  ERRCODE_SIN_RESPUESTA: 'SIN_RESPUESTA',
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const addToast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ addToast: (...a: unknown[]) => addToast(...a) }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: vi.fn() }))
const saveGroupScores = vi.fn()
// Almacenamiento REAL (pendientes incluidos) con espía sobre el respaldo del grupo.
vi.mock('@/lib/ronda/score-storage', async (orig) => {
  const real = await orig<typeof import('@/lib/ronda/score-storage')>()
  return { ...real, saveGroupScores: (...a: Parameters<typeof real.saveGroupScores>) => { saveGroupScores(...a); real.saveGroupScores(...a) } }
})

const ronda = {
  id: 'r1', codigo: 'ABC', course_name: 'X', course_id: null, tees: 'azul', holes: 9, fecha: '2026-09-30', estado: 'en_curso',
  modo_juego: 'gross', formato_juego: 'stroke_play', hoyo_inicio: 1,
  ronda_libre_jugadores: [
    { id: 'p1', nombre: 'Ana', user_id: 'u1', scores: {} },
    { id: 'p2', nombre: 'Beto', user_id: null, scores: {} },
  ],
} as never
const PAR = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 }

function montar(
  inicial: Record<string, Record<number, number>> = { p1: {}, p2: {} },
  hole = 1,
  teamEquipos?: { id: string; scores: Record<string, number> }[],
) {
  return renderHook(() => {
    const [scores, setScores] = useState(inicial)
    const [currentHole, setCurrentHole] = useState(hole)
    const save = useGrupoScoreSave({ ronda, codigo: 'ABC', currentHole, scores, setScores, parMap: PAR, teamEquipos })
    return { scores, setCurrentHole, save }
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  saveRondaLibreScores.mockReset()
  saveRondaLibreScores.mockResolvedValue({ error: null })
  addToast.mockClear()
  saveGroupScores.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('useGrupoScoreSave', () => {
  it('primer +: parte del par, respalda local y guarda ese jugador 500ms después (A2)', async () => {
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    expect(result.current.scores.p1[1]).toBe(5)
    expect(result.current.save.hasUnsaved).toBe(true)
    expect(saveGroupScores).toHaveBeenCalledWith('ABC', expect.objectContaining({ p1: { 1: 5 } }))
    expect(saveRondaLibreScores).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(1)
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p1', delta: { 1: 5 } })
    expect(result.current.save.saveStatus).toBe('saved')
    expect(result.current.save.hasUnsaved).toBe(false)
  })

  it('A1 anti-toque: cambiar un score existente pide 2 taps; el pending expira a los 2s', () => {
    const { result } = montar({ p1: { 1: 5 }, p2: {} })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) })
    expect(result.current.scores.p1[1]).toBe(5) // no cambió
    expect(result.current.save.pendingScoreConfirm).toEqual({ jugadorId: 'p1', hole: 1 })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.save.pendingScoreConfirm).toBeNull()
    // Otra vez: 1er tap arma, 2º tap aplica.
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) })
    expect(result.current.scores.p1[1]).toBe(4)
    expect(result.current.save.pendingScoreConfirm).toBeNull()
  })

  it('A3 edit window: tras confirmar, 3s de correcciones libres sobre el mismo jugador/hoyo', () => {
    const { result } = montar({ p1: { 1: 9 }, p2: {} })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) }) // arma
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) }) // confirma → 8
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) }) // libre → 7
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) }) // libre → 6
    expect(result.current.scores.p1[1]).toBe(6)
    act(() => { vi.advanceTimersByTime(3000) })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) }) // ventana cerrada → pide confirmar
    expect(result.current.scores.p1[1]).toBe(6)
    expect(result.current.save.pendingScoreConfirm).toEqual({ jugadorId: 'p1', hole: 1 })
  })

  it('otro jugador no hereda la confirmación pendiente', () => {
    const { result } = montar({ p1: { 1: 5 }, p2: { 1: 5 } })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    act(() => { result.current.save.handleScoreChange('p2', 1, 1) })
    expect(result.current.scores.p1[1]).toBe(5)
    expect(result.current.scores.p2[1]).toBe(5)
    expect(result.current.save.pendingScoreConfirm).toEqual({ jugadorId: 'p2', hole: 1 })
  })

  it('cambiar de hoyo limpia la confirmación pendiente', () => {
    const { result } = montar({ p1: { 1: 5 }, p2: {} })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    expect(result.current.save.pendingScoreConfirm).not.toBeNull()
    act(() => { result.current.setCurrentHole(2) })
    expect(result.current.save.pendingScoreConfirm).toBeNull()
  })

  it('taps sucesivos → un solo save con el último valor (debounce rebatable)', async () => {
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    act(() => { vi.advanceTimersByTime(200) })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    act(() => { vi.advanceTimersByTime(200) })
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(1)
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p1', delta: { 1: 7 } })
  })

  it('marcador único: anotar a Ana y a Beto en < 500ms guarda a LOS DOS (debounce por jugador)', async () => {
    // Prueba de fuego Los Leones 04-oct: un solo timer compartido cancelaba el save del
    // primer jugador; en el último hoyo (sin Siguiente) el bogey de B no llegaba a la BD.
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    act(() => { result.current.save.handleScoreChange('p2', 1, -1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p1', delta: { 1: 5 } })
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p2', delta: { 1: 3 } })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(2)
  })

  it('clamp 1..15 (GOLPES_MAX_POR_HOYO, lo que el "+" del scorer permite)', () => {
    const { result } = montar({ p1: { 1: 1 }, p2: { 1: 15 } })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) })
    act(() => { result.current.save.handleScoreChange('p1', 1, -1) })
    act(() => { result.current.save.handleScoreChange('p2', 1, 1) })
    act(() => { result.current.save.handleScoreChange('p2', 1, 1) })
    expect(result.current.scores.p1[1]).toBe(1)
    expect(result.current.scores.p2[1]).toBe(15)
  })

  it('error puntual: 3 intentos, queda PENDIENTE con el aviso fijo del scorer (sin toast que tape "Siguiente")', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: '08006' } })
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500 + 400 + 800 + 100) })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(3)
    expect(result.current.save.saveStatus).toBe('error')
    expect(result.current.save.pendienteDeEnvio).toBe(true)
    expect(addToast).not.toHaveBeenCalled()
  })

  it('saveAllScores: respalda local, guarda a todos y, offline, no toca el servidor', async () => {
    const { result } = montar({ p1: { 1: 4 }, p2: { 1: 5 } })
    await act(async () => { await result.current.save.saveAllScores({ p1: { 1: 4 }, p2: { 1: 5 } }) })
    expect(saveGroupScores).toHaveBeenCalledWith('ABC', { p1: { 1: 4 }, p2: { 1: 5 } })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(2)
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p2', delta: { 1: 5 } })
    expect(result.current.save.saveStatus).toBe('saved')

    saveRondaLibreScores.mockClear()
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await act(async () => { await result.current.save.saveAllScores({ p1: { 1: 4, 2: 4 }, p2: {} }) })
    expect(saveRondaLibreScores).not.toHaveBeenCalled()
    expect(result.current.save.saveStatus).toBe('error')
    onLine.mockRestore()
  })
})

describe('useGrupoScoreSave — sincronización automática (caída 04-oct)', () => {
  it('si el guardado falla, reintenta SOLO cada 15 s hasta lograrlo, con un único aviso', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: 'SIN_RESPUESTA' } })
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500 + 400 + 800) }) // debounce + 3 intentos
    expect(result.current.save.saveStatus).toBe('error')
    expect(result.current.save.pendienteDeEnvio).toBe(true)
    expect(addToast).not.toHaveBeenCalled() // el aviso es el banner fijo del scorer

    // Sigue caído: el reintento automático falla y sigue pendiente.
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000 + 1_300) })
    expect(result.current.save.pendienteDeEnvio).toBe(true)

    // Vuelve el servidor: el siguiente reintento envía todas las tarjetas y queda al día.
    saveRondaLibreScores.mockResolvedValue({ error: null })
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000 + 1_300) })
    expect(result.current.save.pendienteDeEnvio).toBe(false)
    expect(result.current.save.hasUnsaved).toBe(false)
    expect(saveRondaLibreScores).toHaveBeenLastCalledWith({}, expect.objectContaining({ codigo: 'ABC' }))
  })

  it('al volver la red (evento online) sincroniza sin esperar el intervalo', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: 'SIN_RESPUESTA' } })
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p2', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1_700) })
    expect(result.current.save.pendienteDeEnvio).toBe(true)
    saveRondaLibreScores.mockResolvedValue({ error: null })
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(10) })
    expect(result.current.save.pendienteDeEnvio).toBe(false)
  })
})

describe('useGrupoScoreSave — pendientes de envío', () => {
  it('si falló el de Ana y después sale bien el de Beto, lo de Ana SIGUE pendiente (y se reintenta)', async () => {
    saveRondaLibreScores.mockImplementation((async (_c: unknown, input: { jugadorId: string }) =>
      input.jugadorId === 'p1' ? { error: { code: 'SIN_RESPUESTA' } } : { error: null }) as never)
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    act(() => { result.current.save.handleScoreChange('p2', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(result.current.save.pendienteDeEnvio).toBe(true)
    expect(result.current.save.hasUnsaved).toBe(true)

    saveRondaLibreScores.mockImplementation(async () => ({ error: null }))
    await act(async () => { await vi.advanceTimersByTimeAsync(15_100) })
    expect(result.current.save.pendienteDeEnvio).toBe(false)
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, expect.objectContaining({ jugadorId: 'p1', delta: { 1: 5 } }))
  })
})

describe('useGrupoScoreSave — revisión Fable', () => {
  it('sin red (navigator.onLine=false) marca "sin enviar" para que el aviso y la sincronización arranquen', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = montar()
    await act(async () => { await result.current.save.saveAllScores({ p1: { 1: 4 }, p2: { 1: 4 } }) })
    expect(result.current.save.pendienteDeEnvio).toBe(true)
    onLine.mockRestore()
  })

  it('golpes de equipo pendientes viajan por su RPC en el mismo envío', async () => {
    const { saveRondaEquiposScores } = await import('@/lib/data/ronda-libre-scores')
    const { marcarPendientes, hayPendientes } = await import('@/lib/ronda/score-storage')
    marcarPendientes('ABC', 'eq:e1', { 3: 4 })
    const { result } = montar()
    await act(async () => { await result.current.save.saveAllScores() })
    expect(saveRondaEquiposScores).toHaveBeenCalledWith({}, expect.objectContaining({ equipoId: 'e1', delta: { 3: 4 } }))
    expect(hayPendientes('ABC')).toBe(false)
  })

  it('dos envíos a la vez no se pisan: el segundo espera y sale después con lo último', async () => {
    let soltar: () => void = () => {}
    saveRondaLibreScores.mockImplementationOnce(() => new Promise(r => { soltar = () => r({ error: null }) }) as never)
    const { result } = montar()
    let p1: Promise<void> = Promise.resolve()
    let p2: Promise<void> = Promise.resolve()
    act(() => { p1 = result.current.save.saveAllScores({ p1: { 1: 4 }, p2: {} }) })
    await act(async () => { p2 = result.current.save.saveAllScores({ p1: { 1: 4 }, p2: { 1: 5 } }); await vi.advanceTimersByTimeAsync(10) })
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(1) // el segundo no salió en paralelo
    await act(async () => { soltar(); await p1; await p2 })
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, expect.objectContaining({ jugadorId: 'p2', delta: { 1: 5 } }))
  })

  it('ronda finalizada en otro dispositivo (P0002): un aviso y NO se reintenta para siempre', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: 'P0002' } })
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'La ronda ya fue finalizada' }))
    expect(result.current.save.pendienteDeEnvio).toBe(false)
    // No se informa como guardado y la página navega al resultado.
    expect(result.current.save.saveStatus).toBe('error')
    expect(result.current.save.hasUnsaved).toBe(true)
    expect(result.current.save.rondaCerrada).toBe(true)
    const llamadas = saveRondaLibreScores.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(saveRondaLibreScores.mock.calls.length).toBe(llamadas)
  })

  it('tras una caída reenvía los valores actuales (una escritura vencida puede aterrizar tarde)', async () => {
    saveRondaLibreScores.mockResolvedValue({ error: { code: 'SIN_RESPUESTA' } })
    const { result } = montar()
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    saveRondaLibreScores.mockResolvedValue({ error: null })
    await act(async () => { await vi.advanceTimersByTimeAsync(15_100) })
    expect(result.current.save.pendienteDeEnvio).toBe(false)
    saveRondaLibreScores.mockClear()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_100) })
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, expect.objectContaining({ jugadorId: 'p1', delta: expect.objectContaining({ 1: 5 }) }))
  })

  it('Finalizar con un envío en vuelo ESPERA a que termine (no avisa "sin conexión" con el servidor vivo)', async () => {
    const { saveRondaEquiposScores } = await import('@/lib/data/ronda-libre-scores')
    const { marcarPendientes, hayPendientes } = await import('@/lib/ronda/score-storage')
    let soltar: () => void = () => {}
    saveRondaLibreScores.mockImplementationOnce(() => new Promise(r => { soltar = () => r({ error: null }) }) as never)
    const { result } = montar()
    let enVuelo: Promise<void> = Promise.resolve()
    act(() => { enVuelo = result.current.save.saveAllScores({ p1: { 1: 4 }, p2: {} }) })
    // Tap al score de equipo del 18 mientras viaja el envío anterior; después, Finalizar.
    marcarPendientes('ABC', 'eq:e1', { 9: 5 })
    let resuelto = false
    let fin: Promise<void> = Promise.resolve()
    act(() => { fin = result.current.save.saveAllScores().then(() => { resuelto = true }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(resuelto).toBe(false) // no vuelve antes de que el envío en vuelo termine
    await act(async () => { soltar(); await enVuelo; await fin })
    expect(saveRondaEquiposScores).toHaveBeenCalledWith({}, expect.objectContaining({ equipoId: 'e1', delta: { 9: 5 } }))
    expect(hayPendientes('ABC')).toBe(false)
  })

  it('tras una caída el reenvío de confirmación incluye los scores de EQUIPO (scramble/foursome)', async () => {
    const { saveRondaEquiposScores } = await import('@/lib/data/ronda-libre-scores')
    saveRondaLibreScores.mockResolvedValue({ error: { code: 'SIN_RESPUESTA' } })
    const { result } = montar({ p1: {}, p2: {} }, 1, [{ id: 'e1', scores: { '1': 3, '2': 4 } }])
    act(() => { result.current.save.handleScoreChange('p1', 1, 1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    saveRondaLibreScores.mockResolvedValue({ error: null })
    await act(async () => { await vi.advanceTimersByTimeAsync(15_100) })
    vi.mocked(saveRondaEquiposScores).mockClear()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_100) })
    expect(saveRondaEquiposScores).toHaveBeenCalledWith({}, expect.objectContaining({ equipoId: 'e1', delta: { '1': 3, '2': 4 } }))
  })
})
