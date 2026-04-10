import { describe, it, expect } from 'vitest'
import {
  calcularHandicapScramble,
  calcularScramble,
  scorePrimarioScramble,
  ordenarEquiposScramble,
} from '../golf/formats/scramble'
import type { ScrambleTeam } from '../golf/formats/scramble'

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

describe('Scramble', () => {
  describe('calcularHandicapScramble — fórmula USGA', () => {
    it('2 jugadores: 35% menor + 15% mayor', () => {
      // HCPs: 10 y 20
      // 0.35 * 10 + 0.15 * 20 = 3.5 + 3.0 = 6.5
      expect(calcularHandicapScramble([10, 20])).toBe(6.5)
    })

    it('2 jugadores: ordena automáticamente', () => {
      // Mismo resultado sin importar el orden
      expect(calcularHandicapScramble([20, 10])).toBe(6.5)
    })

    it('3 jugadores: 20% menor + 15% medio + 10% mayor', () => {
      // HCPs: 5, 15, 25
      // 0.20 * 5 + 0.15 * 15 + 0.10 * 25 = 1.0 + 2.25 + 2.5 = 5.75
      // Redondeado a 5.8
      expect(calcularHandicapScramble([5, 15, 25])).toBe(5.8)
    })

    it('4 jugadores: 25% 1ro + 20% 2do + 15% 3ro + 10% 4to', () => {
      // HCPs: 0, 10, 20, 30
      // 0.25*0 + 0.20*10 + 0.15*20 + 0.10*30 = 0 + 2 + 3 + 3 = 8.0
      expect(calcularHandicapScramble([0, 10, 20, 30])).toBe(8)
    })

    it('jugadores con mismo handicap', () => {
      // 2 jugadores con HCP 12
      // 0.35 * 12 + 0.15 * 12 = 4.2 + 1.8 = 6.0
      expect(calcularHandicapScramble([12, 12])).toBe(6)
    })

    it('un solo jugador retorna su handicap', () => {
      expect(calcularHandicapScramble([15])).toBe(15)
    })

    it('sin jugadores retorna 0', () => {
      expect(calcularHandicapScramble([])).toBe(0)
    })

    it('handicap con decimales', () => {
      // 0.35 * 8.4 + 0.15 * 16.2 = 2.94 + 2.43 = 5.37 → 5.4
      expect(calcularHandicapScramble([8.4, 16.2])).toBe(5.4)
    })
  })

  describe('calcularScramble', () => {
    it('calcula scoring básico correctamente', () => {
      const team: ScrambleTeam = {
        id: 'team-1',
        nombre: 'Los Birdies',
        handicaps: [10, 20],
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      }
      const result = calcularScramble(team, HOLES_9, PAR_9)

      expect(result.totalGross).toBe(36) // Par
      expect(result.overUnderGross).toBe(0)
      expect(result.holesPlayed).toBe(9)
      expect(result.teamHandicap).toBe(6.5)
      // Con teamHcp 6.5 → redondeado a 7 → recibe strokes en SI 1-7
      // totalNeto debería ser menor que 36
      expect(result.totalNeto).toBeLessThan(36)
    })

    it('maneja hoyos sin score', () => {
      const team: ScrambleTeam = {
        id: 'team-1',
        nombre: 'Test',
        handicaps: [10, 10],
        scores: { '1': 4, '2': 3 },
      }
      const result = calcularScramble(team, HOLES_9, PAR_9)

      expect(result.holesPlayed).toBe(2)
      expect(result.totalGross).toBe(7)
    })

    it('calcula stableford usando handicap de equipo', () => {
      const team: ScrambleTeam = {
        id: 'team-1',
        nombre: 'Test',
        handicaps: [10, 20], // teamHcp = 6.5 → 7
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      }
      const result = calcularScramble(team, HOLES_9, PAR_9)

      // Playing at par gross, with team handicap strokes = puntos stableford > 18
      expect(result.totalStableford).toBeGreaterThan(18)
    })
  })

  describe('ordenarEquiposScramble', () => {
    it('ordena por gross ascendente', () => {
      const teamA: ScrambleTeam = {
        id: 'a', nombre: 'A', handicaps: [10, 10],
        scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
      }
      const teamB: ScrambleTeam = {
        id: 'b', nombre: 'B', handicaps: [10, 10],
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      }

      const rA = calcularScramble(teamA, HOLES_9, PAR_9)
      const rB = calcularScramble(teamB, HOLES_9, PAR_9)

      const sorted = ordenarEquiposScramble([rA, rB], 'stroke_play', 'gross')
      expect(sorted[0].teamId).toBe('b') // menor gross primero
    })

    it('ordena por stableford descendente', () => {
      const teamA: ScrambleTeam = {
        id: 'a', nombre: 'A', handicaps: [10, 10],
        scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
      }
      const teamB: ScrambleTeam = {
        id: 'b', nombre: 'B', handicaps: [10, 10],
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      }

      const rA = calcularScramble(teamA, HOLES_9, PAR_9)
      const rB = calcularScramble(teamB, HOLES_9, PAR_9)

      const sorted = ordenarEquiposScramble([rA, rB], 'stableford', 'neto')
      expect(sorted[0].teamId).toBe('b') // mayor stableford primero
    })
  })
})
