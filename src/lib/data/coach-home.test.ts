import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
vi.mock('@/lib/data/historial', () => ({ fetchRondasNormalizadas: vi.fn(async () => []) }))
import { captureError } from '@/lib/error-tracking'
import { fetchRondasNormalizadas } from '@/lib/data/historial'
import { fetchCoachHome } from './coach-home'

type Resultado = { data?: unknown; error?: unknown; count?: number | null }

/**
 * Cliente simulado: cada `from(tabla)` devuelve un builder chainable que anota sus
 * filtros. Al hacer await resuelve `resultados[tabla]`; con `.maybeSingle()` resuelve
 * `resultados['tabla:uno']`.
 */
function clienteSimulado(resultados: Record<string, Resultado>) {
  const llamadas: Array<{ tabla: string; filtros: Array<[string, ...unknown[]]> }> = []
  const supabase = {
    from(tabla: string) {
      const filtros: Array<[string, ...unknown[]]> = []
      llamadas.push({ tabla, filtros })
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'not', 'or', 'order', 'limit', 'gte']) {
        b[m] = (...args: unknown[]) => { filtros.push([m, ...args]); return b }
      }
      const vacio: Resultado = { data: null, error: null, count: null }
      b.maybeSingle = async () => resultados[`${tabla}:uno`] ?? vacio
      b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve(resultados[tabla] ?? vacio).then(ok, ko)
      return b
    },
  }
  return { supabase: supabase as never, llamadas }
}

const PLAN = { id: 'p1', pattern_id: 'post_bogey_spiral', hypothesis: 'h', rule: 'r', status: 'active', created_at: '2026-11-01', duration_days: 14 }

beforeEach(() => {
  vi.mocked(captureError).mockClear()
  vi.mocked(fetchRondasNormalizadas).mockReset().mockResolvedValue([])
})

describe('fetchCoachHome', () => {
  it('arma la home con sesiones, sesión principal, patrones, plan, outcomes y total', async () => {
    const { supabase, llamadas } = clienteSimulado({
      taiger_sessions: { data: [{ id: 's1', session_type: 'free', created_at: '2026-11-10', next_focus: null }], error: null },
      'taiger_sessions:uno': { data: { id: 's0' }, error: null },
      player_patterns: { data: [{ id: 'pp1', pattern_type: 'post_bogey_spiral', confidence: 0.7, data_points: 8, status: 'active', first_detected: '2026-10-01' }], error: null },
      'coach_plans:uno': { data: PLAN, error: null },
      plan_outcomes: { data: [{ target_reached: true, compliance: 'full', played_at: '2026-11-12' }], error: null },
    })
    const home = await fetchCoachHome(supabase, 'u1')
    expect(home.sessions).toHaveLength(1)
    expect(home.primarySessionId).toBe('s0')
    expect(home.patterns[0].pattern_type).toBe('post_bogey_spiral')
    expect(home.plan?.id).toBe('p1')
    expect(home.outcomes).toHaveLength(1)
    expect(home.rondas).toEqual([])
    // Las rondas son las normalizadas de /perfil/stats, del mismo usuario.
    expect(fetchRondasNormalizadas).toHaveBeenCalledWith(supabase, 'u1')
    expect(llamadas.some(l => l.tabla === 'historical_rounds')).toBe(false)
    // Los outcomes se leen del plan activo, no de cualquier plan.
    const outcomes = llamadas.find(l => l.tabla === 'plan_outcomes')
    expect(outcomes?.filtros).toContainEqual(['eq', 'plan_id', 'p1'])
    // Todo scopeado al usuario.
    for (const l of llamadas.filter(l => l.tabla !== 'plan_outcomes')) {
      expect(l.filtros).toContainEqual(['eq', 'user_id', 'u1'])
    }
  })

  it('sin plan activo no lee outcomes', async () => {
    const { supabase, llamadas } = clienteSimulado({})
    const home = await fetchCoachHome(supabase, 'u1')
    expect(home.plan).toBeNull()
    expect(home.outcomes).toEqual([])
    expect(llamadas.some(l => l.tabla === 'plan_outcomes')).toBe(false)
  })

  it('un error de lectura se reporta con captureError y no rompe la home', async () => {
    const { supabase } = clienteSimulado({
      player_patterns: { data: null, error: { message: 'timeout' } },
    })
    const home = await fetchCoachHome(supabase, 'u1')
    expect(home.patterns).toEqual([])
    expect(captureError).toHaveBeenCalledWith({ message: 'timeout' }, expect.objectContaining({ context: 'fetchCoachHome:patrones', userId: 'u1' }))
  })

  it('si fallan las rondas devuelve null (la página no dice "Bienvenido")', async () => {
    vi.mocked(fetchRondasNormalizadas).mockResolvedValue(null)
    const { supabase } = clienteSimulado({})
    const home = await fetchCoachHome(supabase, 'u1')
    expect(home.rondas).toBeNull()
  })
})
