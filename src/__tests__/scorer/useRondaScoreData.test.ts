import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useRondaScoreData } from '@/app/ronda-libre/[codigo]/score/hooks/useRondaScoreData'

// Chainable query builder stub that supports .in(), .order(), .single()
function makeQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {}

  const orderChain = {
    order: () => orderChain,
    then: (resolve: (v: { data: unknown[] }) => void) => resolve({ data: [] }),
    // make it awaitable
    [Symbol.toPrimitive]: undefined,
  }
  // Make orderChain thenable (awaitable)
  Object.defineProperty(orderChain, 'then', {
    value: (onfulfilled: (v: { data: unknown[] }) => void) => {
      return Promise.resolve({ data: [] }).then(onfulfilled)
    },
    configurable: true,
  })
  // Also support direct await by implementing the promise interface
  const awaitableOrderChain = {
    order: () => awaitableOrderChain,
  } as { order: () => typeof awaitableOrderChain } & Promise<{ data: unknown[] }>
  Object.assign(awaitableOrderChain, {
    then: (onfulfilled: (v: { data: unknown[] }) => void, onrejected?: (e: unknown) => void) =>
      Promise.resolve({ data: [] }).then(onfulfilled, onrejected),
    catch: (onrejected: (e: unknown) => void) => Promise.resolve({ data: [] }).catch(onrejected),
    finally: (f: () => void) => Promise.resolve({ data: [] }).finally(f),
  })

  builder['select'] = () => builder
  builder['eq'] = () => builder
  builder['in'] = () => builder
  builder['order'] = () => awaitableOrderChain
  builder['single'] = async () => {
    if (table === 'rondas_libres') {
      return {
        data: {
          id: 'r1', codigo: 'ABC123', course_name: 'Los Leones',
          course_id: null, tees: 'azul', holes: 9, fecha: '2026-05-12',
          estado: 'en_curso', modo_juego: 'gross', formato_juego: 'stroke_play',
          hoyo_inicio: 1, admin_mode: false, admin_user_id: null, recorridos: null,
          ronda_libre_jugadores: [{
            id: 'p1', nombre: 'Juanjo', user_id: 'u1',
            scores: {}, handicap: 11.1, tees: 'azul',
          }],
        },
      }
    }
    return { data: null }
  }
  return builder
}

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => makeQueryBuilder(table),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/golf/core/course-handicap', () => ({
  resolverCourseHandicap: () => 11,
  resolverCourseHandicapDisplay: () => 15,
  cargarCourseData: async () => ({ cr: 72, slope: 113, holes: 9, parTotal: 36 }),
}))

vi.mock('@/lib/ronda/score-storage', () => ({
  loadScores: () => ({}),
  saveScores: vi.fn(),
  clearScores: vi.fn(),
}))

vi.mock('@/golf/core/round-score', () => ({
  parTotalEstandar: (holes: number) => holes * 4,
}))

describe('useRondaScoreData', () => {
  it('carga ronda + jugadores y deja loading en false', async () => {
    const { result } = renderHook(() => useRondaScoreData('ABC123', null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.ronda?.codigo).toBe('ABC123')
    expect(result.current.ronda?.ronda_libre_jugadores.length).toBe(1)
    // playerHcp = scoring (9h); playerDisplayHcp = completo (18h) para mostrar.
    expect(result.current.playerHcp.p1).toBe(11)
    expect(result.current.playerDisplayHcp.p1).toBe(15)
  })

  it('devuelve activeJugadorId del jugador matched por user_id', async () => {
    const { result } = renderHook(() => useRondaScoreData('ABC123', null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeJugadorId).toBe('p1')
  })
})
