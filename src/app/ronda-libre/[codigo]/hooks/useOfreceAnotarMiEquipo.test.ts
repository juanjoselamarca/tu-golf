/** CTA «Anotar mi equipo» de la ronda en vivo (revisión Fable PR4, P1-b): no aparece si no queda ningún equipo libre. */
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useOfreceAnotarMiEquipo } from './useOfreceAnotarMiEquipo'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const captureError = vi.hoisted(() => vi.fn())
vi.mock('@/lib/error-tracking', () => ({ captureError }))
const lectura = vi.hoisted(() => ({ equipos: [] as unknown[], falla: false, llamadas: 0 }))
vi.mock('@/lib/data/ronda-libre', () => ({
  fetchEquiposConAnotador: async () => {
    lectura.llamadas++
    if (lectura.falla) throw new Error('Failed to fetch')
    return lectura.equipos
  },
}))

const eq = (id: string, anotador: string | null) => ({ id, handicap_origen: 'club', anotador_user_id: anotador, anotador_nombre: null })

beforeEach(() => {
  lectura.equipos = []
  lectura.falla = false
  lectura.llamadas = 0
  captureError.mockClear()
})

const montar = (activo: boolean, userId = 'u-juan', equipos: unknown = []) =>
  renderHook(p => useOfreceAnotarMiEquipo(p), { initialProps: { rondaId: 'r1', userId, activo, equipos } })

describe('useOfreceAnotarMiEquipo', () => {
  it('queda un equipo libre: se ofrece', async () => {
    lectura.equipos = [eq('e1', 'u1'), eq('e2', null)]
    const { result } = montar(true)
    await waitFor(() => expect(lectura.llamadas).toBe(1))
    expect(result.current).toBe(true)
  })

  it('todos tomados por otros: NO se ofrece', async () => {
    lectura.equipos = [eq('e1', 'u1'), eq('e2', 'u-pedro')]
    const { result } = montar(true)
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('todos tomados pero uno es suyo: se ofrece (vuelve a su scorer)', async () => {
    lectura.equipos = [eq('e1', 'u1'), eq('e2', 'u-juan')]
    const { result } = montar(true)
    await waitFor(() => expect(lectura.llamadas).toBe(1))
    expect(result.current).toBe(true)
  })

  it('sin la lectura (sin señal): se ofrece y se reporta', async () => {
    lectura.falla = true
    const { result } = montar(true)
    await waitFor(() => expect(captureError).toHaveBeenCalledTimes(1))
    expect(result.current).toBe(true)
  })

  it('inactivo (anon, admin o ronda de un celular): ni lee ni ofrece', async () => {
    const { result } = montar(false)
    expect(result.current).toBe(false)
    expect(lectura.llamadas).toBe(0)
  })

  it('cada refresco de la vista en vivo relee: un equipo que se libera vuelve a ofrecer el botón', async () => {
    lectura.equipos = [eq('e1', 'u1'), eq('e2', 'u-pedro')]
    const { result, rerender } = montar(true, 'u-juan', [])
    await waitFor(() => expect(result.current).toBe(false))
    lectura.equipos = [eq('e1', 'u1'), eq('e2', null)]
    rerender({ rondaId: 'r1', userId: 'u-juan', activo: true, equipos: [] })
    await waitFor(() => expect(result.current).toBe(true))
  })
})
