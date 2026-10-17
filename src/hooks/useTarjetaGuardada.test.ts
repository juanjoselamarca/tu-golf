// @vitest-environment jsdom
/**
 * Regresión (dead-end hunter 17-oct-2026):
 *  - "Compartir tarjeta" abría el sheet aunque la publicación fallara: el link
 *    llegaba a un "Tarjeta no encontrada" del otro lado (publishRound se ignoraba).
 *  - Un error de red se mostraba como "No se encontró la ronda", sin reintento.
 *  - El par de la tarjeta salía sólo del catálogo; el de la ronda se ignoraba.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { CargaDeTarjeta } from '@/lib/data/tarjeta-guardada'

const cargar = vi.fn<() => Promise<CargaDeTarjeta>>()
const publicar = vi.fn<() => Promise<boolean>>()
const toast = vi.fn()

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/data/tarjeta-guardada', () => ({ cargarTarjetaGuardada: () => cargar() }))
vi.mock('@/lib/data/rounds', () => ({ publishRound: () => publicar() }))
vi.mock('@/hooks/useToast', () => ({ addToast: (t: unknown) => toast(t) }))

import { useTarjetaGuardada, AVISO_NO_SE_PUBLICO } from './useTarjetaGuardada'

function ok(esDueño: boolean): CargaDeTarjeta {
  return {
    estado: 'ok',
    esDueño,
    hayVisitanteConSesion: esDueño,
    nombreDelJugador: 'Juanjo',
    hoyosDelCatalogo: [4, 4, 3, 5, 4, 3, 4, 4, 5].map((par, i) => ({ numero: i + 1, par, stroke_index: i + 1 })),
    ronda: {
      id: 'r1', user_id: 'u1', course_name: 'Los Leones', course_id: 'c1', total_gross: 39,
      holes_played: 9, played_at: '2026-04-16', tee_color: 'blanco',
      scores: [4, 3, 4, 5, 3, 4, 5, 5, 6],
      // Nueve de vuelta guardado como 1..9: este par manda sobre el del catálogo.
      par_per_hole: { 1: 4, 2: 3, 3: 4, 4: 4, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5 },
      formato_juego: 'stroke_play', modo_juego: 'gross', notes: null,
    },
  }
}

beforeEach(() => {
  cargar.mockReset()
  publicar.mockReset()
  toast.mockReset()
})

describe('useTarjetaGuardada', () => {
  it('arma la tarjeta con el par de la ronda, no el del catálogo', async () => {
    cargar.mockResolvedValue(ok(true))
    const { result } = renderHook(() => useTarjetaGuardada('r1'))
    await waitFor(() => expect(result.current.vista).not.toBeNull())
    expect(result.current.vista!.hoyos.map(h => h.par)).toEqual([4, 3, 4, 4, 3, 4, 4, 5, 5])
    expect(result.current.vista!.vsParLabel).toBe('+3')
    expect(result.current.vista!.golpes['9']).toBe(6)
  })

  it('si la publicación falla NO abre el sheet y avisa', async () => {
    cargar.mockResolvedValue(ok(true))
    publicar.mockResolvedValue(false)
    const { result } = renderHook(() => useTarjetaGuardada('r1'))
    await waitFor(() => expect(result.current.carga).not.toBeNull())
    await act(() => result.current.compartir())
    expect(result.current.shareOpen).toBe(false)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: AVISO_NO_SE_PUBLICO.titulo }))
  })

  it('el dueño publica y recién ahí abre el sheet', async () => {
    cargar.mockResolvedValue(ok(true))
    publicar.mockResolvedValue(true)
    const { result } = renderHook(() => useTarjetaGuardada('r1'))
    await waitFor(() => expect(result.current.carga).not.toBeNull())
    await act(() => result.current.compartir())
    expect(publicar).toHaveBeenCalledTimes(1)
    expect(result.current.shareOpen).toBe(true)
  })

  it('un tercero con el link comparte sin intentar publicar', async () => {
    cargar.mockResolvedValue(ok(false))
    const { result } = renderHook(() => useTarjetaGuardada('r1'))
    await waitFor(() => expect(result.current.carga).not.toBeNull())
    await act(() => result.current.compartir())
    expect(publicar).not.toHaveBeenCalled()
    expect(result.current.shareOpen).toBe(true)
  })

  it('un error de carga se puede reintentar (no es "no existe")', async () => {
    cargar.mockResolvedValueOnce({ estado: 'error' }).mockResolvedValueOnce(ok(true))
    const { result } = renderHook(() => useTarjetaGuardada('r1'))
    await waitFor(() => expect(result.current.carga?.estado).toBe('error'))
    act(() => result.current.reintentar())
    await waitFor(() => expect(result.current.carga?.estado).toBe('ok'))
    expect(cargar).toHaveBeenCalledTimes(2)
  })
})
