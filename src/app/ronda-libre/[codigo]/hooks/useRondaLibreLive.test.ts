import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { LoadRondaResult } from '@/app/ronda-libre/[codigo]/types'

const loadRondaLibre = vi.fn<(codigo: string) => Promise<LoadRondaResult>>()
const loadHcpConSesion = vi.fn()
vi.mock('@/lib/data/ronda-libre-live-api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/data/ronda-libre-live-api')>()
  return { ...real, loadRondaLibre: (c: string) => loadRondaLibre(c), loadHcpConSesion: (c: string) => loadHcpConSesion(c) }
})
const notifyScoreEvent = vi.fn()
vi.mock('@/lib/push-notifications', () => ({
  notifyScoreEvent: (...a: unknown[]) => notifyScoreEvent(...a),
  getNotifPrefs: () => ({ spectator: true }),
}))

import { useRondaLibreLive, INTERVALO_EN_VIVO_S } from './useRondaLibreLive'
import { vistaPublica } from '@/lib/data/tournaments/vista-publica'

/** Lo que la ruta pública declara para una ronda neto (regla canónica). */
const VISTA_NETO = vistaPublica({ visorConSesion: false, caminoRondaLibre: true, modoJuego: 'neto', formatoJuego: 'stroke_play' })
const VISTA_GROSS = vistaPublica({ visorConSesion: false, caminoRondaLibre: true, modoJuego: 'gross', formatoJuego: 'stroke_play' })

const ok = (scoresAna: Record<string, number>, estado = 'en_curso', edadSegundos = 0): LoadRondaResult => ({
  status: 'ok',
  ronda: {
    id: 'r1', codigo: 'ABC', course_name: 'Los Leones', course_id: null, tees: 'azul', holes: 18, hoyo_inicio: 1,
    fecha: '2026-10-08', estado, modo_juego: 'gross', formato_juego: 'stroke_play',
    ronda_libre_jugadores: [{ id: 'j1', nombre: 'Ana', user_id: null, scores: scoresAna, handicap: 10, tees: null }],
  } as never,
  parMap: { 1: 4, 2: 4 }, siMap: { 1: 1, 2: 2 }, courseHcpMap: { j1: 10 }, displayHcpMap: { j1: 10 },
  sinIndice: [], equipos: [], edadSegundos,
})

async function avanzar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('useRondaLibreLive (polling, sin Realtime)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    loadRondaLibre.mockReset()
    loadHcpConSesion.mockReset()
    loadHcpConSesion.mockResolvedValue({ status: 'sin-sesion' })
    notifyScoreEvent.mockReset()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })
  afterEach(() => { vi.useRealTimers() })

  it('el GWI se recalcula SÓLO cuando cambian los golpes (no en cada consulta)', async () => {
    const onRefresh = vi.fn()
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }))
    const { result } = renderHook(() => useRondaLibreLive('ABC', onRefresh))
    await avanzar(0)
    expect(result.current.ronda?.ronda_libre_jugadores[0].scores).toEqual({ 1: 4 })
    // Dos consultas más sin cambios: ni GWI ni notificaciones.
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(loadRondaLibre).toHaveBeenCalledTimes(3)
    expect(onRefresh).not.toHaveBeenCalled()
    // Llega un birdie: el espectador lo ve sin recargar, se recalcula el GWI y se notifica.
    loadRondaLibre.mockResolvedValue(ok({ 1: 4, 2: 3 }))
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(result.current.ronda?.ronda_libre_jugadores[0].scores).toEqual({ 1: 4, 2: 3 })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(notifyScoreEvent).toHaveBeenCalledWith('Ana', 'birdie', 'Birdie en hoyo 2', '/ronda-libre/ABC')
  })

  it('la primera carga no notifica lo que ya pasó', async () => {
    loadRondaLibre.mockResolvedValue(ok({ 1: 2, 2: 3 }))
    renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(notifyScoreEvent).not.toHaveBeenCalled()
  })

  it('corte de red en la primera carga → pantalla de reintento (no "no encontrada"), y se recupera solo', async () => {
    loadRondaLibre.mockResolvedValue({ status: 'transient' })
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.fetchError).toBe(true)
    expect(result.current.notFound).toBe(false)
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }))
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(result.current.fetchError).toBe(false)
    expect(result.current.ronda).not.toBeNull()
  })

  it('un corte con datos ya en pantalla los conserva', async () => {
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }))
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    loadRondaLibre.mockResolvedValue({ status: 'transient' })
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(result.current.fetchError).toBe(false)
    expect(result.current.ronda?.ronda_libre_jugadores[0].scores).toEqual({ 1: 4 })
  })

  it('ronda finalizada o inexistente: deja de consultar', async () => {
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }, 'finalizada'))
    renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    await avanzar(60_000)
    expect(loadRondaLibre).toHaveBeenCalledTimes(1)

    loadRondaLibre.mockReset()
    loadRondaLibre.mockResolvedValue({ status: 'not_found' })
    const { result } = renderHook(() => useRondaLibreLive('NOPE'))
    await avanzar(0)
    await avanzar(60_000)
    expect(result.current.notFound).toBe(true)
    expect(loadRondaLibre).toHaveBeenCalledTimes(1)
  })

  it('privacidad: el CH de un jugador con cuenta sin índice en la tarjeta se pide a la ruta privada UNA vez; sin sesión queda sinIndice', async () => {
    const conCuenta = () => {
      const r = ok({ 1: 4 }) as Extract<LoadRondaResult, { status: 'ok' }>
      return { ...r, ronda: { ...r.ronda, ronda_libre_jugadores: [{ ...r.ronda.ronda_libre_jugadores[0], user_id: 'u1', handicap: null }] } as never, courseHcpMap: { j1: 0 }, displayHcpMap: { j1: 0 }, sinIndice: ['j1'] }
    }
    // Sin sesión: la privada responde null (401) → queda lo público.
    loadRondaLibre.mockResolvedValue(conCuenta())
    const anon = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(anon.result.current.sinIndice).toEqual(['j1'])
    expect(anon.result.current.courseHcpMap.j1).toBe(0)
    anon.unmount()
    // Con sesión: manda la privada; se pide una sola vez aunque haya más polls.
    loadHcpConSesion.mockReset()
    loadHcpConSesion.mockResolvedValue({ status: 'ok', data: { courseHcpMap: { j1: 11 }, displayHcpMap: { j1: 11 }, sinIndice: [] } })
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(loadHcpConSesion).toHaveBeenCalledTimes(1)
    expect(result.current.courseHcpMap.j1).toBe(11)
    expect(result.current.sinIndice).toEqual([])
  })

  it('ronda NETO pública (soloBruto): anónimo ve sólo gross con aviso; con sesión ve el neto (handicaps de vuelta)', async () => {
    const r0 = ok({ 1: 4 }) as Extract<LoadRondaResult, { status: 'ok' }>
    const neto = { ...r0, ronda: { ...r0.ronda, modo_juego: 'neto', ronda_libre_jugadores: [{ ...r0.ronda.ronda_libre_jugadores[0], handicap: null }] } as never, courseHcpMap: {}, displayHcpMap: {}, sinIndice: [], vista: VISTA_NETO }
    loadRondaLibre.mockResolvedValue(neto)
    // Anónimo: la privada responde 401.
    const anon = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(anon.result.current.vistaVisor).toMatchObject({ soloBruto: true, modo: 'gross' })
    expect(anon.result.current.errorNeto).toBe(false)
    expect(anon.result.current.loading).toBe(false)
    expect(anon.result.current.courseHcpMap).toEqual({})
    anon.unmount()
    // Con sesión: neto completo.
    loadHcpConSesion.mockReset()
    loadHcpConSesion.mockResolvedValue({ status: 'ok', data: { courseHcpMap: { j1: 11 }, displayHcpMap: { j1: 12 }, sinIndice: [], handicapPorJugador: { j1: 10 }, handicapPorEquipo: {} } })
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.vistaVisor).toBeNull()
    expect(result.current.ronda?.modo_juego).toBe('neto')
    expect(result.current.ronda?.ronda_libre_jugadores[0].handicap).toBe(10)
    expect(result.current.courseHcpMap.j1).toBe(11)
  })

  it('ronda NETO y la privada falla: gross con aviso de error; reintenta con backoff (10 s, 20 s…), no en cada poll', async () => {
    const r0 = ok({ 1: 4 }) as Extract<LoadRondaResult, { status: 'ok' }>
    loadRondaLibre.mockResolvedValue({ ...r0, ronda: { ...r0.ronda, modo_juego: 'neto' } as never, vista: VISTA_NETO })
    loadHcpConSesion.mockResolvedValue({ status: 'error' })
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.vistaVisor?.soloBruto).toBe(true)
    expect(result.current.errorNeto).toBe(true)
    expect(loadHcpConSesion).toHaveBeenCalledTimes(1)
    await avanzar(10_000)
    expect(loadHcpConSesion).toHaveBeenCalledTimes(2) // 1er reintento a los 10 s
    await avanzar(10_000)
    expect(loadHcpConSesion).toHaveBeenCalledTimes(2) // el 2º espera 20 s, aunque hubo polls
    loadHcpConSesion.mockResolvedValue({ status: 'ok', data: { courseHcpMap: { j1: 11 }, displayHcpMap: { j1: 11 }, sinIndice: [] } })
    await avanzar(10_000)
    expect(loadHcpConSesion).toHaveBeenCalledTimes(3)
    expect(result.current.vistaVisor).toBeNull()
  })

  it('ronda NETO sin jugadores: no se queda cargando para siempre', async () => {
    const r0 = ok({}) as Extract<LoadRondaResult, { status: 'ok' }>
    loadRondaLibre.mockResolvedValue({ ...r0, ronda: { ...r0.ronda, modo_juego: 'neto', ronda_libre_jugadores: [] } as never, vista: VISTA_NETO })
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.loading).toBe(false)
    expect(loadHcpConSesion).toHaveBeenCalledTimes(1)
  })

  it('ronda NETO: el aviso de líder se calcula en NETO con sesión, y no se da en gross sin sesión', async () => {
    // Ana 5 golpes (hcp 18 → neto mejor), Bea 4 golpes (hcp 0). En gross lidera Bea; en neto, Ana.
    const dos = (scoresBea: Record<string, number>) => {
      const r0 = ok({ 1: 5 }) as Extract<LoadRondaResult, { status: 'ok' }>
      const base = r0.ronda.ronda_libre_jugadores[0]
      return {
        ...r0,
        ronda: { ...r0.ronda, modo_juego: 'neto', ronda_libre_jugadores: [
          { ...base, id: 'j1', nombre: 'Ana', handicap: null, scores: { 1: 5 } },
          { ...base, id: 'j2', nombre: 'Bea', handicap: null, scores: scoresBea },
        ] } as never,
        courseHcpMap: {}, displayHcpMap: {}, sinIndice: [], vista: VISTA_NETO,
      }
    }
    // Sin sesión: Bea pasa adelante en gross → NO se avisa de líder.
    loadRondaLibre.mockResolvedValue(dos({}))
    const anon = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    loadRondaLibre.mockResolvedValue(dos({ 1: 4 }))
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(notifyScoreEvent.mock.calls.filter(c => c[1] === 'leader_change')).toEqual([])
    anon.unmount()
    notifyScoreEvent.mockReset()
    // Con sesión: Ana (CH 36: 2 golpes por hoyo) neto −1 lidera aunque Bea haga par.
    // En gross Bea pasaría adelante (E vs +1): eso NO es un cambio de líder de la ronda.
    loadHcpConSesion.mockResolvedValue({ status: 'ok', data: { courseHcpMap: { j1: 36, j2: 0 }, displayHcpMap: { j1: 36, j2: 0 }, sinIndice: [], handicapPorJugador: { j1: 36, j2: 0 } } })
    loadRondaLibre.mockResolvedValue(dos({}))
    renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    await avanzar(INTERVALO_EN_VIVO_S * 1000) // ya con los handicaps de la sesión
    loadRondaLibre.mockResolvedValue(dos({ 1: 4 }))
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(notifyScoreEvent.mock.calls.filter(c => c[1] === 'leader_change')).toEqual([])
    // Y si Bea hace birdie (neto −1 vs Ana −1 → Bea no supera), tampoco; con eagle (−2) sí, en neto.
    loadRondaLibre.mockResolvedValue(dos({ 1: 2 }))
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(notifyScoreEvent.mock.calls.filter(c => c[1] === 'leader_change').map(c => c[0])).toEqual(['Bea'])
  })

  it('ronda NETO con sesión: el PRIMER cambio de líder se avisa (el líder neto se siembra al llegar la sesión)', async () => {
    const r0 = ok({ 1: 5 }) as Extract<LoadRondaResult, { status: 'ok' }>
    const base = r0.ronda.ronda_libre_jugadores[0]
    const dos = (scoresBea: Record<string, number>) => ({
      ...r0,
      ronda: { ...r0.ronda, modo_juego: 'neto', ronda_libre_jugadores: [
        { ...base, id: 'j1', nombre: 'Ana', handicap: null, scores: { 1: 5 } },
        { ...base, id: 'j2', nombre: 'Bea', handicap: null, scores: scoresBea },
      ] } as never,
      courseHcpMap: {}, displayHcpMap: {}, sinIndice: [], vista: VISTA_NETO,
    })
    loadHcpConSesion.mockResolvedValue({ status: 'ok', data: { courseHcpMap: { j1: 36, j2: 0 }, displayHcpMap: { j1: 36, j2: 0 }, sinIndice: [], handicapPorJugador: { j1: 36, j2: 0 } } })
    loadRondaLibre.mockResolvedValue(dos({}))
    renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0) // carga + sesión (Ana lidera en neto)
    // UN solo cambio: Bea hace eagle (neto −2) y pasa a Ana (neto −1).
    loadRondaLibre.mockResolvedValue(dos({ 1: 2 }))
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(notifyScoreEvent.mock.calls.filter(c => c[1] === 'leader_change').map(c => c[0])).toEqual(['Bea'])
  })

  it('ronda GROSS: anónimo ve la vista pública sin neto (sin aviso de bruta); con sesión, todo', async () => {
    const r0 = ok({ 1: 4 }) as Extract<LoadRondaResult, { status: 'ok' }>
    loadRondaLibre.mockResolvedValue({ ...r0, vista: VISTA_GROSS })
    const anon = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(anon.result.current.vistaVisor).toMatchObject({ sinNeto: true, soloBruto: false })
    expect(anon.result.current.loading).toBe(false) // gross: no espera a la privada
    anon.unmount()
    loadHcpConSesion.mockResolvedValue({ status: 'ok', data: { courseHcpMap: { j1: 10 }, displayHcpMap: { j1: 10 }, sinIndice: [] } })
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.vistaVisor).toBeNull()
    expect(loadHcpConSesion).toHaveBeenCalledTimes(2) // una por carga de página
  })

  it('"actualizado hace" cuenta lo que el dato estuvo en el CDN (header Age)', async () => {
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }, 'en_curso', 8))
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.timeSinceUpdate).toBe('Actualizado hace 8s')
  })
})
