import { describe, it, expect } from 'vitest'
import {
  enrichPlaying,
  findTorneoInminente,
  enrichOrganizing,
  buildFinalizados,
  buildFinishedRondas,
  injectUltimaRondaDetalle,
} from './dashboard-derive'
import type { Tournament, HistoricalRound, RondaLibre } from './types'

const NOW = new Date('2026-06-03T12:00:00Z').getTime()

function torneo(over: Partial<Tournament> = {}): Tournament {
  return { id: 't1', name: 'T', slug: 's', status: 'open', date_start: null, ...over }
}
function ronda(over: Partial<RondaLibre> = {}): RondaLibre {
  return { id: 'r1', codigo: 'ABC', course_name: 'Los Leones', fecha: '2026-06-03', estado: 'finalizada', ...over }
}
function hist(over: Partial<HistoricalRound> = {}): HistoricalRound {
  return { id: 'h1', total_gross: 85, course_name: 'Los Leones', played_at: '2026-06-03', diferencial: 12, holes_played: 18, ...over }
}

describe('enrichPlaying', () => {
  it('calcula diasRestantes desde date_start', () => {
    const t = torneo({ date_start: '2026-06-06T12:00:00Z' })
    const [r] = enrichPlaying([t], NOW)
    expect(r.diasRestantes).toBe(3)
    expect(r.horaSalida).toBeNull()
  })
  it('diasRestantes = 0 si no hay date_start', () => {
    expect(enrichPlaying([torneo()], NOW)[0].diasRestantes).toBe(0)
  })
})

describe('findTorneoInminente', () => {
  it('encuentra torneo dentro de 7 días', () => {
    const enriched = enrichPlaying([torneo({ date_start: '2026-06-05T12:00:00Z' })], NOW)
    expect(findTorneoInminente(enriched, NOW)?.id).toBe('t1')
  })
  it('ignora torneo a más de 7 días', () => {
    const enriched = enrichPlaying([torneo({ date_start: '2026-06-20T12:00:00Z' })], NOW)
    expect(findTorneoInminente(enriched, NOW)).toBeNull()
  })
  it('ignora torneo ya pasado (diasRestantes < 0)', () => {
    const enriched = enrichPlaying([torneo({ date_start: '2026-06-01T12:00:00Z' })], NOW)
    expect(findTorneoInminente(enriched, NOW)).toBeNull()
  })
})

describe('enrichOrganizing', () => {
  it('filtra solo open/in_progress/active', () => {
    const res = enrichOrganizing([
      torneo({ id: 'a', status: 'open' }),
      torneo({ id: 'b', status: 'finished' }),
      torneo({ id: 'c', status: 'active' }),
    ])
    expect(res.map((t) => t.id)).toEqual(['a', 'c'])
    expect(res[0].inscritos).toBe(0)
    expect(res[0].hoyoActual).toBeNull()
  })
})

describe('buildFinalizados', () => {
  it('toma finished/closed de jugados + organizados, máx 2', () => {
    const played = [torneo({ id: 'p1', status: 'finished' }), torneo({ id: 'p2', status: 'closed' })]
    const organized = [torneo({ id: 'o1', status: 'finished' }), torneo({ id: 'o2', status: 'open' })]
    const res = buildFinalizados(played, organized)
    expect(res).toHaveLength(2)
    expect(res.map((t) => t.id)).toEqual(['p1', 'p2'])
  })
})

describe('buildFinishedRondas', () => {
  it('matchea por course_name + fecha y deja scores/parPerHole en null (historico slim)', () => {
    const rondas = [ronda()]
    const historico = [hist()]
    const [r] = buildFinishedRondas(rondas, historico)
    expect(r.total_gross).toBe(85)
    expect(r.vsPar).not.toBeNull()
    expect(r.scores).toBeNull()
    expect(r.parPerHole).toBeNull()
  })
  it('sin match deja total_gross/vsPar en null', () => {
    const [r] = buildFinishedRondas([ronda({ course_name: 'Otra' })], [hist()])
    expect(r.total_gross).toBeNull()
    expect(r.vsPar).toBeNull()
  })
})

describe('injectUltimaRondaDetalle', () => {
  const base = buildFinishedRondas([ronda({ id: 'r1' }), ronda({ id: 'r2', codigo: 'XYZ' })], [hist(), hist({ id: 'h2' })])
  it('inyecta scores/parPerHole solo en la ronda con id coincidente', () => {
    const detalle = { scores: [4, 5, 3], parPerHole: [4, 4, 3] }
    const res = injectUltimaRondaDetalle(base, 'r1', detalle)
    expect(res.find((r) => r.id === 'r1')?.scores).toEqual([4, 5, 3])
    expect(res.find((r) => r.id === 'r2')?.scores).toBeNull()
  })
  it('detalle null devuelve el array sin cambios', () => {
    expect(injectUltimaRondaDetalle(base, 'r1', null)).toBe(base)
  })
})
