// Stableford GROSS en TORNEOS (tabla `tournaments`): los puntos se cuentan contra
// el par, sin golpes de handicap (R&A Regla 21.1 / "Scratch Stableford").
//
// Gemelo del bug de campo de la ronda libre (04-oct-2026, Los Leones, hotfix #504):
// los dos builders del board de torneo calculaban `stablefordTotal` con el course
// handicap de cada jugador sin mirar el modo. Un CH 21 con par en los 18 sumaba
// 57 en vez de 36, y el ranking primario (por puntos) quedaba en neto.
//
// Lo que NO cambia y se fija acá también: el neto (`netTotal`, tab "Neto" del
// board) sigue repartiendo golpes en un torneo gross, y el Stableford NETO sigue
// dando los mismos puntos de siempre.

import { describe, it, expect } from 'vitest'
import { buildLeaderboardFromLegacy } from './build-from-legacy'
import { buildLeaderboardFromRondaLibre } from './build-from-ronda-libre'
import type { TournamentLeaderboardContext } from './types'
import type { DBPlayer, DBRondaLibreJugador } from '@/app/torneo/[slug]/types'
import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'
import {
  HOYOS_LEONES, TARJETAS_LEONES, PUNTOS_ESPERADOS_LEONES, PAR_LEONES,
} from '@/golf/core/__fixtures__/los-leones'

type Clave = keyof typeof TARJETAS_LEONES
const CLAVES: Clave[] = ['A', 'B', 'C', 'D']

/** CH 21 = el índice 18 de Los Leones (slope 142 / CR 75.1). Con par en los 18, 21 golpes = 57 pts netos. */
const CH = 21

function ctx(modoJuego: ModoJuego, formatoJuego: FormatoJuego, totalHoyos = 18): TournamentLeaderboardContext {
  const courseHoles = HOYOS_LEONES.filter((h) => h.numero <= totalHoyos)
  return {
    parTotal: courseHoles.reduce((s, h) => s + h.par, 0),
    totalHoyos,
    modoJuego,
    formatoJuego,
    courseHoles,
    // Sin contexto de handicap → gate 'raw': el course handicap es `handicap_at_registration`.
    hcp: null,
  }
}

function soloHoyos(scores: Record<string, number>, totalHoyos: number): Record<string, number> {
  return Object.fromEntries(Object.entries(scores).filter(([h]) => Number(h) <= totalHoyos))
}

function legacyPlayer(k: Clave, ch = CH, totalHoyos = 18): DBPlayer {
  const scores = soloHoyos(TARJETAS_LEONES[k], totalHoyos)
  return {
    id: k,
    handicap_at_registration: ch,
    player_name: `Jugador ${k}`,
    profiles: null,
    category_id: null,
    tee_id: null,
    categories: null,
    rounds: [{
      id: `r-${k}`,
      status: 'closed',
      total_gross: 0,
      total_net: 0,
      total_points: 0,
      round_number: 1,
      hole_scores: Object.entries(scores).map(([h, g]) => ({ hole_number: Number(h), gross_score: g })),
    }],
  }
}

function rondaLibreJugador(k: Clave, ch = CH, totalHoyos = 18): DBRondaLibreJugador {
  return {
    id: k,
    nombre: `Jugador ${k}`,
    user_id: null,
    scores: soloHoyos(TARJETAS_LEONES[k], totalHoyos),
    handicap: ch,
    handicap_index: 18,
    tees: 'azul',
    ronda_id: 'r1',
  }
}

/** Los dos caminos del board de torneo, con la MISMA interfaz para los tests. */
const BUILDERS = {
  legacy: (modo: ModoJuego, formato: FormatoJuego, opts: { ch?: number; hoyos?: number } = {}) =>
    buildLeaderboardFromLegacy(
      CLAVES.map((k) => legacyPlayer(k, opts.ch ?? CH, opts.hoyos ?? 18)),
      ctx(modo, formato, opts.hoyos ?? 18),
      1,
    ),
  'ronda-libre': (modo: ModoJuego, formato: FormatoJuego, opts: { ch?: number; hoyos?: number } = {}) =>
    buildLeaderboardFromRondaLibre(
      CLAVES.map((k) => rondaLibreJugador(k, opts.ch ?? CH, opts.hoyos ?? 18)),
      ctx(modo, formato, opts.hoyos ?? 18),
    ),
}

const porId = <T extends { id?: string }>(xs: T[], id: string) => xs.find((x) => x.id === id)!

describe.each(Object.entries(BUILDERS))('board de torneo (%s) — Stableford Gross', (_, build) => {
  it.each(CLAVES)('fixture %s con CH 21: puntos gross (sin golpes), no netos', (k) => {
    const out = build('gross', 'stableford')
    expect(porId(out.players, k).stablefordTotal).toBe(PUNTOS_ESPERADOS_LEONES[k])
  })

  it('el ranking primario (por puntos) es el gross: D 40, A 36, C 28, B 18', () => {
    const out = build('gross', 'stableford')
    expect(out.players.map((p) => p.id)).toEqual(['D', 'A', 'C', 'B'])
    expect(out.players.map((p) => p.total)).toEqual([40, 36, 28, 18])
  })

  it('un plus (CH −2) tampoco devuelve golpes en gross', () => {
    const out = build('gross', 'stableford', { ch: -2 })
    expect(porId(out.players, 'A').stablefordTotal).toBe(36)
  })

  it('9 hoyos: par en los 9 = 18 pts gross, con cualquier handicap', () => {
    const out = build('gross', 'stableford', { hoyos: 9, ch: 10 })
    expect(porId(out.players, 'A').stablefordTotal).toBe(18)
  })

  it('el GWI rankea con los mismos puntos gross que la tabla', () => {
    const out = build('gross', 'stableford')
    expect(porId(out.gwiInputs, 'A').currentScore).toBe(36)
    expect(porId(out.gwiInputs, 'D').currentScore).toBe(40)
  })

  it('el tab "Neto" de un torneo gross sigue siendo neto (A: 72 − 21 = 51)', () => {
    const out = build('gross', 'stableford')
    const a = porId(out.playersByNeto, 'A')
    expect(a.grossTotal).toBe(72)
    expect(a.netTotal).toBe(51)
  })
})

describe.each(Object.entries(BUILDERS))('board de torneo (%s) — Stableford Neto NO cambia', (_, build) => {
  it('A con CH 21 y par en los 18 = 36 + 21 = 57', () => {
    const out = build('neto', 'stableford')
    expect(porId(out.players, 'A').stablefordTotal).toBe(57)
    expect(porId(out.gwiInputs, 'A').currentScore).toBe(57)
  })

  it('9 hoyos: CH 10 con par en los 9 = 18 + 10 = 28', () => {
    const out = build('neto', 'stableford', { hoyos: 9, ch: 10 })
    expect(porId(out.players, 'A').stablefordTotal).toBe(28)
  })
})

describe.each(Object.entries(BUILDERS))('board de torneo (%s) — Stroke Play', (_, build) => {
  it('gross: el score es el bruto vs par (B bogey en los 18 = +18)', () => {
    const out = build('gross', 'stroke_play')
    expect(porId(out.players, 'B').total).toBe(18)
    expect(porId(out.players, 'B').grossTotal).toBe(72 + 18)
  })

  it('neto: el score reparte los 21 golpes (B = +18 − 21 = −3)', () => {
    const out = build('neto', 'stroke_play')
    expect(porId(out.players, 'B').total).toBe(-3)
    expect(porId(out.players, 'B').netTotal).toBe(72 + 18 - 21)
  })

  it('fuera de stableford el modo no inventa puntos por hoyo', () => {
    const out = build('gross', 'stroke_play')
    // `stablefordTotal` existe en el entry, pero el ranking no lo usa.
    expect(porId(out.players, 'A').total).toBe(0)
  })
})

describe('board de torneo — countback de Stableford Gross con los puntos GROSS por hoyo', () => {
  // A (CH 21) y X (CH 0) empatan en 36 puntos gross. X hizo bogey en el 1 y el 2
  // y birdie en el 17 y el 18: últimos 9 → X 20, A 18 → gana X. Si los puntos por
  // hoyo del countback salieran netos, A sumaría sus golpes del back 9 y ganaría.
  const X = { ...TARJETAS_LEONES.A, '1': PAR_LEONES[1] + 1, '2': PAR_LEONES[2] + 1, '17': PAR_LEONES[17] - 1, '18': PAR_LEONES[18] - 1 }

  it('legacy', () => {
    const x = legacyPlayer('A', 0)
    x.id = 'X'
    x.rounds[0].hole_scores = Object.entries(X).map(([h, g]) => ({ hole_number: Number(h), gross_score: g }))
    const out = buildLeaderboardFromLegacy([legacyPlayer('A'), x], ctx('gross', 'stableford'), 1)
    expect(out.players.map((p) => p.stablefordTotal)).toEqual([36, 36])
    expect(out.players[0].id).toBe('X')
  })

  it('ronda libre', () => {
    const x = { ...rondaLibreJugador('A', 0), id: 'X', scores: X }
    const out = buildLeaderboardFromRondaLibre([rondaLibreJugador('A'), x], ctx('gross', 'stableford'))
    expect(out.players.map((p) => p.stablefordTotal)).toEqual([36, 36])
    expect(out.players[0].id).toBe('X')
  })
})
