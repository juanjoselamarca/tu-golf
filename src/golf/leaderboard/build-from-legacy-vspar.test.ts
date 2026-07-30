// src/golf/leaderboard/build-from-legacy-vspar.test.ts
//
// P0 del board individual de torneo: "a par" se medía contra el par de la
// vuelta COMPLETA aunque el jugador llevara 3 hoyos. Resultado: el que menos
// jugó encabezaba el leaderboard con un bajo par imposible (−60 en 18h).
// Le pega a todo torneo en vivo mientras los grupos están en cancha.

import { describe, it, expect } from 'vitest'
import { buildLeaderboardFromLegacy } from './build-from-legacy'
import type { CourseHole, TournamentLeaderboardContext } from './types'
import type { DBPlayer } from '@/app/torneo/[slug]/types'

const HOLES_18: CourseHole[] = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

const CTX: TournamentLeaderboardContext = {
  parTotal: 72,
  totalHoyos: 18,
  modoJuego: 'gross',
  formatoJuego: 'stroke_play',
  courseHoles: HOLES_18,
}

function player(over: Partial<DBPlayer> & { id: string }): DBPlayer {
  return {
    id: over.id,
    handicap_at_registration: over.handicap_at_registration ?? 0,
    player_name: over.player_name ?? null,
    profiles: over.profiles ?? null,
    categories: null,
    rounds: over.rounds ?? [],
  }
}

function round(scores: Array<[number, number]>, opts?: { net?: number; gross?: number }) {
  const gross = opts?.gross ?? scores.reduce((s, [, g]) => s + g, 0)
  return {
    id: 'r1',
    status: 'in_progress',
    total_gross: gross,
    total_net: opts?.net ?? gross,
    total_points: 0,
    round_number: 1,
    hole_scores: scores.map(([hole_number, gross_score]) => ({ hole_number, gross_score })),
  }
}

describe('buildLeaderboardFromLegacy — "a par" contra los hoyos jugados', () => {
  it('un jugador thru 3 en par NO aparece a −60: aparece en E', () => {
    const out = buildLeaderboardFromLegacy(
      [player({ id: 'p1', profiles: { name: 'Paty', indice: null }, rounds: [round([[1, 4], [2, 4], [3, 4]])] })],
      CTX,
      1,
    )
    expect(out.players[0].holes).toBe(3)
    expect(out.players[0].total).toBe(0)
  })

  it('un jugador thru 3 con +2 aparece a +2, no a −58', () => {
    const out = buildLeaderboardFromLegacy(
      [player({ id: 'p1', profiles: { name: 'Paty', indice: null }, rounds: [round([[1, 5], [2, 5], [3, 4]])] })],
      CTX,
      1,
    )
    expect(out.players[0].total).toBe(2)
  })

  it('el que va thru 3 NO le gana al que va thru 18 mejor que él', () => {
    // Paty: 3 hoyos en par (E). Nacho: vuelta completa en −2.
    const scoresNacho: Array<[number, number]> = Array.from({ length: 18 }, (_, i) => [i + 1, i < 2 ? 3 : 4])
    const out = buildLeaderboardFromLegacy(
      [
        player({ id: 'p1', profiles: { name: 'Paty', indice: null }, rounds: [round([[1, 4], [2, 4], [3, 4]])] }),
        player({ id: 'p2', profiles: { name: 'Nacho', indice: null }, rounds: [round(scoresNacho)] }),
      ],
      CTX,
      1,
    )
    expect(out.players[0].name).toBe('Nacho')
    expect(out.players[0].total).toBe(-2)
    expect(out.players[1].total).toBe(0)
  })

  it('la vuelta completa sigue midiendo contra el par total (sin regresión)', () => {
    const scores: Array<[number, number]> = Array.from({ length: 18 }, (_, i) => [i + 1, i < 3 ? 5 : 4])
    const out = buildLeaderboardFromLegacy(
      [player({ id: 'p1', profiles: { name: 'Paty', indice: null }, rounds: [round(scores)] })],
      CTX,
      1,
    )
    expect(out.players[0].holes).toBe(18)
    expect(out.players[0].total).toBe(3)
  })

  it('el par parcial respeta el par REAL de cada hoyo, no un par-4 plano', () => {
    const holes: CourseHole[] = [
      { numero: 1, par: 5, stroke_index: 1 },
      { numero: 2, par: 3, stroke_index: 2 },
      ...HOLES_18.slice(2),
    ]
    // Juega el 1 (par 5) en 5 y el 2 (par 3) en 3 → E.
    const out = buildLeaderboardFromLegacy(
      [player({ id: 'p1', profiles: { name: 'Paty', indice: null }, rounds: [round([[1, 5], [2, 3]])] })],
      { ...CTX, courseHoles: holes },
      1,
    )
    expect(out.players[0].total).toBe(0)
  })

  it('modo neto: thru 3 con hcp se mide contra el par de esos 3 hoyos', () => {
    // hcp 18 → 1 golpe por hoyo. 3 hoyos en 5 (bogey) → neto 4 c/u → E.
    const out = buildLeaderboardFromLegacy(
      [player({
        id: 'p1',
        handicap_at_registration: 18,
        profiles: { name: 'Paty', indice: null },
        rounds: [round([[1, 5], [2, 5], [3, 5]], { net: 12 })],
      })],
      { ...CTX, modoJuego: 'neto' },
      1,
    )
    expect(out.players[0].total).toBe(0)
  })

  it('un inscrito que todavía no scoreó queda en holes 0 y último, sin bajo par falso', () => {
    const out = buildLeaderboardFromLegacy(
      [
        player({ id: 'p1', profiles: { name: 'Paty', indice: null }, rounds: [round([[1, 4]])] }),
        player({ id: 'p2', player_name: 'Cacho Invitado' }),
      ],
      CTX,
      1,
    )
    const cacho = out.players.find((p) => p.name === 'Cacho Invitado')
    expect(cacho).toBeDefined()
    expect(cacho?.holes).toBe(0)
    expect(out.players[out.players.length - 1].name).toBe('Cacho Invitado')
  })
})

describe('buildLeaderboardFromLegacy — el que no scoreó nunca lidera', () => {
  it('una ronda abierta sin scores no produce un líder bajo par', () => {
    // Caso de todo torneo antes de que cargue el primer grupo: la ronda existe
    // (se crea al inscribir) pero no tiene hoyos. Antes salía a −72.
    const out = buildLeaderboardFromLegacy(
      [
        player({ id: 'p1', profiles: { name: 'Sin scores', indice: null }, rounds: [round([], { gross: 0, net: 0 })] }),
        player({ id: 'p2', profiles: { name: 'Jugando', indice: null }, rounds: [round([[1, 5]])] }),
      ],
      CTX,
      1,
    )
    expect(out.players[0].name).toBe('Jugando')
    expect(out.players[1].holes).toBe(0)
    expect(out.players[1].total).toBe(0)
  })

  it('en modo neto el orden también respeta "a par", no los golpes crudos', () => {
    const scoresFull: Array<[number, number]> = Array.from({ length: 18 }, (_, i) => [i + 1, 4])
    const out = buildLeaderboardFromLegacy(
      [
        player({ id: 'p1', profiles: { name: 'Thru2', indice: null }, rounds: [round([[1, 4], [2, 4]])] }),
        player({ id: 'p2', profiles: { name: 'Terminó', indice: null }, rounds: [round(scoresFull)] }),
      ],
      { ...CTX, modoJuego: 'neto' },
      1,
    )
    // Ambos en E: el que terminó no puede quedar detrás por tener más golpes.
    expect(out.playersByNeto[0].total).toBe(0)
    expect(out.playersByNeto[1].total).toBe(0)
    expect(out.playersByNeto.map((p) => p.holes)).toContain(18)
  })

  it('stableford: el que no jugó queda último aunque su total sea 0', () => {
    const out = buildLeaderboardFromLegacy(
      [
        player({ id: 'p1', profiles: { name: 'Sin scores', indice: null }, rounds: [round([], { gross: 0, net: 0 })] }),
        player({ id: 'p2', profiles: { name: 'Jugando', indice: null }, rounds: [round([[1, 6]])] }),
      ],
      { ...CTX, formatoJuego: 'stableford' },
      1,
    )
    // Doble bogey = 0 puntos, igual que el que no jugó. Aun así, el que jugó va primero.
    expect(out.players[out.players.length - 1].name).toBe('Sin scores')
  })
})

describe('buildLeaderboardFromLegacy — el countback es para tarjetas terminadas', () => {
  // El countback USGA compara los últimos 9/6/3/1 hoyos. Aplicarlo a vueltas a
  // medias premia al que menos jugó (sus hoyos vacíos suman 0 golpes) y encima
  // le cuelga "(empate)" a todo el field, porque a mitad de torneo el empate en
  // "a par" es la norma, no la excepción.
  const scoresFull: Array<[number, number]> = Array.from({ length: 18 }, (_, i) => [i + 1, 4])

  it('entre dos empatados a medio jugar, primero va el que MÁS hoyos lleva', () => {
    const out = buildLeaderboardFromLegacy(
      [
        player({ id: 'p1', profiles: { name: 'Thru3', indice: null }, rounds: [round([[1, 4], [2, 4], [3, 4]])] }),
        player({ id: 'p2', profiles: { name: 'Thru12', indice: null }, rounds: [round(scoresFull.slice(0, 12))] }),
      ],
      CTX,
      1,
    )
    expect(out.players[0].name).toBe('Thru12')
    expect(out.players[1].name).toBe('Thru3')
  })

  it('un empate a medio jugar NO se anota como desempate', () => {
    const out = buildLeaderboardFromLegacy(
      [
        player({ id: 'p1', profiles: { name: 'Thru3', indice: null }, rounds: [round([[1, 4], [2, 4], [3, 4]])] }),
        player({ id: 'p2', profiles: { name: 'Thru12', indice: null }, rounds: [round(scoresFull.slice(0, 12))] }),
      ],
      CTX,
      1,
    )
    for (const p of out.players) {
      expect(p.name, 'nombre con anotación de countback a mitad de vuelta').not.toMatch(/\(empate\)|\(desempate\)/)
    }
  })

  it('con el torneo recién abierto nadie queda anotado', () => {
    const out = buildLeaderboardFromLegacy(
      [
        player({ id: 'p1', profiles: { name: 'Ana', indice: null }, rounds: [round([], { gross: 0, net: 0 })] }),
        player({ id: 'p2', profiles: { name: 'Beto', indice: null }, rounds: [round([], { gross: 0, net: 0 })] }),
        player({ id: 'p3', player_name: 'Caro' }),
      ],
      CTX,
      1,
    )
    expect(out.players.map((p) => p.name)).toEqual(['Ana', 'Beto', 'Caro'])
  })

  it('entre tarjetas TERMINADAS el countback sí desempata y se anota', () => {
    // Mismo total (72) pero distinto reparto: A cierra mejor los últimos 9.
    const a: Array<[number, number]> = Array.from({ length: 18 }, (_, i) => [i + 1, i < 9 ? 5 : 3])
    const b: Array<[number, number]> = Array.from({ length: 18 }, (_, i) => [i + 1, i < 9 ? 3 : 5])
    const out = buildLeaderboardFromLegacy(
      [
        player({ id: 'p1', profiles: { name: 'CierraMal', indice: null }, rounds: [round(b)] }),
        player({ id: 'p2', profiles: { name: 'CierraBien', indice: null }, rounds: [round(a)] }),
      ],
      CTX,
      1,
    )
    expect(out.players[0].name).toMatch(/^CierraBien/)
    expect(out.players[0].name).toContain('(desempate)')
  })
})

describe('buildLeaderboardFromLegacy — todo jugador sale con su id', () => {
  it('también los inscritos que todavía no tienen ronda', () => {
    const out = buildLeaderboardFromLegacy(
      [
        player({ id: 'p1', profiles: { name: 'Jugando', indice: null }, rounds: [round([[1, 4]])] }),
        player({ id: 'p2', player_name: 'Sin ronda' }),
      ],
      CTX,
      1,
    )
    // Sin id, /en-vivo pierde el filtro por grupo y por categoría de ese jugador.
    expect(out.players.map((p) => p.id)).toEqual(['p1', 'p2'])
  })
})

describe('buildLeaderboardFromLegacy — nombre único del jugador', () => {
  it('un INVITADO que scoreó muestra su nombre de inscripción, no "Jugador"', () => {
    const out = buildLeaderboardFromLegacy(
      [player({ id: 'p1', player_name: 'Paty Demo', profiles: null, rounds: [round([[1, 4]])] })],
      CTX,
      1,
    )
    expect(out.players[0].name).toBe('Paty Demo')
  })
})
