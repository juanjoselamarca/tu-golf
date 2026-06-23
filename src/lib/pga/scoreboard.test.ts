/**
 * Mapeo PURO del scoreboard de ESPN → DTO del widget PGA (parseScoreboard).
 * Sin red: se le pasa el JSON de ESPN tal cual. Cubre el campo completo, empates,
 * estados (pre/live/post) y los fixes del reporte inbox 22-jun.
 */
import { describe, it, expect } from 'vitest'
import { parseScoreboard } from './scoreboard'

function comp(name: string, score: string, country = 'United States') {
  return { score, athlete: { displayName: name, flag: { alt: country } }, linescores: [], status: {} }
}

function espn(competitors: unknown[], opts: {
  state?: string; shortDetail?: string; name?: string; date?: string; endDate?: string; venue?: string
} = {}) {
  const { state = 'post', shortDetail = 'Complete', name = 'RBC Canadian Open', date, endDate, venue = 'Hamilton G&CC' } = opts
  return {
    events: [{
      name, shortName: name, date, endDate,
      competitions: [{
        competitors,
        status: { type: { state, shortDetail, detail: shortDetail } },
        venue: { fullName: venue },
      }],
    }],
  }
}

const TODAY = '2026-06-23'

describe('parseScoreboard — mapeo ESPN', () => {
  it('devuelve el campo COMPLETO, no solo top-10', () => {
    const field = Array.from({ length: 25 }, (_, i) => comp(`Player ${i}`, String(i - 12)))
    const { dto } = parseScoreboard(espn(field), TODAY)
    expect(dto.players).toHaveLength(25)
    expect(dto.tournament).toBe('RBC Canadian Open')
  })

  it('posiciones con empates: comparten el número más bajo con prefijo T', () => {
    const { dto } = parseScoreboard(espn([
      comp('Líder', '-10'), comp('Empate A', '-8'), comp('Empate B', '-8'), comp('Cuarto', '-7'),
    ]), TODAY)
    expect(dto.players!.map(p => p.position)).toEqual(['1', 'T2', 'T2', '4'])
  })

  it('sin evento → active:false con next_event', () => {
    const { dto, needsCut } = parseScoreboard({ events: [] }, TODAY)
    expect(dto.active).toBe(false)
    expect(dto.next_event).toBeTruthy()
    expect(needsCut).toBe(false)
  })

  function rounds(perRound: string[]) {
    return perRound.map(dv => ({ displayValue: dv, linescores: Array.from({ length: 18 }, () => ({ displayValue: '4' })) }))
  }

  it('finalizado: "Hoy/Thru" reflejan la ÚLTIMA ronda, no la ronda 1', () => {
    const c = { score: '-12', athlete: { displayName: 'Final Player', flag: { alt: 'USA' } }, linescores: rounds(['-1', '-2', '-4', '-5']), status: {} }
    const { dto } = parseScoreboard(espn([c], { state: 'post', shortDetail: 'Final' }), TODAY)
    const p = dto.players![0]
    expect(p.thru).toBe('F')
    expect(p.today).toBe('-5')
    expect(p.roundNum).toBe(4)
  })

  it('en vivo R2 en curso: thru = hoyos jugados, hoy = score de la ronda actual', () => {
    const leader = {
      score: '-6', athlete: { displayName: 'Leader', flag: { alt: 'Spain' } },
      linescores: [
        { displayValue: '-3', linescores: Array.from({ length: 18 }, () => ({ displayValue: '4' })) },
        { displayValue: '-3', linescores: Array.from({ length: 14 }, () => ({ displayValue: '4' })) },
      ],
      status: {},
    }
    const { dto, needsCut } = parseScoreboard(espn([leader], { state: 'in', shortDetail: 'Round 2 - In Progress' }), TODAY)
    const p = dto.players![0]
    expect(p.roundNum).toBe(2)
    expect(p.thru).toBe('14')
    expect(p.today).toBe('-3')
    expect(dto.live).toBe(true)
    expect(needsCut).toBe(true)
  })

  it('evento de equipo: isTeamEvent + isTeam, sin bandera, nombre = equipo', () => {
    const team = (name: string, score: string) => ({ score, team: { displayName: name, shortDisplayName: name }, linescores: [], status: {} })
    const { dto } = parseScoreboard(espn([team('Lowry/McIlroy', '-15'), team('Cantlay/Schauffele', '-13')], { shortDetail: 'Final' }), TODAY)
    expect(dto.isTeamEvent).toBe(true)
    expect(dto.players![0].isTeam).toBe(true)
    expect(dto.players![0].flag).toBe('')
    expect(dto.players![0].name).toBe('Lowry/McIlroy')
  })

  // ── Fixes del reporte inbox 22-jun ──

  it('PRE (torneo por empezar): NO es board en vivo → active:false + próximo evento de ESPN', () => {
    const field = Array.from({ length: 72 }, (_, i) => comp(`P${i}`, '0'))
    const { dto, needsCut } = parseScoreboard(
      espn(field, { state: 'pre', shortDetail: '6/25 - 12:00 AM EDT', name: 'Travelers Championship', date: '2026-06-25T04:00Z', endDate: '2026-06-28T04:00Z', venue: 'TPC River Highlands' }),
      TODAY,
    )
    expect(dto.active).toBe(false)        // ← antes salía true → "En vivo" falso
    expect(dto.live).toBe(false)
    expect(needsCut).toBe(false)
    expect(dto.next_event).toEqual({
      name: 'Travelers Championship', start: '2026-06-25', end: '2026-06-28', venue: 'TPC River Highlands',
    })
  })

  it('FINALIZADO: round queda vacío (nunca un "Ronda 1 · Suspendida" stale del feed)', () => {
    // ESPN a veces deja un shortDetail stale al cerrar el evento.
    const { dto } = parseScoreboard(espn([comp('Campeón', '-10')], { state: 'post', shortDetail: 'Round 1 - Suspended' }), TODAY)
    expect(dto.complete).toBe(true)
    expect(dto.round).toBe('')            // ← no propaga el detalle stale
    expect(dto.active).toBe(true)         // terminado SÍ muestra board (con campeón)
  })

  it('EN VIVO: el round sí se traduce y se muestra', () => {
    const { dto } = parseScoreboard(espn([comp('A', '-3')], { state: 'in', shortDetail: 'Round 3 - In Progress' }), TODAY)
    expect(dto.round).toBe('Ronda 3 · En curso')
  })
})
