// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ImportRoundData } from '@/lib/import-types'
import { resumenDeRevision, vsParDeImportacion } from '@/components/import/review-helpers'

const confirmar = vi.fn()
vi.mock('@/hooks/useConfirmarImportacion', () => ({
  useConfirmarImportacion: () => ({ confirmando: false, error: null, todasDuplicadas: false, confirmar }),
}))

import { useRevisionImportacion, conGolpeCorregido, modoEsForzado } from './useRevisionImportacion'

function ronda(tempId: string, extra: Partial<ImportRoundData> = {}): ImportRoundData {
  const scores = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), 5]))
  return {
    tempId, played_at: '2026-10-01', course_name: 'Los Leones', total_gross: 45, holes_played: 9,
    scores, import_confidence: 0.95, ...extra,
  } as ImportRoundData
}

const PARES_9 = Object.fromEntries([4, 4, 3, 5, 4, 3, 4, 4, 5].map((p, i) => [String(i + 1), p]))

describe('vsParDeImportacion', () => {
  it('golpes sobre el par de la ronda cuando trae el par de todos sus hoyos', () => {
    expect(vsParDeImportacion(ronda('a', { par_per_hole: PARES_9 }))).toBe(45 - 36)
  })

  it('sin par, o con par de solo algunos hoyos, no inventa un vs-par', () => {
    expect(vsParDeImportacion(ronda('a'))).toBeNull()
    expect(vsParDeImportacion(ronda('a', { par_per_hole: { '1': 4, '2': 4 } }))).toBeNull()
  })
})

describe('resumenDeRevision', () => {
  it('cuenta aceptadas, descartadas y el nivel de confianza de las no descartadas', () => {
    const rounds = [
      ronda('lista'),
      ronda('revisar', { import_confidence: 0.75 }),
      ronda('incompleta', { scores: { '1': 5 } }),
      ronda('garmin', { import_confidence: 1.0 }),
      ronda('fuera'),
    ]
    const r = resumenDeRevision(rounds, {
      lista: 'accepted', revisar: 'accepted', incompleta: 'accepted', garmin: 'accepted', fuera: 'rejected',
    })
    expect(r).toEqual({ aceptadas: 4, descartadas: 1, garmin: 1, listas: 1, porRevisar: 1, incompletas: 1 })
  })
})

describe('conGolpeCorregido / modoEsForzado', () => {
  it('corrige el hoyo y recalcula el total', () => {
    const r = conGolpeCorregido(ronda('a'), 3, 2)
    expect(r.scores['3']).toBe(2)
    expect(r.total_gross).toBe(42)
  })

  it('Stableford y Match Play se importan en neto', () => {
    expect(modoEsForzado('stableford')).toBe(true)
    expect(modoEsForzado('match_play')).toBe(true)
    expect(modoEsForzado('stroke_play')).toBe(false)
  })
})

describe('useRevisionImportacion', () => {
  beforeEach(() => confirmar.mockReset())

  it('confirma solo las aceptadas, con el formato y el modo efectivo, y entrega lo que se guardó', async () => {
    const resultado = { importadas: 1 }
    confirmar.mockResolvedValue(resultado)
    const onConfirm = vi.fn()
    const { result } = renderHook(() =>
      useRevisionImportacion({ rondasIniciales: [ronda('a'), ronda('b')], jobId: 'job-1', onConfirm }),
    )

    act(() => result.current.decidir('b', 'rejected'))
    act(() => result.current.setModo('gross'))
    act(() => result.current.setFormato('stableford'))
    expect(result.current.modoEfectivo).toBe('neto')
    expect(result.current.resumen.aceptadas).toBe(1)

    await act(() => result.current.confirmarAceptadas())
    const enviadas = confirmar.mock.calls[0][1] as ImportRoundData[]
    expect(confirmar.mock.calls[0][0]).toBe('job-1')
    expect(enviadas.map(r => r.tempId)).toEqual(['a'])
    expect(enviadas[0]).toMatchObject({ formato_juego: 'stableford', modo_juego: 'neto' })
    expect(onConfirm).toHaveBeenCalledWith(resultado, enviadas)
  })

  it('si la confirmación falla no avanza', async () => {
    confirmar.mockResolvedValue(null)
    const onConfirm = vi.fn()
    const { result } = renderHook(() =>
      useRevisionImportacion({ rondasIniciales: [ronda('a')], jobId: null, onConfirm }),
    )
    await act(() => result.current.confirmarAceptadas())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('una corrección fuera de rango o no entera no cambia la tarjeta', () => {
    const { result } = renderHook(() =>
      useRevisionImportacion({ rondasIniciales: [ronda('a')], jobId: null, onConfirm: vi.fn() }),
    )
    act(() => result.current.corregirGolpe('a', 1, 0))
    act(() => result.current.corregirGolpe('a', 1, 16))
    act(() => result.current.corregirGolpe('a', 1, Number.NaN))
    act(() => result.current.corregirGolpe('a', 1, 4.5))
    expect(result.current.rounds[0].scores['1']).toBe(5)
    act(() => result.current.corregirGolpe('a', 1, 3))
    expect(result.current.rounds[0].scores['1']).toBe(3)
    expect(result.current.rounds[0].total_gross).toBe(43)
  })

  it('descartar cierra la tarjeta abierta', () => {
    const { result } = renderHook(() =>
      useRevisionImportacion({ rondasIniciales: [ronda('a')], jobId: null, onConfirm: vi.fn() }),
    )
    act(() => result.current.toggleExpand('a'))
    expect(result.current.expandedCards.a).toBe(true)
    act(() => result.current.decidir('a', 'rejected'))
    expect(result.current.expandedCards.a).toBe(false)
  })
})
