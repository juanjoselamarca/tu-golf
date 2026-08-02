// Podio y stats del torneo cerrado — los dos lugares que seguían reconstruyendo
// el neto por su cuenta después de que #287 unificó el board.
//
// Hallazgos del code-reviewer sobre el PR del board (M1 y M2):
//  - el podio reconstruía los golpes netos como `total + parTotal`, válido sólo
//    cuando el jugador completó una vuelta de una cancha cuyo par es `parTotal`;
//  - las stats seguían leyendo `rounds[0].total_net`, la columna que el propio
//    motor declara envenenada, y sólo la ronda 1.

import { describe, it, expect } from 'vitest'
import { computeTournamentResults } from './compute-tournament-results'
import { computeStats } from './compute-stats'
import type { CourseHole } from './types'
import type { Player } from '@/lib/golf-data'

function jugador(over: Partial<Player> & { name: string }): Player {
  return {
    pos: over.pos ?? 1,
    name: over.name,
    country: 'CL',
    cat: 'General',
    hcp: over.hcp ?? 0,
    today: over.today ?? 0,
    total: over.total ?? 0,
    grossTotal: over.grossTotal,
    netTotal: over.netTotal,
    holes: over.holes ?? 18,
    status: over.status ?? 'F',
    scores: over.scores ?? new Array(18).fill(4),
  }
}

describe('computeTournamentResults — golpes netos del podio', () => {
  it('torneo de 9 hoyos sobre cancha de par 72: NO infla el podio en 36 golpes', () => {
    // El jugador hizo 40 golpes netos en 9 hoyos (par jugado 36) → total = +4.
    // La fórmula vieja `total + parTotal` daba 4 + 72 = 76.
    // Torneo de 9 hoyos: la tarjeta tiene 9 casillas, todas jugadas.
    const p = jugador({
      name: 'Nueve', total: 4, netTotal: 40, grossTotal: 40, holes: 9,
      scores: new Array(9).fill(4) as (number | null)[],
    })

    const r = computeTournamentResults([p], [p], 72, null)

    expect(r?.netoWinner?.score).toBe(40)
    expect(r?.netoWinner?.score).not.toBe(76)
  })

  it('torneo de 18 hoyos sigue dando lo mismo que antes', () => {
    // 72 netos en una cancha par 72 → total = 0. Vieja y nueva coinciden.
    const p = jugador({ name: 'Dieciocho', total: 0, netTotal: 72, grossTotal: 72, holes: 18 })

    const r = computeTournamentResults([p], [p], 72, null)

    expect(r?.netoWinner?.score).toBe(72)
  })

  it('sin `netTotal` (datos mock) cae a la fórmula vieja', () => {
    const p = jugador({ name: 'Mock', total: -2, netTotal: undefined, holes: 18 })

    const r = computeTournamentResults([p], [p], 72, null)

    expect(r?.netoWinner?.score).toBe(70)
  })

  it('el bruto del podio usa el acumulado, no la tarjeta de la última vuelta', () => {
    // Multi-ronda: 145 golpes en dos vueltas, pero `scores` es sólo la segunda.
    const p = jugador({
      name: 'Multi', total: 1, netTotal: 145, grossTotal: 145, holes: 36,
      scores: new Array(18).fill(4), // 72 si se re-suma
    })

    const r = computeTournamentResults([p], [p], 72, null)

    expect(r?.grossWinner?.score).toBe(145)
    expect(r?.grossWinner?.score).not.toBe(72)
  })
})

describe('isFinishedCard — cerrada Y completa', () => {
  it('una ronda cerrada por el organizador con media tarjeta NO entra al podio', () => {
    // Caso real de prod (copa-lb-test): 3 rondas `closed` con 9 de 18 hoyos.
    // Con el predicado viejo (`status === 'F'`) entraban y ganaban por vs par:
    // 9 hoyos en par contra 18 en par empatan, y desempata el countback.
    const media = jugador({
      name: 'Media', total: -4, netTotal: 32, grossTotal: 32, holes: 9, status: 'F',
      scores: [...new Array(9).fill(4), ...new Array(9).fill(null)] as (number | null)[],
    })
    const entera = jugador({
      name: 'Entera', total: 1, netTotal: 73, grossTotal: 73, holes: 18, status: 'F',
      scores: new Array(18).fill(4),
    })

    const r = computeTournamentResults([media, entera], [media, entera], 72, null)

    expect(r?.netoWinner?.name).toBe('Entera')
    expect(r?.grossWinner?.name).toBe('Entera')
  })

  it('si nadie completó la vuelta no hay podio', () => {
    const media = jugador({
      name: 'Media', total: -4, netTotal: 32, holes: 9, status: 'F',
      scores: [...new Array(9).fill(4), ...new Array(9).fill(null)] as (number | null)[],
    })

    expect(computeTournamentResults([media], [media], 72, null)).toBeNull()
  })
})

describe('computeStats — el neto sale del ranking, no de la columna', () => {
  const COURSE_HOLES: CourseHole[] = Array.from({ length: 18 }, (_, i) => ({
    numero: i + 1,
    par: 4,
    stroke_index: i + 1,
  }))

  /** Jugador crudo con una o más rondas de `holes` hoyos a `gross` golpes. */
  function crudo(nombre: string, rondas: Array<{ holes: number; gross: number }>) {
    return {
      profiles: { name: nombre },
      rounds: rondas.map((r) => ({
        hole_scores: Array.from({ length: r.holes }, (_, i) => ({
          hole_number: i + 1,
          gross_score: r.gross,
        })),
      })),
    }
  }

  it('con `total_net` inexistente el neto igual sale bien', () => {
    // El dato crudo ni siquiera trae la columna: antes esto daba "mejor tarjeta 0".
    const ranked = [jugador({ name: 'Ana', total: -2, netTotal: 70, holes: 18 })]

    const s = computeStats([crudo('Ana', [{ holes: 18, gross: 4 }])], COURSE_HOLES, ranked)

    expect(s?.bestName).toBe('Ana')
    expect(s?.bestNet).toBe(70)
    expect(s?.avgNet).toBe(-2)
  })

  it('ignora a los que no terminaron', () => {
    const ranked = [
      jugador({ name: 'AMedias', total: -5, netTotal: 31, holes: 9, status: 'live' }),
      jugador({ name: 'Terminó', total: 1, netTotal: 73, holes: 18, status: 'F' }),
    ]

    const s = computeStats(
      [crudo('AMedias', [{ holes: 9, gross: 4 }]), crudo('Terminó', [{ holes: 18, gross: 4 }])],
      COURSE_HOLES,
      ranked,
    )

    expect(s?.bestName).toBe('Terminó')
    expect(s?.bestNet).toBe(73)
    expect(s?.avgNet).toBe(1)
  })

  it('sin nadie terminado no inventa una mejor tarjeta', () => {
    const ranked = [jugador({ name: 'Jugando', total: 0, netTotal: 36, holes: 9, status: 'live' })]

    const s = computeStats([crudo('Jugando', [{ holes: 9, gross: 4 }])], COURSE_HOLES, ranked)

    expect(s?.bestName).toBe('—')
    expect(s?.bestNet).toBe(0)
    expect(s?.avgNet).toBe(0)
  })

  it('eagles y birdies cuentan TODAS las rondas, no sólo la primera', () => {
    // Dos vueltas de 18 birdies (3 en par 4) → 36 birdies.
    const ranked = [jugador({ name: 'Multi', total: -36, netTotal: 108, holes: 36 })]

    const s = computeStats(
      [crudo('Multi', [{ holes: 18, gross: 3 }, { holes: 18, gross: 3 }])],
      COURSE_HOLES,
      ranked,
    )

    expect(s?.birdies).toBe(36)
  })

  it('sin scores devuelve null', () => {
    expect(computeStats([], COURSE_HOLES, [])).toBeNull()
  })
})
