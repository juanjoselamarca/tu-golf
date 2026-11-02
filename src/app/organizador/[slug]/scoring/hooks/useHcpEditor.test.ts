// Edición inline del handicap de inscripción (tab Resumen del organizador).
//
// El rango lo decide la fuente única `@/golf/handicap-index-range`: índice
// (−10..54) en WHS; en los torneos raw, la imagen de ese rango por la fórmula
// de la cancha (ahí la columna guarda un course handicap). El `value < 0` que
// estaba a mano en el hook rechazaba a los jugadores PLUS: a un índice +2 (−2)
// el organizador no podía asignarle su handicap, y el toast le decía "entre 0 y
// 54" — un rango que la app no usa en ninguna otra puerta.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { renderHook } from '@testing-library/react'
import { MENSAJE_INDICE_FUERA_DE_RANGO } from '@/golf/handicap-index-range'
import type { ScoringCourse } from '@/lib/data/tournaments/scoring'

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

const CANCHA: ScoringCourse = { id: 'c1', nombre: 'Cancha', par_total: 72, slope_rating: 130, course_rating: 73.5 }

interface Torneo {
  hcpCalcMode?: string | null
  course?: ScoringCourse | null
}

/** Edita el handicap del jugador `p1` con el texto `texto` y devuelve el hook. */
async function editar(texto: string, { hcpCalcMode = 'whs', course = null }: Torneo = {}) {
  const onSaved = vi.fn()
  const { result } = renderHook(() => useHcpEditor({ onSaved, hcpCalcMode, course }))
  act(() => result.current.startEdit('p1', null))
  act(() => result.current.setEditValue(texto))
  await act(async () => {
    await result.current.save('p1')
  })
  return { onSaved, result }
}

beforeEach(() => {
  updatePlayerHandicap.mockClear()
  showWarning.mockClear()
  showError.mockClear()
  showSuccess.mockClear()
})

describe('useHcpEditor', () => {
  it.each([
    ['-2', -2],
    ['-2.4', -2.4],
    ['-10', -10],
    ['0', 0],
    ['12.4', 12.4],
    ['54', 54],
  ])('guarda %s como %p (incluye los PLUS, que el rango viejo 0..54 rechazaba)', async (texto, valor) => {
    const { onSaved } = await editar(texto)
    expect(updatePlayerHandicap).toHaveBeenCalledWith({}, 'p1', valor, expect.objectContaining({ guarda: 'indice' }))
    expect(onSaved).toHaveBeenCalledWith('p1', valor)
    expect(showWarning).not.toHaveBeenCalled()
  })

  // Revisión del PR #720: el mensaje decía "+10 (plus)" y el hook rechazaba "+2".
  it.each([
    ['+2', -2],
    ['+2.4', -2.4],
    ['18,5', 18.5],
  ])('acepta la notación del golf y la coma: %s → %p', async (texto, valor) => {
    const { onSaved } = await editar(texto)
    expect(onSaved).toHaveBeenCalledWith('p1', valor)
    expect(showWarning).not.toHaveBeenCalled()
  })

  it.each(['55', '54.1', '-10.1', '-59', 'abc', '', '60'])(
    'WHS: rechaza %p sin tocar la base, con el mensaje canónico',
    async (texto) => {
      const { onSaved } = await editar(texto)
      expect(updatePlayerHandicap).not.toHaveBeenCalled()
      expect(onSaved).not.toHaveBeenCalled()
      expect(showWarning).toHaveBeenCalledWith('Handicap inválido', MENSAJE_INDICE_FUERA_DE_RANGO)
    },
  )

  // Revisión del PR #720 (P2): en raw la columna guarda el COURSE HANDICAP, que
  // con slope 130 y CR−par +1,5 llega a 64 para un índice 54. Rechazarlo con
  // "máximo 54" era rechazar a un jugador legítimo con el toast genérico.
  describe('torneo raw: la columna guarda el course handicap', () => {
    it('acepta un course handicap mayor que 54 dentro de la fórmula de la cancha', async () => {
      const { onSaved } = await editar('60', { hcpCalcMode: 'raw', course: CANCHA })
      expect(onSaved).toHaveBeenCalledWith('p1', 60)
      expect(updatePlayerHandicap).toHaveBeenCalledWith(
        {},
        'p1',
        60,
        expect.objectContaining({ guarda: 'course_handicap', max: 64 }),
      )
    })

    it('rechaza lo que ni un índice 54 produce en esa cancha, y el toast dice el rango real', async () => {
      await editar('65', { hcpCalcMode: 'raw', course: CANCHA })
      expect(updatePlayerHandicap).not.toHaveBeenCalled()
      const mensaje = showWarning.mock.calls[0][1] as string
      expect(mensaje).toContain('handicap de cancha')
      expect(mensaje).toContain('64')
    })

    it('sin cancha creíble vuelve al rango de índice', async () => {
      await editar('60', { hcpCalcMode: 'raw', course: null })
      expect(updatePlayerHandicap).not.toHaveBeenCalled()
      expect(showWarning).toHaveBeenCalled()
    })
  })

  it('expone el rango para que el input tome min/max de la misma fuente', async () => {
    const { result } = await editar('12', { hcpCalcMode: 'raw', course: CANCHA })
    expect(result.current.rango).toEqual({ min: -10, max: 64, guarda: 'course_handicap' })
  })

  it('el mensaje del toast no promete un rango que la app no valida', async () => {
    await editar('99')
    expect(showWarning).toHaveBeenCalledWith(
      'Handicap inválido',
      expect.stringContaining('54'),
    )
    // El rango viejo "entre 0 y 54" mentía: −10..54 es el que valida el resto.
    expect(showWarning.mock.calls[0][1]).not.toBe('Debe ser un número entre 0 y 54.')
  })

  it('un error de la base muestra el toast de error y no llama a onSaved', async () => {
    updatePlayerHandicap.mockRejectedValueOnce(new Error('rls'))
    const { onSaved } = await editar('12')
    expect(onSaved).not.toHaveBeenCalled()
    expect(showError).toHaveBeenCalled()
  })
})
