// El HCP que se ve al crear la ronda es SIEMPRE el de 18 hoyos (regla de Juanjo,
// 12-nov-2026; inbox 2afd0036: "el handicap está mal, nada que ver con el índice").
// En una ronda de 9 el asistente mostraba los golpes de 9 (la mitad) y el
// marcador después mostraba el de 18: la misma persona veía dos HCP distintos.
// Los golpes de 9 siguen existiendo por dentro (`golpesDe`): con ellos se calcula
// la ventaja del match.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { CourseData } from '@/golf/core/course-handicap'

const cargarCourseData = vi.fn()
vi.mock('@/golf/core/course-handicap', async importOriginal => ({
  ...(await importOriginal<typeof import('@/golf/core/course-handicap')>()),
  cargarCourseData: (...args: unknown[]) => cargarCourseData(...args),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { useHandicapDeCancha } from './useHandicapDeCancha'

/** Front 9 de un tee azul de cancha de 18. */
const cd9: CourseData = { slope: 130, courseRating: 35.75, par: 36, is9Hole: true }
/** El mismo tee en 18 hoyos. */
const cd18: CourseData = { slope: 130, courseRating: 71.5, par: 72 }

beforeEach(() => {
  cargarCourseData.mockReset()
  cargarCourseData.mockImplementation(async (_id: string, _tee: string, holes: number) => (holes <= 9 ? cd9 : cd18))
})

function render(holes: number, recorridos: string[] = []) {
  return renderHook(() => useHandicapDeCancha({
    courseId: 'cancha-1', parTotal: 72, holes, recorridos, teesEnJuego: ['Azul'],
  }))
}

describe('useHandicapDeCancha — HCP visible vs golpes de la ronda', () => {
  it('ronda de 9: el HCP visible es el de 18 hoyos, no la mitad', async () => {
    const { result } = render(9)
    await waitFor(() => expect(result.current.hcpVisibleDe(15, 'Azul')).not.toBeNull())
    // round(15 × 130/113 + (71.5 − 72)) = 17: el mismo número que el marcador.
    expect(result.current.hcpVisibleDe(15, 'Azul')).toBe(17)
    // Los golpes que reparte la vuelta de 9 son otros (la ventaja se calcula con estos).
    expect(result.current.golpesDe(15, 'Azul')).not.toBe(17)
    expect(cargarCourseData).toHaveBeenCalledWith('cancha-1', 'azul', 18, 72)
  })

  it('el HCP visible no depende de si la ronda es de 9 o de 18', async () => {
    const de9 = render(9)
    const de18 = render(18)
    await waitFor(() => {
      expect(de9.result.current.hcpVisibleDe(15, 'Azul')).not.toBeNull()
      expect(de18.result.current.hcpVisibleDe(15, 'Azul')).not.toBeNull()
    })
    expect(de9.result.current.hcpVisibleDe(15, 'Azul')).toBe(de18.result.current.hcpVisibleDe(15, 'Azul'))
  })

  it('ronda de 18: HCP visible y golpes son el mismo número', async () => {
    const { result } = render(18)
    await waitFor(() => expect(result.current.golpesDe(15, 'Azul')).not.toBeNull())
    expect(result.current.hcpVisibleDe(15, 'Azul')).toBe(result.current.golpesDe(15, 'Azul'))
  })

  it('loop de 9 en cancha multi-recorrido: muestra el índice entero, nunca la mitad', async () => {
    const { result } = render(9, ['Norte'])
    await waitFor(() => expect(result.current.hcpVisibleDe(15.4, 'Azul')).not.toBeNull())
    expect(result.current.hcpVisibleDe(15.4, 'Azul')).toBe(15)
  })

  it('si falla la carga de 18h, muestra el índice entero, nunca la mitad', async () => {
    cargarCourseData.mockImplementation(async (_id: string, _tee: string, holes: number) => {
      if (holes > 9) throw new Error('sin red')
      return cd9
    })
    const { result } = render(9)
    await waitFor(() => expect(result.current.hcpVisibleDe(15.4, 'Azul')).not.toBeNull())
    expect(result.current.hcpVisibleDe(15.4, 'Azul')).toBe(15)
  })

  it('si el 18h falla una vez, reintenta y termina en el mismo HCP que el marcador', async () => {
    let fallas = 0
    cargarCourseData.mockImplementation(async (_id: string, _tee: string, holes: number) => {
      if (holes > 9 && fallas++ === 0) throw new Error('sin red')
      return holes <= 9 ? cd9 : cd18
    })
    const { result } = render(9)
    await waitFor(() => expect(result.current.hcpVisibleDe(15, 'Azul')).toBe(15))
    await waitFor(() => expect(result.current.hcpVisibleDe(15, 'Azul')).toBe(17), { timeout: 6000 })
  }, 10000)

  it('si el 18h no vuelve, deja de reintentar (índice entero, nunca la mitad)', async () => {
    cargarCourseData.mockImplementation(async (_id: string, _tee: string, holes: number) => {
      if (holes > 9) throw new Error('sin red')
      return cd9
    })
    const { result } = render(9)
    await waitFor(() => expect(cargarCourseData.mock.calls.filter(c => c[2] === 18)).toHaveLength(3), { timeout: 9000 })
    await new Promise(r => setTimeout(r, 3500))
    expect(cargarCourseData.mock.calls.filter(c => c[2] === 18)).toHaveLength(3)
    expect(result.current.hcpVisibleDe(15.4, 'Azul')).toBe(15)
  }, 15000)
})

