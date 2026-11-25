/**
 * P1 (revisión Fable PR #888, vuelta 2): en un skins neto, un corte de señal justo al leer el rating dejaba «—» toda
 * la ronda. `resolverCourseData` se tragaba el error y devolvía null, el contexto lo leía como «tee sin rating»
 * (permanente) y el hook no reintentaba. Acá corre el camino real (`contextoSkinsDeRondaNueva` +
 * `resolverCourseData`) sobre un cliente falso: los hoyos se leen bien, el rating falla una vez y después responde.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

type Respuesta = { data: unknown; error: { message: string; code: string } | null }
const cliente = vi.hoisted(() => ({ tablas: {} as Record<string, Respuesta[]>, lecturas: {} as Record<string, number> }))

function consulta(r: Respuesta) {
  const q: Record<string, unknown> = {
    select: () => q, eq: () => q, in: () => q, ilike: () => q, order: () => q, limit: () => q,
    maybeSingle: () => Promise.resolve(r),
    then: (f: (v: Respuesta) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(r).then(f, rej),
  }
  return q
}
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from(tabla: string) {
      const cola = cliente.tablas[tabla] ?? [{ data: null, error: null }]
      const n = cliente.lecturas[tabla] ?? 0
      cliente.lecturas[tabla] = n + 1
      return consulta(cola[Math.min(n, cola.length - 1)])
    },
  }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/red/cliente-con-senal', () => ({ clienteConSenal: (c: unknown) => c }))

import { CONFIG_SKINS_POR_DEFECTO } from '@/golf/formats/skins'
import { useValorDelHoyoSkins } from './useValorDelHoyoSkins'
import type { RondaLibre } from '@/types/ronda'

const HOYOS = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
const RONDA = {
  id: 'r1', codigo: 'NET', course_id: 'c1', holes: 18, hoyo_inicio: 1, recorridos: null, tees: 'blanco',
  formato_juego: 'skins',
  reglas_juego: { config: { ...CONFIG_SKINS_POR_DEFECTO, modo: 'neto' }, jugadorIds: ['a', 'b'] },
  ronda_libre_jugadores: [
    { id: 'a', nombre: 'Ana', handicap: 10, tees: null },
    { id: 'b', nombre: 'Beto', handicap: 20, tees: null },
  ],
} as unknown as RondaLibre

describe('useValorDelHoyoSkins — neto con el rating cortado una vez', () => {
  beforeEach(() => { vi.useFakeTimers(); cliente.lecturas = {} })
  afterEach(() => { vi.useRealTimers() })

  it('los hoyos se leen bien, el rating falla una vez por red y luego responde: la cifra aparece', async () => {
    cliente.tablas = {
      course_holes: [{ data: HOYOS, error: null }],
      // postgrest-js sin red: no lanza, devuelve { error } con code vacío.
      courses: [
        { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } },
        { data: { slope_rating: 130, course_rating: 72, par_total: 72 }, error: null },
      ],
      course_tees: [{ data: null, error: null }],
    }
    const { result } = renderHook(() => useValorDelHoyoSkins({
      ronda: RONDA, scores: {}, fuera: {}, retiros: undefined, currentHole: 1, plazoMs: 10_000, esperasMs: [30_000],
    }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current).toBeNull()
    expect(cliente.lecturas.courses).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(cliente.lecturas.courses).toBe(2)
    expect(result.current).toEqual({ valor: 1, provisional: false })
  })

  it('la cancha sin rating (leída bien) no se relee: «—» es la respuesta correcta', async () => {
    cliente.tablas = {
      course_holes: [{ data: HOYOS, error: null }],
      courses: [{ data: null, error: null }],
      course_tees: [{ data: null, error: null }],
    }
    const { result } = renderHook(() => useValorDelHoyoSkins({
      ronda: RONDA, scores: {}, fuera: {}, retiros: undefined, currentHole: 1, plazoMs: 10_000, esperasMs: [30_000],
    }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000) })
    expect(cliente.lecturas.courses).toBe(1)
    expect(result.current).toBeNull()
  })
})
