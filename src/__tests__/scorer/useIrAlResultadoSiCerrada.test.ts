import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { useIrAlResultadoSiCerrada } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useIrAlResultadoSiCerrada'

// PR #763: la ronda cerrada en otro dispositivo saca al marcador del grupo al resultado, pero NUNCA
// mientras Finalizar está en curso (Finalizar guarda el historial y el índice, y navega él).
describe('useIrAlResultadoSiCerrada', () => {
  beforeEach(() => push.mockClear())

  it('ronda abierta: no navega', () => {
    renderHook(() => useIrAlResultadoSiCerrada({ rondaCerrada: false, finalizing: false, codigo: 'ABC' }))
    expect(push).not.toHaveBeenCalled()
  })

  it('cerrada con Finalizar en curso: espera, no le corta el historial a Finalizar', () => {
    renderHook(() => useIrAlResultadoSiCerrada({ rondaCerrada: true, finalizing: true, codigo: 'ABC' }))
    expect(push).not.toHaveBeenCalled()
  })

  it('cerrada y Finalizar se detiene: entonces sí pasa al resultado', () => {
    const { rerender } = renderHook((p: { finalizing: boolean }) => useIrAlResultadoSiCerrada({ rondaCerrada: true, finalizing: p.finalizing, codigo: 'ABC' }), { initialProps: { finalizing: true } })
    expect(push).not.toHaveBeenCalled()
    rerender({ finalizing: false })
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC?finished=true')
  })
})
