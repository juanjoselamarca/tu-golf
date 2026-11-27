/** «Dejar este equipo» (revisión Fable PR4, P1-b): sube lo anotado, suelta con la RPC de liberar y vuelve a elegir. */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAnotadorDeEquipo } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useAnotadorDeEquipo'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/ronda/helpers', () => ({ haptic: vi.fn() }))
const addToast = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/useToast', () => ({ addToast }))
const liberar = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/ronda-libre-anotador', async (orig) => ({
  ...(await orig<typeof import('@/lib/data/ronda-libre-anotador')>()),
  liberarEquipoDeRonda: liberar,
}))

const recargar = vi.fn(async () => {})
const recargarTrasDejarEquipo = vi.fn(async () => {})
const montar = () => renderHook(() => useAnotadorDeEquipo({ codigo: 'ABC', recargar, recargarTrasDejarEquipo }))

beforeEach(() => { vi.clearAllMocks() })

describe('useAnotadorDeEquipo.dejar', () => {
  it('sube lo pendiente, suelta el equipo y vuelve a elegir (sin el aviso «Ya no anotas»)', async () => {
    liberar.mockResolvedValue({ estado: 'ok' })
    const subir = vi.fn(async () => true)
    const { result } = montar()
    await act(async () => { await result.current.dejar('e2', 'Los Pumas', subir) })
    expect(subir).toHaveBeenCalledTimes(1)
    expect(liberar).toHaveBeenCalledWith({}, 'ABC', 'e2')
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Dejaste Los Pumas' }))
    expect(recargarTrasDejarEquipo).toHaveBeenCalledTimes(1)
    expect(recargar).not.toHaveBeenCalled()
    expect(result.current.enCurso).toBeNull()
  })

  it('con golpes sin subir (sin señal) NO suelta el equipo: se perderían', async () => {
    const { result } = montar()
    await act(async () => { await result.current.dejar('e2', 'Los Pumas', async () => false) })
    expect(liberar).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: 'Hay golpes sin subir. Espera señal y vuelve a intentar.' }))
    expect(recargarTrasDejarEquipo).not.toHaveBeenCalled()
    expect(result.current.enCurso).toBeNull()
  })

  it('la RPC rechaza: avisa con su mensaje y el equipo sigue en este celular', async () => {
    liberar.mockResolvedValue({ estado: 'error', mensaje: 'Sin conexión. Prueba de nuevo.' })
    const { result } = montar()
    await act(async () => { await result.current.dejar('e2', 'Los Pumas', async () => true) })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: 'Sin conexión. Prueba de nuevo.' }))
    expect(recargarTrasDejarEquipo).not.toHaveBeenCalled()
  })
})

describe('useAnotadorDeEquipo.liberar (revisión Fable 2ª vuelta)', () => {
  it('RPC ok: corre alLiberar (marca el equipo tomado) ANTES de releer', async () => {
    liberar.mockResolvedValue({ estado: 'ok' })
    const orden: string[] = []
    recargar.mockImplementationOnce(async () => { orden.push('recargar') })
    const { result } = montar()
    await act(async () => { await result.current.liberar('e2', 'Los Pumas', () => { orden.push('alLiberar') }) })
    expect(orden).toEqual(['alLiberar', 'recargar'])
  })

  it('RPC con error: NO corre alLiberar (el equipo no queda marcado como tomado)', async () => {
    liberar.mockResolvedValue({ estado: 'error', mensaje: 'Sin conexión. Prueba de nuevo.' })
    const alLiberar = vi.fn()
    const { result } = montar()
    await act(async () => { await result.current.liberar('e2', 'Los Pumas', alLiberar) })
    expect(alLiberar).not.toHaveBeenCalled()
  })
})
