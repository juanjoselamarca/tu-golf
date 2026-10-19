// #602 — La tarjeta del equipo en el scorer (scramble / foursome) muestra el neto con
// el mismo motor que el board, también en 9 hoyos (mitad del handicap de equipo 18h).
import { describe, it, expect } from 'vitest'
import { totalesBolaCompartida, hoyosDelMotor, hoyosDeBolaCompartida } from './bola-compartida'
import { computeScrambleStandings, computeFoursomeStandings } from '../leaderboard/team-standings'

// Cancha de 18 con SI esparcido; la ronda juega los primeros 9.
const cancha = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: ((i * 7) % 18) + 1 }))
const nueve = cancha.slice(0, 9)
const scores = Object.fromEntries(nueve.map(h => [String(h.numero), 5])) // +9 gross
const equipo = { id: 'e1', nombre: 'Padre e hijo', scores, handicap_equipo: 10 }

describe('totalesBolaCompartida', () => {
  it('scramble neto 9h: reparte la mitad del handicap de equipo (5 de 10), igual que el board', () => {
    const t = totalesBolaCompartida('scramble', equipo, nueve)
    expect(t.overUnderGross).toBe(9)
    expect(t.overUnderNeto).toBe(4)
    const [board] = computeScrambleStandings(
      [{ id: 'e1', nombre: 'Padre e hijo', handicaps: [20, 30], scores, teamHandicap: 10 }], cancha, 72, 'scramble', 'neto', 9,
    )
    expect(t.totalNeto).toBe(board.totalNeto)
    expect(t.overUnderNeto).toBe(board.overUnderNeto)
  })

  it('foursome neto 9h: mismo neto que el board con el handicap almacenado', () => {
    const t = totalesBolaCompartida('foursome', equipo, nueve)
    const [board] = computeFoursomeStandings(
      [{ id: 'e1', nombre: 'Padre e hijo', handicaps: [8, 12], scores, teamHandicap: 10 }], { e1: ['A', 'B'] }, cancha, 72, 'foursome', 'neto', 9,
    )
    expect(t.overUnderNeto).toBe(board.overUnderNeto)
    expect(t.overUnderNeto).toBe(4)
  })

  it('18h: el handicap de equipo completo', () => {
    const s18 = Object.fromEntries(cancha.map(h => [String(h.numero), 5]))
    const t = totalesBolaCompartida('scramble', { ...equipo, scores: s18 }, cancha)
    expect(t.overUnderGross).toBe(18)
    expect(t.overUnderNeto).toBe(8)
  })

  it('hoyos sin jugar no suman par ni golpes; sin handicap almacenado, neto = gross', () => {
    const parcial = { '1': 5, '2': 3 }
    const t = totalesBolaCompartida('scramble', { ...equipo, scores: parcial, handicap_equipo: null }, nueve)
    expect(t.holesPlayed).toBe(2)
    expect(t.overUnderGross).toBe(0)
    expect(t.overUnderNeto).toBe(0)
  })
})

describe('hoyosDelMotor', () => {
  it('respeta el orden de juego (9h desde el 10) y aplica par 4 / SI = hoyo si falta', () => {
    const h = hoyosDelMotor([10, 11, 12], n => ({ 10: 5 } as Record<number, number>)[n], n => (n === 11 ? 3 : undefined))
    expect(h).toEqual([
      { numero: 10, par: 5, stroke_index: 10 },
      { numero: 11, par: 4, stroke_index: 3 },
      { numero: 12, par: 4, stroke_index: 12 },
    ])
  })

  it('hoyosDeBolaCompartida: el catálogo por hoyo gana sobre parMap', () => {
    expect(hoyosDeBolaCompartida([1], { 1: 3 }, { 1: { par: 5, stroke_index: 7 } })).toEqual([{ numero: 1, par: 5, stroke_index: 7 }])
    expect(hoyosDeBolaCompartida([1], { 1: 3 }, {})).toEqual([{ numero: 1, par: 3, stroke_index: 1 }])
  })
})
