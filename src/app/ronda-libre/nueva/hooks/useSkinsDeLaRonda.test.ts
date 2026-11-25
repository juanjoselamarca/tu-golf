import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

// El interruptor se fuerza por test: Skins queda probado abierto (lo abre el PR del scorer) y cerrado (hoy).
const interruptor = vi.hoisted(() => ({ abierto: true }))
vi.mock('@/lib/auth/skins-libre-abierto', () => ({ get SKINS_LIBRE_ABIERTO() { return interruptor.abierto } }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
import { captureError } from '@/lib/error-tracking'
const lectura = vi.hoisted(() => ({ impl: vi.fn() }))
vi.mock('@/lib/data/skins-ronda-nueva', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/data/skins-ronda-nueva')>()),
  contextoSkinsDeRondaNueva: (...a: unknown[]) => lectura.impl(...a),
}))

import { useSkinsDeLaRonda, type RondaDelSkinsEnElFormulario } from './useSkinsDeLaRonda'
import { PROBLEMA_SKINS_CARGANDO } from './skins-del-formulario'
import { FalloDelContextoSkins, MENSAJE_SKINS_SIN_DATOS_DE_CANCHA, mensajeSkinsSinRating } from '@/lib/data/skins-ronda-nueva'

const SIN_ESPERA = [0, 0]
const hoyos = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, si: i + 1 }))
const RONDA: RondaDelSkinsEnElFormulario = {
  courseId: 'c1', holes: 18, hoyoInicio: 1, recorridos: [], tees: 'blanco', modo: 'neto', adminMode: true, filasSinNombre: 0,
  jugadores: [{ nombre: 'Juanjo', indice: 12 }, { nombre: 'Ross', indice: null }],
}
const contextoCon = (chs: (number | null)[]) => async () => ({
  jugadores: chs.map(courseHandicap => ({ nombre: '', courseHandicap })), hoyos,
})

describe('useSkinsDeLaRonda', () => {
  afterEach(() => { interruptor.abierto = true; lectura.impl.mockReset(); vi.mocked(captureError).mockClear() })

  it('cerrado (SKINS_LIBRE_ABIERTO = false): no se puede elegir ni con permiso, y no lee la cancha', async () => {
    interruptor.abierto = false
    const { result } = renderHook(() => useSkinsDeLaRonda(true, RONDA, SIN_ESPERA))
    act(() => result.current.elegir())
    expect(result.current.puedeElegir).toBe(false)
    expect(result.current.skins).toBeNull()
    expect(result.current.paraEnviar).toBeNull()
    expect(lectura.impl).not.toHaveBeenCalled()
  })

  it('sin permiso: tampoco (aunque esté abierto)', () => {
    const { result } = renderHook(() => useSkinsDeLaRonda(false, RONDA, SIN_ESPERA))
    act(() => result.current.elegir())
    expect(result.current.skins).toBeNull()
  })

  it('elegir abre con los defaults; mientras lee la cancha, «cargando»; después, el bloqueo del motor con el nombre', async () => {
    lectura.impl.mockImplementation(contextoCon([12, null]))
    const { result } = renderHook(() => useSkinsDeLaRonda(true, RONDA, SIN_ESPERA))
    expect(lectura.impl).not.toHaveBeenCalled()
    act(() => result.current.elegir())
    expect(result.current.skins).toMatchObject({ modo: 'neto', hcpPct: 100, pozoPorJugador: 0 })
    expect(result.current.problema).toBe(PROBLEMA_SKINS_CARGANDO)
    await waitFor(() => expect(result.current.problema?.detalle).toContain('Ross no tiene hándicap'))
    expect(result.current.paraEnviar?.problema).toBe(result.current.problema)
  })

  it('todo bien: sin problema y viaja con el modo de la ronda', async () => {
    lectura.impl.mockImplementation(contextoCon([12, 20]))
    const { result } = renderHook(() => useSkinsDeLaRonda(true, { ...RONDA, modo: 'gross' }, SIN_ESPERA))
    act(() => result.current.elegir())
    await waitFor(() => expect(result.current.problema).toBeNull())
    expect(result.current.paraEnviar?.reglasJuego.modo).toBe('gross')
  })

  it('el aviso sale en el PRIMER fallo, el reintento sigue por detrás y el éxito lo limpia (sin reportar)', async () => {
    let soltar: (v: unknown) => void = () => {}
    lectura.impl
      .mockImplementationOnce(async () => { throw new Error('sin señal') })
      .mockImplementationOnce(() => new Promise(r => { soltar = r }))
    const { result } = renderHook(() => useSkinsDeLaRonda(true, RONDA, [0, 0]))
    act(() => result.current.elegir())
    await waitFor(() => expect(result.current.problema?.detalle).toBe(MENSAJE_SKINS_SIN_DATOS_DE_CANCHA))
    expect(result.current.enError).toBe(true)
    await waitFor(() => expect(lectura.impl).toHaveBeenCalledTimes(2))
    await act(async () => { soltar(await contextoCon([12, 20])()) })
    await waitFor(() => expect(result.current.problema).toBeNull())
    expect(result.current.enError).toBe(false)
    expect(captureError).not.toHaveBeenCalled()
  })

  it('agotados los intentos: se reporta una vez, se detiene y vuelve a leer cuando vuelve la red', async () => {
    let volvio = false
    lectura.impl.mockImplementation(async () => {
      if (!volvio) throw new Error('sin señal')
      return contextoCon([12, 20])()
    })
    const { result } = renderHook(() => useSkinsDeLaRonda(true, RONDA, [0, 0]))
    act(() => result.current.elegir())
    await waitFor(() => expect(captureError).toHaveBeenCalledTimes(1))
    await new Promise(r => setTimeout(r, 30))
    expect(lectura.impl).toHaveBeenCalledTimes(3)
    expect(result.current.problema?.detalle).toBe(MENSAJE_SKINS_SIN_DATOS_DE_CANCHA)
    volvio = true
    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(result.current.problema).toBeNull())
    expect(lectura.impl).toHaveBeenCalledTimes(4)
  })

  it('sin red (navigator.onLine false): avisa sin leer ni programar nada; el evento online lo retoma', async () => {
    lectura.impl.mockImplementation(contextoCon([12, 20]))
    const enLinea = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const { result } = renderHook(() => useSkinsDeLaRonda(true, RONDA, [0, 0]))
      act(() => result.current.elegir())
      await waitFor(() => expect(result.current.enError).toBe(true))
      await new Promise(r => setTimeout(r, 30))
      expect(lectura.impl).not.toHaveBeenCalled()
      enLinea.mockReturnValue(true)
      act(() => { window.dispatchEvent(new Event('online')) })
      await waitFor(() => expect(result.current.problema).toBeNull())
      expect(lectura.impl).toHaveBeenCalledTimes(1)
    } finally {
      enLinea.mockRestore()
    }
  })

  it('«Reintentar» vuelve a leer desde cero tras agotar los intentos', async () => {
    let ok = false
    lectura.impl.mockImplementation(async () => {
      if (!ok) throw new Error('sin señal')
      return contextoCon([12, 20])()
    })
    const { result } = renderHook(() => useSkinsDeLaRonda(true, RONDA, [0, 0]))
    act(() => result.current.elegir())
    await waitFor(() => expect(lectura.impl).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(result.current.enError).toBe(true))
    ok = true
    act(() => result.current.reintentar())
    expect(result.current.problema).toBe(PROBLEMA_SKINS_CARGANDO)
    await waitFor(() => expect(result.current.problema).toBeNull())
  })

  it('con la app en segundo plano no reintenta; al volver, sí', async () => {
    let n = 0
    lectura.impl.mockImplementation(async () => {
      n++
      if (n === 1) throw new Error('sin señal')
      return contextoCon([12, 20])()
    })
    const oculto = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    try {
      const { result } = renderHook(() => useSkinsDeLaRonda(true, RONDA, [0, 0]))
      act(() => result.current.elegir())
      await waitFor(() => expect(result.current.enError).toBe(true))
      await new Promise(r => setTimeout(r, 30))
      expect(lectura.impl).toHaveBeenCalledTimes(1)
      oculto.mockReturnValue(false)
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      await waitFor(() => expect(result.current.problema).toBeNull())
    } finally {
      oculto.mockRestore()
    }
  })

  it('el rating no llegó y después sí: se reintenta igual y termina listo', async () => {
    lectura.impl
      .mockImplementationOnce(async () => { throw new FalloDelContextoSkins(mensajeSkinsSinRating('Blanco'), false) })
      .mockImplementation(contextoCon([12, 20]))
    const { result } = renderHook(() => useSkinsDeLaRonda(true, RONDA, [0, 0]))
    act(() => result.current.elegir())
    await waitFor(() => expect(lectura.impl).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.problema).toBeNull())
    expect(result.current.enError).toBe(false)
  })

  it('el rating no llega nunca: el mensaje del tee sale solo al agotar los intentos', async () => {
    lectura.impl.mockImplementation(async () => { throw new FalloDelContextoSkins(mensajeSkinsSinRating('Blanco'), false) })
    const { result } = renderHook(() => useSkinsDeLaRonda(true, RONDA, [0, 0]))
    act(() => result.current.elegir())
    await waitFor(() => expect(result.current.problema?.detalle).toContain('rating y slope del tee Blanco'))
    expect(lectura.impl).toHaveBeenCalledTimes(3)
  })

  it('el orden de los recorridos es dato: cambiarlo vuelve a leer, y viaja tal cual', async () => {
    lectura.impl.mockImplementation(contextoCon([12, 20]))
    const { result, rerender } = renderHook(
      ({ recorridos }) => useSkinsDeLaRonda(true, { ...RONDA, recorridos }, SIN_ESPERA),
      { initialProps: { recorridos: ['Norte', 'Sur'] } },
    )
    act(() => result.current.elegir())
    await waitFor(() => expect(result.current.problema).toBeNull())
    rerender({ recorridos: ['Sur', 'Norte'] })
    await waitFor(() => expect(lectura.impl).toHaveBeenCalledTimes(2))
    expect(lectura.impl.mock.calls[1][1]).toMatchObject({ recorridos: ['Sur', 'Norte'], modo: 'neto' })
  })

  it('soltar lo saca; una tarjeta sin nombre se avisa primero en Jugadores', async () => {
    lectura.impl.mockImplementation(contextoCon([12, 20]))
    const { result } = renderHook(() => useSkinsDeLaRonda(true, { ...RONDA, filasSinNombre: 1 }, SIN_ESPERA))
    act(() => result.current.elegir())
    await waitFor(() => expect(result.current.problema).toBeNull())
    expect(result.current.problemaEnJugadores).not.toBeNull()
    act(() => result.current.soltar())
    expect(result.current.skins).toBeNull()
    expect(result.current.problemaEnJugadores).toBeNull()
  })
})
