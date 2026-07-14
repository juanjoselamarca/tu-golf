import { describe, it, expect } from 'vitest'
import { fetchProfile, countTournaments, fetchCpi, fetchFedegolfStatus } from './perfil'

// Cliente Supabase mockeado con builder chainable (cast a never para el tipo).
function mockSupabase(handlers: unknown) {
  return handlers as never
}

describe('fetchProfile', () => {
  it('devuelve el profile del usuario', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: 'u1', name: 'Ana', indice: 12.3, avatar_url: null,
                indice_golfers: 10.1, indice_golfers_updated_at: null,
                nivel: null, nivel_updated_at: null, nivel_expires_at: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    }
    const p = await fetchProfile(mockSupabase(supabase), 'u1')
    expect(p?.name).toBe('Ana')
    expect(p?.indice).toBe(12.3)
  })

  it('devuelve null si no hay profile', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'no rows' } }) }) }) }) }
    const p = await fetchProfile(mockSupabase(supabase), 'u1')
    expect(p).toBeNull()
  })
})

describe('countTournaments', () => {
  it('devuelve el count', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: async () => ({ count: 7, error: null }) }) }) }
    const n = await countTournaments(mockSupabase(supabase), 'u1')
    expect(n).toBe(7)
  })

  it('devuelve 0 si count es null', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: async () => ({ count: null, error: null }) }) }) }
    expect(await countTournaments(mockSupabase(supabase), 'u1')).toBe(0)
  })
})

describe('fetchCpi', () => {
  it('mapea rondas y delega en calcularCPI (shape ResultadoCPI)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: [{ played_at: '2026-01-01', total_gross: 85, course_rating: 72, slope_rating: 120, holes_played: 18 }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }
    const cpi = await fetchCpi(mockSupabase(supabase), 'u1')
    expect(cpi).not.toBeNull()
    expect(typeof cpi?.score).toBe('number')
    expect(['insufficient_data', 'provisional', 'established']).toContain(cpi?.status)
    expect(typeof cpi?.rondas_usadas).toBe('number')
  })

  it('devuelve null si la query falla', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }) }
    expect(await fetchCpi(mockSupabase(supabase), 'u1')).toBeNull()
  })
})

describe('fetchFedegolfStatus', () => {
  const withRow = (row: unknown) =>
    mockSupabase({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) })

  it('reporta vinculado con índice y sync cuando hay fila activa', async () => {
    const s = await fetchFedegolfStatus(withRow({ ultimo_indice: 9.6, ultimo_sync: '2026-07-13T00:00:00Z', activo: true }), 'u1')
    expect(s).toEqual({ vinculado: true, ultimoIndice: 9.6, ultimoSync: '2026-07-13T00:00:00Z' })
  })

  it('reporta NO vinculado cuando no hay fila', async () => {
    const s = await fetchFedegolfStatus(withRow(null), 'u1')
    expect(s).toEqual({ vinculado: false, ultimoIndice: null, ultimoSync: null })
  })

  it('reporta NO vinculado cuando la fila está inactiva (activo=false)', async () => {
    const s = await fetchFedegolfStatus(withRow({ ultimo_indice: 9.6, ultimo_sync: '2026-07-13T00:00:00Z', activo: false }), 'u1')
    expect(s.vinculado).toBe(false)
  })

  it('vinculado sin índice aún: índice y sync en null', async () => {
    const s = await fetchFedegolfStatus(withRow({ ultimo_indice: null, ultimo_sync: null, activo: true }), 'u1')
    expect(s).toEqual({ vinculado: true, ultimoIndice: null, ultimoSync: null })
  })
})
