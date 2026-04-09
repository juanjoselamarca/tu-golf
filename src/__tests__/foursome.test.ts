import { describe, it, expect } from 'vitest'
import {
  calcularHandicapFoursome,
  calcularFoursome,
  teePlayerEnHoyo,
  scorePrimarioFoursome,
  ordenarEquiposFoursome,
} from '../golf/formats/foursome'
import type { FoursomeTeam } from '../golf/formats/foursome'

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

describe('Foursome (Alternate Shot)', () => {
  describe('calcularHandicapFoursome', () => {
    it('mitad de la suma, redondeado', () => {
      // (10 + 20) / 2 = 15
      expect(calcularHandicapFoursome(10, 20)).toBe(15)
    })

    it('redondea correctamente con impares', () => {
      // (7 + 12) / 2 = 9.5 → 10
      expect(calcularHandicapFoursome(7, 12)).toBe(10)
    })

    it('mismos handicaps', () => {
      expect(calcularHandicapFoursome(14, 14)).toBe(14)
    })

    it('uno scratch', () => {
      // (0 + 18) / 2 = 9
      expect(calcularHandicapFoursome(0, 18)).toBe(9)
    })

    it('ambos scratch', () => {
      expect(calcularHandicapFoursome(0, 0)).toBe(0)
    })

    it('handicaps altos', () => {
      // (36 + 54) / 2 = 45
      expect(calcularHandicapFoursome(36, 54)).toBe(45)
    })
  })

  describe('teePlayerEnHoyo', () => {
    it('A tira en hoyos impares por defecto', () => {
      expect(teePlayerEnHoyo(1, 'Juan', 'Pedro')).toBe('Juan')
      expect(teePlayerEnHoyo(3, 'Juan', 'Pedro')).toBe('Juan')
      expect(teePlayerEnHoyo(17, 'Juan', 'Pedro')).toBe('Juan')
    })

    it('B tira en hoyos pares por defecto', () => {
      expect(teePlayerEnHoyo(2, 'Juan', 'Pedro')).toBe('Pedro')
      expect(teePlayerEnHoyo(4, 'Juan', 'Pedro')).toBe('Pedro')
      expect(teePlayerEnHoyo(18, 'Juan', 'Pedro')).toBe('Pedro')
    })

    it('invertir orden', () => {
      expect(teePlayerEnHoyo(1, 'Juan', 'Pedro', true)).toBe('Pedro')
      expect(teePlayerEnHoyo(2, 'Juan', 'Pedro', true)).toBe('Juan')
    })
  })

  describe('calcularFoursome', () => {
    it('calcula scoring básico correctamente', () => {
      const team: FoursomeTeam = {
        id: 'team-1',
        nombre: 'Juan & Pedro',
        handicapA: 10,
        handicapB: 20,
        nombreA: 'Juan',
        nombreB: 'Pedro',
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      }
      const result = calcularFoursome(team, HOLES_9, PAR_9)

      expect(result.totalGross).toBe(36)
      expect(result.overUnderGross).toBe(0)
      expect(result.holesPlayed).toBe(9)
      expect(result.teamHandicap).toBe(15) // (10+20)/2
    })

    it('asigna teePlayer correcto en cada hoyo', () => {
      const team: FoursomeTeam = {
        id: 'team-1',
        nombre: 'Test',
        handicapA: 10,
        handicapB: 10,
        nombreA: 'A',
        nombreB: 'B',
        scores: { '1': 4, '2': 3 },
      }
      const result = calcularFoursome(team, HOLES_9, PAR_9)

      expect(result.holes[0].teePlayer).toBe('A') // Hoyo 1 (impar)
      expect(result.holes[1].teePlayer).toBe('B') // Hoyo 2 (par)
    })

    it('invierte orden con invertirOrden', () => {
      const team: FoursomeTeam = {
        id: 'team-1',
        nombre: 'Test',
        handicapA: 10,
        handicapB: 10,
        nombreA: 'A',
        nombreB: 'B',
        scores: { '1': 4, '2': 3 },
        invertirOrden: true,
      }
      const result = calcularFoursome(team, HOLES_9, PAR_9)

      expect(result.holes[0].teePlayer).toBe('B') // Hoyo 1 invertido
      expect(result.holes[1].teePlayer).toBe('A') // Hoyo 2 invertido
    })

    it('calcula neto con handicap de equipo', () => {
      const team: FoursomeTeam = {
        id: 'team-1',
        nombre: 'Test',
        handicapA: 10,
        handicapB: 20,
        nombreA: 'A',
        nombreB: 'B',
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      }
      const result = calcularFoursome(team, HOLES_9, PAR_9)

      // teamHcp = 15 → recibe strokes en SI 1-15 (todos en 9 hoyos)
      // Neto debería ser menos que gross
      expect(result.totalNeto).toBeLessThan(result.totalGross)
    })

    it('maneja hoyos sin score', () => {
      const team: FoursomeTeam = {
        id: 'team-1',
        nombre: 'Test',
        handicapA: 10,
        handicapB: 10,
        nombreA: 'A',
        nombreB: 'B',
        scores: {},
      }
      const result = calcularFoursome(team, HOLES_9, PAR_9)

      expect(result.holesPlayed).toBe(0)
      expect(result.totalGross).toBe(0)
    })
  })

  describe('scorePrimarioFoursome', () => {
    const team: FoursomeTeam = {
      id: 'team-1',
      nombre: 'Test',
      handicapA: 10,
      handicapB: 20,
      nombreA: 'A',
      nombreB: 'B',
      scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
    }

    it('retorna overUnderGross para modo gross', () => {
      const result = calcularFoursome(team, HOLES_9, PAR_9)
      expect(scorePrimarioFoursome(result, 'gross')).toBe(result.overUnderGross)
    })

    it('retorna overUnderNeto para modo neto', () => {
      const result = calcularFoursome(team, HOLES_9, PAR_9)
      expect(scorePrimarioFoursome(result, 'neto')).toBe(result.overUnderNeto)
    })
  })

  describe('ordenarEquiposFoursome', () => {
    it('ordena menor over/under primero', () => {
      const teamA: FoursomeTeam = {
        id: 'a', nombre: 'A', handicapA: 0, handicapB: 0, nombreA: 'A1', nombreB: 'A2',
        scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
      }
      const teamB: FoursomeTeam = {
        id: 'b', nombre: 'B', handicapA: 0, handicapB: 0, nombreA: 'B1', nombreB: 'B2',
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      }

      const rA = calcularFoursome(teamA, HOLES_9, PAR_9)
      const rB = calcularFoursome(teamB, HOLES_9, PAR_9)

      const sorted = ordenarEquiposFoursome([rA, rB], 'gross')
      expect(sorted[0].teamId).toBe('b')
    })
  })
})
