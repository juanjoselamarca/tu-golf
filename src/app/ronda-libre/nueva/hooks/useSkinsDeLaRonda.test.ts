import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

// El interruptor se fuerza por test: Skins queda probado abierto (lo abre el PR del scorer) y cerrado (hoy).
const interruptor = vi.hoisted(() => ({ abierto: true }))
vi.mock('@/lib/auth/skins-libre-abierto', () => ({ get SKINS_LIBRE_ABIERTO() { return interruptor.abierto } }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const lectura = vi.hoisted(() => ({ impl: vi.fn() }))
vi.mock('@/lib/data/skins-ronda-nueva', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/data/skins-ronda-nueva')>()),
  contextoSkinsDeRondaNueva: (...a: unknown[]) => lectura.impl(...a),
}))

import { useSkinsDeLaRonda, type RondaDelSkinsEnElFormulario } from './useSkinsDeLaRonda'
import { PROBLEMA_SKINS_CARGANDO } from './skins-del-formulario'
import { MENSAJE_SKINS_SIN_DATOS_DE_CANCHA } from '@/lib/data/skins-ronda-nueva'

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
  afterEach(() => { interruptor.abierto = true; lectura.impl.mockReset() })

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

  it('sin señal: avisa tras los reintentos y se arregla solo cuando vuelve', async () => {
    let n = 0
    lectura.impl.mockImplementation(async () => {
      n++
      if (n <= 3) throw new Error('sin señal')
      return contextoCon([12, 20])()
    })
    const { result } = renderHook(() => useSkinsDeLaRonda(true, RONDA, [0, 30]))
    act(() => result.current.elegir())
    await waitFor(() => expect(result.current.problema?.detalle).toBe(MENSAJE_SKINS_SIN_DATOS_DE_CANCHA))
    await waitFor(() => expect(result.current.problema).toBeNull())
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
