import { describe, it, expect } from 'vitest'
import { fetchProfile, countTournaments, fetchCpi, fetchRondasCPI, fetchFedegolfStatus } from './perfil'
import { OR_EXCLUDE_FEDEGOLF } from './historical-rounds-filters'

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

/** Builder chainable que anota cada filtro y resuelve `resultado` al hacer await. */
function lectura(resultado: { data: unknown; error: unknown }) {
  const filtros: Array<[string, ...unknown[]]> = []
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'order', 'limit']) b[m] = (...args: unknown[]) => { filtros.push([m, ...args]); return b }
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, ko)
  return { filtros, supabase: { from: () => b } }
}

describe('fetchRondasCPI — fuente única de las superficies del CPI', () => {
  it('excluye FedeGolf y las rondas excluidas del índice', async () => {
    const { filtros, supabase } = lectura({ data: [{ played_at: '2026-01-01', diferencial: 12.2 }], error: null })
    const rondas = await fetchRondasCPI(mockSupabase(supabase), 'u1')
    expect(rondas).toEqual([{ played_at: '2026-01-01', diferencial: 12.2 }])
    expect(filtros).toContainEqual(['or', OR_EXCLUDE_FEDEGOLF])
    expect(filtros).toContainEqual(['eq', 'excluded_from_handicap', false])
    expect(filtros).toContainEqual(['eq', 'user_id', 'u1'])
  })
  it('null si la lectura falla', async () => {
    const { supabase } = lectura({ data: null, error: { message: 'boom' } })
    expect(await fetchRondasCPI(mockSupabase(supabase), 'u1')).toBeNull()
  })
})

describe('fetchCpi', () => {
  it('mapea rondas y delega en calcularCPI (shape ResultadoCPI)', async () => {
    const { supabase } = lectura({ data: [{ played_at: '2026-01-01', diferencial: 12.2 }], error: null })
    const cpi = await fetchCpi(mockSupabase(supabase), 'u1')
    expect(cpi).not.toBeNull()
    expect(typeof cpi?.score).toBe('number')
    expect(['insufficient_data', 'provisional', 'established']).toContain(cpi?.status)
    expect(typeof cpi?.rondas_usadas).toBe('number')
  })

  it('devuelve null si la query falla', async () => {
    const { supabase } = lectura({ data: null, error: { message: 'boom' } })
    expect(await fetchCpi(mockSupabase(supabase), 'u1')).toBeNull()
  })
})

describe('fetchFedegolfStatus', () => {
  const withRow = (row: unknown) =>
    mockSupabase({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) })

  it('reporta vinculado con índice y sync cuando hay fila activa', async () => {
    const s = await fetchFedegolfStatus(withRow({ ultimo_indice: 9.6, ultimo_sync: '2026-07-13T00:00:00Z', activo: true }), 'u1')
    expect(s).toEqual({ vinculado: true, requiereReconexion: false, ultimoIndice: 9.6, ultimoSync: '2026-07-13T00:00:00Z', sinIndiceDesde: null })
  })

  it('reporta NO vinculado cuando no hay fila', async () => {
    const s = await fetchFedegolfStatus(withRow(null), 'u1')
    expect(s).toEqual({ vinculado: false, requiereReconexion: false, ultimoIndice: null, ultimoSync: null, sinIndiceDesde: null })
  })

  it('clave rechazada (activo=false) → no vinculado + requiereReconexion (CTA "Reconectar")', async () => {
    const s = await fetchFedegolfStatus(withRow({ ultimo_indice: 9.6, ultimo_sync: '2026-07-13T00:00:00Z', activo: false }), 'u1')
    expect(s).toMatchObject({ vinculado: false, requiereReconexion: true })
  })

  it('FedeGolf sin índice vigente: trae desde cuándo (la UI deja de rotularlo oficial)', async () => {
    const s = await fetchFedegolfStatus(
      withRow({ ultimo_indice: 9.6, ultimo_sync: '2026-10-19T00:00:00Z', activo: true, sin_indice_desde: '2026-10-10T09:00:00Z' }), 'u1')
    expect(s).toMatchObject({ vinculado: true, ultimoIndice: 9.6, sinIndiceDesde: '2026-10-10T09:00:00Z' })
  })

  it('vinculado sin índice aún: índice y sync en null', async () => {
    const s = await fetchFedegolfStatus(withRow({ ultimo_indice: null, ultimo_sync: null, activo: true }), 'u1')
    expect(s).toEqual({ vinculado: true, requiereReconexion: false, ultimoIndice: null, ultimoSync: null, sinIndiceDesde: null })
  })
})
