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

  // Genera rondas completas de 18 hoyos, una por displayValue dado.
  function rounds(perRound: string[]) {
    return perRound.map(dv => ({ displayValue: dv, linescores: Array.from({ length: 18 }, () => ({ displayValue: '4' })) }))
  }

  it('finalizado: "Hoy/Thru" reflejan la ÚLTIMA ronda, no la ronda 1', async () => {
    const c = { score: '-12', athlete: { displayName: 'Final Player', flag: { alt: 'USA' } }, linescores: rounds(['-1', '-2', '-4', '-5']), status: {} }
    stubEspn([c], 'post', 'Final')
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    const p = json.players[0]
    expect(p.thru).toBe('F')
    expect(p.today).toBe('-5')   // R4, NO la R1 (-1)
    expect(p.roundNum).toBe(4)
  })

  it('en vivo R2 en curso: thru = hoyos jugados, hoy = score de la ronda actual', async () => {
    const leader = {
      score: '-6',
      athlete: { displayName: 'Leader', flag: { alt: 'Spain' } },
      linescores: [
        { displayValue: '-3', linescores: Array.from({ length: 18 }, () => ({ displayValue: '4' })) },
        { displayValue: '-3', linescores: Array.from({ length: 14 }, () => ({ displayValue: '4' })) },
      ],
      status: {},
    }
    stubEspn([leader], 'in', 'Round 2 - In Progress')
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    const p = json.players[0]
    expect(p.roundNum).toBe(2)
    expect(p.thru).toBe('14')
    expect(p.today).toBe('-3')
    expect(json.live).toBe(true)
  })

  it('evento de equipo: isTeam + isTeamEvent, sin bandera, nombre = equipo', async () => {
    const team = (name: string, score: string) => ({ score, team: { displayName: name, shortDisplayName: name }, linescores: [], status: {} })
    stubEspn([team('Lowry/McIlroy', '-15'), team('Cantlay/Schauffele', '-13')], 'post', 'Final')
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json.isTeamEvent).toBe(true)
    expect(json.players[0].isTeam).toBe(true)
    expect(json.players[0].flag).toBe('')
    expect(json.players[0].name).toBe('Lowry/McIlroy')
  })

  it('scores no numéricos (MC/WD) no rompen el ranking', async () => {
    stubEspn([comp('Líder', '-5'), comp('Sin score', 'E'), comp('Otro', '+3')], 'post', 'Final')
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json.players).toHaveLength(3)
    expect(json.players.every((p: { position: string }) => typeof p.position === 'string' && p.position.length > 0)).toBe(true)
  })
})
