import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProfileEdit } from './useProfileEdit'
import type { Profile } from '@/lib/data/perfil'

const baseProfile: Profile = {
  id: 'u1', name: 'Ana', indice: 12.3, avatar_url: null,
  indice_golfers: 10.1, indice_golfers_updated_at: '2026-01-01',
  nivel: 3, nivel_updated_at: null, nivel_expires_at: null,
}

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            // El update solo devuelve estas 4 columnas (como en prod).
            single: async () => ({ data: { id: 'u1', name: 'Ana María', indice: 11.0, avatar_url: null }, error: null }),
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
