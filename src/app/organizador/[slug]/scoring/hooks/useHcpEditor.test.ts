// Edición inline del handicap de inscripción (tab Resumen del organizador).
//
// El rango lo decide la fuente única `@/golf/handicap-index-range` (−10..54).
// El `value < 0` que estaba a mano en el hook rechazaba a los jugadores PLUS:
// a un índice +2 (−2) el organizador no podía asignarle su handicap, y el toast
// le decía "entre 0 y 54" — un rango que la app no usa en ninguna otra puerta.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { renderHook } from '@testing-library/react'
import { MENSAJE_INDICE_FUERA_DE_RANGO } from '@/golf/handicap-index-range'

const updatePlayerHandicap = vi.fn(async () => {})
const showWarning = vi.fn()
const showError = vi.fn()
const showSuccess = vi.fn()

vi.mock('@/lib/data/tournaments/scoring', () => ({
  updatePlayerHandicap: (...args: unknown[]) => updatePlayerHandicap(...(args as [])),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showWarning, showError, showSuccess }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { useHcpEditor } from './useHcpEditor'

/** Edita el handicap del jugador `p1` con el texto `texto` y devuelve el hook. */
async function editar(texto: string) {
  const onSaved = vi.fn()
  const { result } = renderHook(() => useHcpEditor({ onSaved }))
  act(() => result.current.startEdit('p1', null))
  act(() => result.current.setEditValue(texto))
  await act(async () => {
    await result.current.save('p1')
  })
  return { onSaved }
}

beforeEach(() => {
  updatePlayerHandicap.mockClear()
  showWarning.mockClear()
  showError.mockClear()
  showSuccess.mockClear()
})

describe('useHcpEditor', () => {
  it.each(['-2', '-2.4', '-10', '0', '12.4', '54'])(
    'guarda %s (incluye los PLUS, que el rango viejo 0..54 rechazaba)',
    async (texto) => {
      const { onSaved } = await editar(texto)
      expect(updatePlayerHandicap).toHaveBeenCalledWith({}, 'p1', parseFloat(texto))
      expect(onSaved).toHaveBeenCalledWith('p1', parseFloat(texto))
      expect(showWarning).not.toHaveBeenCalled()
    },
  )

  it.each(['55', '54.1', '-10.1', '-59', 'abc', ''])(
    'rechaza %p sin tocar la base, con el mensaje canónico',
    async (texto) => {
      const { onSaved } = await editar(texto)
      expect(updatePlayerHandicap).not.toHaveBeenCalled()
      expect(onSaved).not.toHaveBeenCalled()
      expect(showWarning).toHaveBeenCalledWith('Handicap inválido', MENSAJE_INDICE_FUERA_DE_RANGO)
    },
  )

  it('el mensaje del toast no promete un rango que la app no valida', async () => {
    await editar('99')
    expect(showWarning).toHaveBeenCalledWith(
      'Handicap inválido',
      expect.stringContaining('54'),
    )
    // El rango viejo "entre 0 y 54" mentía: −10..54 es el que valida el resto.
    expect(showWarning.mock.calls[0][1]).not.toBe('Debe ser un número entre 0 y 54.')
  })
})
