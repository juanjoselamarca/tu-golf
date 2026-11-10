import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProfileEdit } from './useProfileEdit'
import type { Profile } from '@/lib/data/perfil'

const baseProfile: Profile = {
  id: 'u1', name: 'Ana', indice: 12.3, avatar_url: null,
  indice_golfers: 10.1, indice_golfers_updated_at: '2026-01-01',
  nivel: 3, nivel_updated_at: null, nivel_expires_at: null,
  subscription_tier: 'free',
}

const update = vi.hoisted(() => vi.fn())
const respuesta = vi.hoisted(() => ({ falla: false, pendiente: null as Promise<void> | null }))
const captureError = vi.hoisted(() => vi.fn())
vi.mock('@/lib/error-tracking', () => ({ captureError }))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      update: (payload: unknown) => (update(payload), {
        eq: () => ({
          select: () => ({
            // El update solo devuelve estas 4 columnas (como en prod).
            single: async () => {
              if (respuesta.pendiente) await respuesta.pendiente
              return respuesta.falla
                ? { data: null, error: { message: 'Failed to fetch' } }
                : { data: { id: 'u1', name: 'Ana María', indice: 11.0, avatar_url: null }, error: null }
            },
          }),
        }),
      }),
    }),
  }),
}))

describe('useProfileEdit', () => {
  it('al guardar, MERGEA (no reemplaza): conserva indice_golfers y nivel', async () => {
    const onProfile = vi.fn()
    const { result } = renderHook(() => useProfileEdit(baseProfile, onProfile))
    act(() => { result.current.setEditName('Ana María') })
    await act(async () => { await result.current.save() })
    const merged = onProfile.mock.calls[0][0] as Profile
    expect(merged.name).toBe('Ana María')         // viene del update
    expect(merged.indice).toBe(11.0)              // viene del update
    expect(merged.indice_golfers).toBe(10.1)      // CONSERVADO del profile previo
    expect(merged.nivel).toBe(3)                  // CONSERVADO del profile previo
  })
})

// "Índice Federación": parseFloat("+2") guardaba 2 (un plus pasaba a hándicap 2), "abc" guardaba null sin
// avisar, y un plus guardado se precargaba "-2".
describe('useProfileEdit — índice federado', () => {
  beforeEach(() => update.mockClear())

  const guardar = async (texto: string, indice: number | null = 12.3) => {
    const { result } = renderHook(() => useProfileEdit({ ...baseProfile, indice }, vi.fn()))
    act(() => { result.current.setEditIndice(texto) })
    await act(async () => { await result.current.save() })
    return result
  }

  it('un plus guardado (−2) se precarga "+2"', () => {
    const { result } = renderHook(() => useProfileEdit({ ...baseProfile, indice: -2 }, vi.fn()))
    expect(result.current.editIndice).toBe('+2')
  })

  it.each([['+2', -2], ['18,5', 18.5], ['-1.5', -1.5], ['', null]])('guardar "%s" escribe %s', async (texto, indice) => {
    const result = await guardar(texto)
    expect(update).toHaveBeenCalledWith({ name: 'Ana', indice })
    expect(result.current.campoIndice.aviso).toBeNull()
  })

  it('"abc" no escribe y avisa', async () => {
    const result = await guardar('abc')
    expect(update).not.toHaveBeenCalled()
    expect(result.current.campoIndice.aviso).toBe('Escribe un número (12.4, o +2 si es plus) o déjalo vacío.')
  })

  it('fuera del rango WHS ("60") no escribe y avisa el rango', async () => {
    const result = await guardar('60')
    expect(update).not.toHaveBeenCalled()
    expect(result.current.campoIndice.aviso).toMatch(/^Revisa el índice de handicap/)
  })

  it('"+" a medio escribir: al guardar no escribe y avisa en el campo', async () => {
    const result = await guardar('+')
    expect(update).not.toHaveBeenCalled()
    expect(result.current.campoIndice.aviso).toBe('Escribe un número (12.4, o +2 si es plus) o déjalo vacío.')
  })

  it('cancelar vuelve a la precarga con "+"', () => {
    const { result } = renderHook(() => useProfileEdit({ ...baseProfile, indice: -2 }, vi.fn()))
    act(() => { result.current.setEditIndice('abc') })
    act(() => { result.current.cancel() })
    expect(result.current.editIndice).toBe('+2')
  })
  it('si el UPDATE falla (#776): no cierra la edición, no dice "Guardado", avisa en el formulario y registra el error', async () => {
    respuesta.falla = true
    try {
      const onProfile = vi.fn()
      const { result } = renderHook(() => useProfileEdit(baseProfile, onProfile))
      act(() => { result.current.setEditing(true) })
      act(() => { result.current.setEditIndice('+2') })
      await act(async () => { await result.current.save() })
      expect(onProfile).not.toHaveBeenCalled()
      expect(result.current.editing).toBe(true)
      expect(result.current.saved).toBe(false)
      expect(result.current.saving).toBe(false)
      expect(result.current.editIndice).toBe('+2')
      // El fallo es del formulario, no del índice: el campo queda sin aviso.
      expect(result.current.errorAlGuardar).toBe('No pudimos guardar tus cambios. Revisa tu señal y vuelve a intentarlo.')
      expect(result.current.campoIndice.aviso).toBeNull()
      expect(captureError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ context: 'actualizarNombreEIndice' }))
    } finally {
      respuesta.falla = false
    }
  })
  describe('el aviso de guardado fallido no queda pegado', () => {
    const MENSAJE = 'No pudimos guardar tus cambios. Revisa tu señal y vuelve a intentarlo.'
    const fallaUnaVez = async (result: { current: ReturnType<typeof useProfileEdit> }) => {
      respuesta.falla = true
      act(() => { result.current.setEditing(true) })
      await act(async () => { await result.current.save() })
      respuesta.falla = false
      expect(result.current.errorAlGuardar).toBe(MENSAJE)
    }

    it('fallo → reintento exitoso → reabrir: sin aviso', async () => {
      const { result } = renderHook(() => useProfileEdit(baseProfile, vi.fn()))
      await fallaUnaVez(result)
      await act(async () => { await result.current.save() })
      expect(result.current.editing).toBe(false)
      expect(result.current.errorAlGuardar).toBeNull()
      act(() => { result.current.setEditing(true) })
      expect(result.current.errorAlGuardar).toBeNull()
      expect(result.current.campoIndice.aviso).toBeNull()
    })

    it('fallo → cancelar: sin aviso (ni al reabrir)', async () => {
      const { result } = renderHook(() => useProfileEdit(baseProfile, vi.fn()))
      await fallaUnaVez(result)
      act(() => { result.current.cancel() })
      expect(result.current.errorAlGuardar).toBeNull()
      act(() => { result.current.setEditing(true) })
      expect(result.current.errorAlGuardar).toBeNull()
    })

    it('cancelar también quita el aviso de un índice a medio escribir', async () => {
      const { result } = renderHook(() => useProfileEdit({ ...baseProfile, indice: null }, vi.fn()))
      act(() => { result.current.setEditing(true) })
      act(() => { result.current.setEditIndice('+') })
      await act(async () => { await result.current.save() })
      expect(result.current.campoIndice.aviso).not.toBeNull()
      act(() => { result.current.cancel() })
      expect(result.current.campoIndice.aviso).toBeNull()
    })

    it('dos fallos seguidos: el aviso se va mientras guarda y vuelve (se anuncia de nuevo)', async () => {
      const { result } = renderHook(() => useProfileEdit(baseProfile, vi.fn()))
      await fallaUnaVez(result)
      respuesta.falla = true
      let soltar: () => void = () => {}
      respuesta.pendiente = new Promise<void>(r => { soltar = r })
      try {
        let guardando: Promise<void> = Promise.resolve()
        act(() => { guardando = result.current.save() })
        expect(result.current.saving).toBe(true)
        expect(result.current.errorAlGuardar).toBeNull()
        await act(async () => { soltar(); await guardando })
        expect(result.current.errorAlGuardar).toBe(MENSAJE)
      } finally {
        respuesta.falla = false
        respuesta.pendiente = null
      }
    })
  })
})
