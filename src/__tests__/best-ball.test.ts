import { describe, it, expect } from 'vitest'
import {
  calcularBestBall,
  scorePrimarioBestBall,
  ordenarEquiposBestBall,
} from '../golf/formats/best-ball'
import type { BestBallTeam } from '../golf/formats/best-ball'

// ─── Hoyos de prueba (9 hoyos) ───

const HOLES_9 = [
  { numero: 1, par: 4, stroke_index: 7 },
  { numero: 2, par: 3, stroke_index: 15 },
  { numero: 3, par: 5, stroke_index: 1 },
  { numero: 4, par: 4, stroke_index: 11 },
  { numero: 5, par: 4, stroke_index: 3 },
  { numero: 6, par: 3, stroke_index: 17 },
  { numero: 7, par: 5, stroke_index: 5 },
  { numero: 8, par: 4, stroke_index: 9 },
  { numero: 9, par: 4, stroke_index: 13 },
]

const PAR_9 = 36

function makeTeam(overrides: Partial<BestBallTeam> = {}): BestBallTeam {
  return {
    id: 'team-1',
    nombre: 'Equipo 1',
    jugadores: [
      {
        id: 'p1',
        nombre: 'Juan',
        handicapIndex: 10,
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      },
      {
        id: 'p2',
        nombre: 'Pedro',
        handicapIndex: 18,
        scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
      },
    ],
    ...overrides,
  }
}

describe('Best Ball (Four-Ball)', () => {
  describe('calcularBestBall', () => {
    it('elige el mejor gross por hoyo', () => {
      const team = makeTeam()
      const result = calcularBestBall(team, HOLES_9, PAR_9)

      // Juan juega al par en todos, Pedro +1 en todos
      // Best ball gross debería ser el de Juan en cada hoyo
      expect(result.totalGross).toBe(36) // Juan hace par en todos
      expect(result.overUnderGross).toBe(0) // E (even)
      expect(result.holesPlayed).toBe(9)
    })

    it('elige el mejor neto por hoyo (jugador con más strokes puede ganar)', () => {
      const team = makeTeam({
        jugadores: [
          {
            id: 'p1',
            nombre: 'Juan',
            handicapIndex: 0, // scratch
            scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
          },
          {
            id: 'p2',
            nombre: 'Pedro',
            handicapIndex: 18, // recibe 1 stroke por hoyo
            scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
          },
        ],
      })
      const result = calcularBestBall(team, HOLES_9, PAR_9)

      // Pedro tiene mismo gross que Juan (scratch) pero recibe golpes de hándicap.
      // handicapIndex es el COURSE HANDICAP de los hoyos jugados: 18 sobre una ronda
      // de 9h ⇒ 2 golpes/hoyo (cap 9h, no 18) ⇒ 18 golpes en total. Su neto por hoyo
      // (5-2=3) gana al de Juan (5) en todos ⇒ team neto 9×3 = 27, vs par −9.
      // (Antes del fix 9h el motor asignaba sólo 9 golpes → 36: bug "net +12".)
      expect(result.totalNeto).toBe(27)
      expect(result.overUnderNeto).toBe(-9)
    })

    it('maneja hoyos sin score de un jugador', () => {
      const team = makeTeam({
        jugadores: [
          {
            id: 'p1',
            nombre: 'Juan',
            handicapIndex: 10,
            scores: { '1': 4, '2': 3, '3': 5 }, // solo 3 hoyos
          },
          {
            id: 'p2',
            nombre: 'Pedro',
            handicapIndex: 18,
            scores: { '1': 5, '4': 5, '5': 5 }, // solo 3 hoyos, diferente overlap
          },
        ],
      })
      const result = calcularBestBall(team, HOLES_9, PAR_9)

      // Hoyo 1: ambos tienen score → best of (4, 5) = 4
      // Hoyo 2: solo Juan → 3
      // Hoyo 3: solo Juan → 5
      // Hoyo 4: solo Pedro → 5
      // Hoyo 5: solo Pedro → 5
      // Hoyos 6-9: nadie → no played
      expect(result.holesPlayed).toBe(5)
    })

    it('funciona con equipo de 3 jugadores', () => {
      const team = makeTeam({
        jugadores: [
          { id: 'p1', nombre: 'A', handicapIndex: 5, scores: { '1': 5, '2': 4, '3': 6 } },
          { id: 'p2', nombre: 'B', handicapIndex: 15, scores: { '1': 6, '2': 3, '3': 7 } },
          { id: 'p3', nombre: 'C', handicapIndex: 20, scores: { '1': 7, '2': 5, '3': 5 } },
        ],
      })
      const result = calcularBestBall(team, HOLES_9, PAR_9)

      // Hoyo 1: min(5,6,7) gross = 5
      // Hoyo 2: min(4,3,5) gross = 3
      // Hoyo 3: min(6,7,5) gross = 5
      expect(result.totalGross).toBe(13)
      expect(result.holesPlayed).toBe(3)
    })

    it('marca isBest correctamente', () => {
      const team = makeTeam()
      const result = calcularBestBall(team, HOLES_9, PAR_9)

      result.holes.forEach((h) => {
        if (h.teamGross !== null) {
          const bestCount = h.playerScores.filter((p) => p.isBest).length
          expect(bestCount).toBeGreaterThanOrEqual(1)
        }
      })
    })

    it('maneja equipo sin scores (todo vacío)', () => {
      const team = makeTeam({
        jugadores: [
          { id: 'p1', nombre: 'A', handicapIndex: 10, scores: {} },
          { id: 'p2', nombre: 'B', handicapIndex: 15, scores: {} },
        ],
      })
      const result = calcularBestBall(team, HOLES_9, PAR_9)

      expect(result.holesPlayed).toBe(0)
      expect(result.totalGross).toBe(0)
    })
  })

  describe('scorePrimarioBestBall', () => {
    it('retorna overUnderGross para modo gross', () => {
      const team = makeTeam()
      const result = calcularBestBall(team, HOLES_9, PAR_9)
      expect(scorePrimarioBestBall(result, 'stroke_play', 'gross')).toBe(result.overUnderGross)
    })

    it('retorna overUnderNeto para modo neto', () => {
      const team = makeTeam()
      const result = calcularBestBall(team, HOLES_9, PAR_9)
      expect(scorePrimarioBestBall(result, 'stroke_play', 'neto')).toBe(result.overUnderNeto)
    })

    it('retorna totalStableford para modo stableford', () => {
      const team = makeTeam()
      const result = calcularBestBall(team, HOLES_9, PAR_9)
      expect(scorePrimarioBestBall(result, 'stableford', 'neto')).toBe(result.totalStableford)
    })
  })

  describe('ordenarEquiposBestBall', () => {
    it('ordena por gross ascendente', () => {
      const teamA = makeTeam({ id: 'a', nombre: 'Equipo A' })
      const teamB = makeTeam({
        id: 'b',
        nombre: 'Equipo B',
        jugadores: [
          {
            id: 'p3',
            nombre: 'Carlos',
            handicapIndex: 0,
            scores: { '1': 3, '2': 2, '3': 4, '4': 3, '5': 3, '6': 2, '7': 4, '8': 3, '9': 3 },
          },
          {
            id: 'p4',
            nombre: 'Diego',
            handicapIndex: 0,
            scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
          },
        ],
      })

      const resultA = calcularBestBall(teamA, HOLES_9, PAR_9)
      const resultB = calcularBestBall(teamB, HOLES_9, PAR_9)

      const sorted = ordenarEquiposBestBall([resultA, resultB], 'stroke_play', 'gross')
      // Equipo B debería ir primero (mejor gross)
      expect(sorted[0].teamId).toBe('b')
    })

    it('ordena por stableford descendente', () => {
      const teamA = makeTeam({ id: 'a', nombre: 'Equipo A' })
      const teamB = makeTeam({
        id: 'b',
        nombre: 'Equipo B',
        jugadores: [
          {
            id: 'p3',
            nombre: 'Carlos',
            handicapIndex: 0,
            scores: { '1': 3, '2': 2, '3': 4, '4': 3, '5': 3, '6': 2, '7': 4, '8': 3, '9': 3 },
          },
          {
            id: 'p4',
            nombre: 'Diego',
            handicapIndex: 0,
            scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
          },
        ],
      })

      const resultA = calcularBestBall(teamA, HOLES_9, PAR_9)
      const resultB = calcularBestBall(teamB, HOLES_9, PAR_9)

      const sorted = ordenarEquiposBestBall([resultA, resultB], 'stableford', 'neto')
      // Propiedad del sort: mayor stableford primero (robusto a la alocación exacta).
      expect(sorted[0].totalStableford).toBeGreaterThanOrEqual(sorted[1].totalStableford)
      // Con el cap 9h correcto, Juan (CH9h 10) + Pedro (CH9h 18) suman 28 pts de
      // stableford neto y superan al equipo scratch de Carlos (birdies gross = 27).
      expect(sorted[0].teamId).toBe('a')
    })
  })
})
