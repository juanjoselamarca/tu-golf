/**
 * Ruta /api/pga-live: mapeo del scoreboard de ESPN a nuestro DTO.
 * Foco: campo COMPLETO (sin cap de top-10) + posiciones con empates en O(n).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/pga/projectedCut', () => ({ getProjectedCut: vi.fn(async () => null) }))

// Construye un competidor ESPN mínimo (solo lo que la ruta lee).
function comp(name: string, score: string, country = 'United States') {
  return {
    score,
    athlete: { displayName: name, flag: { alt: country } },
    linescores: [],
    status: {},
  }
}

function stubEspn(competitors: unknown[], state = 'post', shortDetail = 'Complete', name = 'RBC Canadian Open') {
  const payload = {
    events: [{
      name,
      shortName: name,
      competitions: [{
        competitors,
        status: { type: { state, shortDetail, detail: shortDetail } },
        venue: { fullName: 'Hamilton G&CC' },
      }],
    }],
  }
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) } as Response)))
}

describe('/api/pga-live — mapeo ESPN', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('devuelve el campo COMPLETO, no solo top-10', async () => {
    // 25 jugadores con scores estrictamente decrecientes (sin empates).
    const field = Array.from({ length: 25 }, (_, i) => comp(`Player ${i}`, String(i - 12)))
    stubEspn(field)
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json.players).toHaveLength(25)
    expect(json.tournament).toBe('RBC Canadian Open')
  })

  it('posiciones con empates: comparten el número más bajo con prefijo T', async () => {
    stubEspn([
      comp('Líder', '-10'),
      comp('Empate A', '-8'),
      comp('Empate B', '-8'),
      comp('Cuarto', '-7'),
    ])
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    const pos = json.players.map((p: { position: string }) => p.position)
    expect(pos).toEqual(['1', 'T2', 'T2', '4'])
  })

  it('sin evento → active:false con next_event', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) } as Response)))
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json.active).toBe(false)
    expect(json.next_event).toBeTruthy()
  })
})
