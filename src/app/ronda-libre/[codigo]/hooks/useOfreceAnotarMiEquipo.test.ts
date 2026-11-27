/** CTA «Anotar mi equipo» de la ronda en vivo (revisión Fable PR4, P1-b): no aparece si no queda ningún equipo libre. */
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useOfreceAnotarMiEquipo } from './useOfreceAnotarMiEquipo'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const addToast = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/useToast', () => ({ addToast }))
const reabrir = vi.hoisted(() => ({ respuesta: { estado: 'ok' } as unknown, llamadas: [] as string[] }))
vi.mock('@/lib/data/ronda-libre-anotador', () => ({
  reabrirEquipoDeRonda: async (_s: unknown, _c: string, equipoId: string) => { reabrir.llamadas.push(equipoId); return reabrir.respuesta },
}))
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

const eq = (id: string, anotador: string | null) => ({ id, nombre: `Equipo ${id}`, handicap_origen: 'club', anotador_user_id: anotador, anotador_nombre: null })

beforeEach(() => {
  lectura.equipos = []
  lectura.falla = false
  lectura.llamadas = 0
  captureError.mockClear()
  push.mockClear()
  addToast.mockClear()
  reabrir.respuesta = { estado: 'ok' }
  reabrir.llamadas = []
})

const montar = (activo: boolean, userId = 'u-juan', equipos: unknown = []) =>
  renderHook(p => useOfreceAnotarMiEquipo(p), { initialProps: { rondaId: 'r1', userId, activo, equipos } })

describe('useOfreceAnotarMiEquipo', () => {
  it('queda un equipo libre: se ofrece', async () => {
    lectura.equipos = [eq('e1', 'u1'), eq('e2', null)]
    const { result } = montar(true)
    await waitFor(() => expect(lectura.llamadas).toBe(1))
    await act(async () => {})
    expect(result.current.ofrece).toBe(true)
  })

  it('todos tomados por otros: NO se ofrece', async () => {
    lectura.equipos = [eq('e1', 'u1'), eq('e2', 'u-pedro')]
    const { result } = montar(true)
    await waitFor(() => expect(result.current.ofrece).toBe(false))
  })

  it('todos tomados pero uno es suyo: se ofrece (vuelve a su scorer)', async () => {
    lectura.equipos = [eq('e1', 'u1'), eq('e2', 'u-juan')]
    const { result } = montar(true)
    await waitFor(() => expect(lectura.llamadas).toBe(1))
    await act(async () => {})
    expect(result.current.ofrece).toBe(true)
  })

  it('sin la lectura (sin señal): se ofrece y se reporta', async () => {
    lectura.falla = true
    const { result } = montar(true)
    await waitFor(() => expect(captureError).toHaveBeenCalledTimes(1))
    expect(result.current.ofrece).toBe(true)
  })

  it('inactivo (anon, admin o ronda de un celular): ni lee ni ofrece', async () => {
    const { result } = montar(false)
    expect(result.current.ofrece).toBe(false)
    expect(lectura.llamadas).toBe(0)
  })

  it('cada refresco de la vista en vivo relee: un equipo que se libera vuelve a ofrecer el botón', async () => {
    lectura.equipos = [eq('e1', 'u1'), eq('e2', 'u-pedro')]
    const { result, rerender } = montar(true, 'u-juan', [])
    await waitFor(() => expect(result.current.ofrece).toBe(false))
    lectura.equipos = [eq('e1', 'u1'), eq('e2', null)]
    rerender({ rondaId: 'r1', userId: 'u-juan', activo: true, equipos: [] })
    await waitFor(() => expect(result.current.ofrece).toBe(true))
  })
})

// «Terminar mi equipo» (27-nov): con su equipo terminado y la ronda en curso, el pie dice «Corregir mi tarjeta».
describe('useOfreceAnotarMiEquipo — Corregir mi tarjeta', () => {
  const RONDA = { formato_juego: 'scramble', admin_mode: false, creador_id: 'u-crea' }
  const term = (id: string, anotador: string | null, terminado: string | null) =>
    ({ ...eq(id, anotador), terminado_at: terminado })
  const montarConRonda = (userId: string) => renderHook(p => useOfreceAnotarMiEquipo(p), {
    initialProps: { rondaId: 'r1', ronda: RONDA, codigo: 'ABC', userId, activo: true, equipos: [] as unknown },
  })

  it('su equipo terminado: corrige; al tocar reabre y entra al scorer', async () => {
    lectura.equipos = [term('e1', 'u-juan', '2026-11-28T12:00:00Z'), term('e2', 'u-pedro', null)]
    const { result } = montarConRonda('u-juan')
    await waitFor(() => expect(result.current.corrige).toBe(true))
    expect(result.current.ofrece).toBe(true)
    await act(async () => { await result.current.corregir() })
    expect(reabrir.llamadas).toEqual(['e1'])
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC/score-grupo')
  })

  it('inverso: su equipo sigue jugando: no corrige (es «Anotar mi equipo»)', async () => {
    lectura.equipos = [term('e1', 'u-juan', null), term('e2', 'u-pedro', '2026-11-28T12:00:00Z')]
    const { result } = montarConRonda('u-juan')
    await waitFor(() => expect(lectura.llamadas).toBe(1))
    await act(async () => {})
    await waitFor(() => expect(result.current.ofrece).toBe(true))
    expect(result.current.corrige).toBe(false)
  })

  it('el creador con dos equipos: corrige solo si terminaron los dos, y reabre los dos', async () => {
    lectura.equipos = [term('e1', 'u-crea', '2026-11-28T12:00:00Z'), term('e2', 'u-crea', null)]
    const a = montarConRonda('u-crea')
    await waitFor(() => expect(lectura.llamadas).toBe(1))
    await act(async () => {})
    expect(a.result.current.corrige).toBe(false)
    a.unmount()
    lectura.equipos = [term('e1', 'u-crea', '2026-11-28T12:00:00Z'), term('e2', 'u-crea', '2026-11-28T12:05:00Z')]
    const b = montarConRonda('u-crea')
    await waitFor(() => expect(b.result.current.corrige).toBe(true))
    await act(async () => { await b.result.current.corregir() })
    expect(reabrir.llamadas).toEqual(['e1', 'e2'])
  })

  it('ya terminó lo suyo: nombra los equipos que faltan; no es el creador, sin la ayuda de liberar', async () => {
    lectura.equipos = [term('e1', 'u-juan', '2026-11-28T12:00:00Z'), term('e2', 'u-pedro', null)]
    const { result } = montarConRonda('u-juan')
    await waitFor(() => expect(result.current.corrige).toBe(true))
    expect(result.current.faltanPorTerminar).toEqual(['Equipo e2'])
    expect(result.current.puedeLiberarlos).toBe(false)
  })

  it('el creador ya terminó: nombra los que faltan y puede liberarlos', async () => {
    lectura.equipos = [term('e1', 'u-crea', '2026-11-28T12:00:00Z'), term('e2', 'u-pedro', null), term('e3', 'u-ana', null)]
    const { result } = montarConRonda('u-crea')
    await waitFor(() => expect(result.current.corrige).toBe(true))
    expect(result.current.faltanPorTerminar).toEqual(['Equipo e2', 'Equipo e3'])
    expect(result.current.puedeLiberarlos).toBe(true)
  })

  it('todavía anota (no ve «Corregir»): no nombra a nadie', async () => {
    lectura.equipos = [term('e1', 'u-crea', null), term('e2', 'u-pedro', null)]
    const { result } = montarConRonda('u-crea')
    await waitFor(() => expect(lectura.llamadas).toBe(1))
    await act(async () => {})
    expect(result.current.corrige).toBe(false)
    expect(result.current.faltanPorTerminar).toEqual([])
    expect(result.current.puedeLiberarlos).toBe(false)
  })

  it('si reabrir falla: avisa, no navega y el botón vuelve a responder', async () => {
    lectura.equipos = [term('e1', 'u-juan', '2026-11-28T12:00:00Z')]
    reabrir.respuesta = { estado: 'error', ronda: 'sin_respuesta', mensaje: 'Sin señal' }
    const { result } = montarConRonda('u-juan')
    await waitFor(() => expect(result.current.corrige).toBe(true))
    await act(async () => { await result.current.corregir() })
    expect(push).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sin señal' }))
    expect(result.current.corrigiendo).toBe(false)
  })
})
