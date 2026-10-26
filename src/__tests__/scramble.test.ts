import { describe, it, expect } from 'vitest'
import {
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
  describe('calcularScramble', () => {
    it('calcula scoring básico correctamente', () => {
      const team: ScrambleTeam = {
        id: 'team-1',
        nombre: 'Los Birdies',
        teamHandicap: 7,
        teamHandicapJuego: 7,
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      }
      const result = calcularScramble(team, HOLES_9, PAR_9)

      expect(result.totalGross).toBe(36) // Par
      expect(result.overUnderGross).toBe(0)
      expect(result.holesPlayed).toBe(9)
      expect(result.teamHandicap).toBe(7)
      // juego 7 en 9 hoyos → 7 golpes → neto 29
      expect(result.totalNeto).toBe(29)
    })

    it('maneja hoyos sin score', () => {
      const team: ScrambleTeam = {
        id: 'team-1',
        nombre: 'Test',
        teamHandicap: 5,
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
        teamHandicap: 14, // 9 hoyos sin juego guardado → se parte: 7
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
        id: 'a', nombre: 'A', teamHandicap: 5,
        scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
      }
      const teamB: ScrambleTeam = {
        id: 'b', nombre: 'B', teamHandicap: 5,
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      }

      const rA = calcularScramble(teamA, HOLES_9, PAR_9)
      const rB = calcularScramble(teamB, HOLES_9, PAR_9)

      const sorted = ordenarEquiposScramble([rA, rB], 'stroke_play', 'gross')
      expect(sorted[0].teamId).toBe('b') // menor gross primero
    })

    it('ordena por stableford descendente', () => {
      const teamA: ScrambleTeam = {
        id: 'a', nombre: 'A', teamHandicap: 5,
        scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
      }
      const teamB: ScrambleTeam = {
        id: 'b', nombre: 'B', teamHandicap: 5,
        scores: { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 },
      }

      const rA = calcularScramble(teamA, HOLES_9, PAR_9)
      const rB = calcularScramble(teamB, HOLES_9, PAR_9)

      const sorted = ordenarEquiposScramble([rA, rB], 'stableford', 'neto')
      expect(sorted[0].teamId).toBe('b') // mayor stableford primero
    })
  })
})

// ─── Regresión P0 (29-jun-2026): 9h repartía el team handicap COMPLETO ──────
describe('calcularScramble — fila sin handicap_equipo_juego: 9 hoyos reparte la MITAD del completo (no 2×)', () => {
  it('team handicap 18h 8.6 → en 9h se reparte ~4 (mitad), no 8', () => {
    const team: ScrambleTeam = {
      id: 't',
      nombre: 'Padre e Hijo',
      teamHandicap: 8.6, // fila vieja: decimal y sin handicap_equipo_juego
      scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 },
    }
    const r = calcularScramble(team, HOLES_9, PAR_9)
    const totalStrokes = r.holes.reduce((s, h) => s + h.strokesRecibidos, 0)
    // El mostrado se conserva COMPLETO (18h).
    expect(r.teamHandicap).toBeCloseTo(8.6, 1)
    // 9h: courseHandicapParaHoyos(8.6,9)=round(4.3)=4 → reparte 4 golpes (los 4
    // hoyos más difíciles). Los SI de HOLES_9 son 18h-impares (1..17), así que el
    // motor los normaliza a permutación 1..9 antes de alocar: sin normalizar sólo
    // repartía en SI≤4 (si 1,3) = 2 golpes → perdía 2 golpes de hándicap.
    expect(totalStrokes).toBe(4)
  })

  it('la misma ronda a 18 hoyos NO se ajusta (control)', () => {
    // 18 hoyos con los mismos SI 1-9 repetidos no aplica; control conceptual:
    // courseHandicapParaHoyos no toca el handicap cuando roundHoles > 9.
    const holes18 = Array.from({ length: 18 }, (_, i) => ({
      numero: i + 1, par: 4, stroke_index: i + 1,
    }))
    const team: ScrambleTeam = {
      id: 't', nombre: 'T', teamHandicap: 8.6,
      scores: Object.fromEntries(holes18.map(h => [String(h.numero), 5])),
    }
    const r = calcularScramble(team, holes18, 72)
    const totalStrokes = r.holes.reduce((s, h) => s + h.strokesRecibidos, 0)
    // 18h: teamHcp 8.6 → SI≤8 (8 hoyos) = 8 strokes (sin ajuste).
    expect(totalStrokes).toBe(8)
  })
})

// ─── PR-C: el handicap que PUNTÚA ya viene en la escala de la ronda ─────────
describe('calcularScramble — handicap_equipo_juego', () => {
  const scores = { '1': 5, '2': 4, '3': 6, '4': 5, '5': 5, '6': 4, '7': 6, '8': 5, '9': 5 }
  const golpes = (t: ScrambleTeam) => calcularScramble(t, HOLES_9, PAR_9).holes.reduce((s, h) => s + h.strokesRecibidos, 0)

  it('9 hoyos con juego 3 (WHS exacto) reparte 3 y muestra el completo 7', () => {
    // Ejemplo D1: índices 10/20, slope 125, CR 71 / par 71 → completo 7; en 9h
    // (CR 35,5 / par 36) CH 5,03 y 10,56 → 35 %·5,03 + 15 %·10,56 = 3,34 → 3.
    const t: ScrambleTeam = { id: 't', nombre: 'T', teamHandicap: 7, teamHandicapJuego: 3, scores }
    expect(golpes(t)).toBe(3)
    expect(calcularScramble(t, HOLES_9, PAR_9).teamHandicap).toBe(7)
  })

  it('misma fila SIN juego (anterior a la columna) parte el completo: round(7/2) = 4 (sin cambios)', () => {
    expect(golpes({ id: 't', nombre: 'T', teamHandicap: 7, teamHandicapJuego: null, scores })).toBe(4)
    expect(golpes({ id: 't', nombre: 'T', teamHandicap: 7, scores })).toBe(4)
  })

  it('juego 0 manda (no cae al completo)', () => {
    expect(golpes({ id: 't', nombre: 'T', teamHandicap: 1, teamHandicapJuego: 0, scores })).toBe(0)
  })

  it('sin handicap guardado → 0 golpes, se muestra 0', () => {
    const t: ScrambleTeam = { id: 't', nombre: 'T', teamHandicap: null, scores }
    expect(golpes(t)).toBe(0)
    expect(calcularScramble(t, HOLES_9, PAR_9).teamHandicap).toBe(0)
  })
})
