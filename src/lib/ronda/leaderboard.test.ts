import { describe, it, expect } from 'vitest'
import { buildLeaderboard, hasPlayData } from './leaderboard'
import type { Jugador } from '@/types/ronda'

const parMap = { 1: 4, 2: 4 }
const siMap = { 1: 1, 2: 2 }

function jugador(id: string, nombre: string, scores: Record<string, number>, handicap = 0): Jugador {
  return { id, nombre, user_id: null, scores, handicap }
}

describe('buildLeaderboard', () => {
  it('ordena por vsPar ascendente en stroke play gross (menos golpes primero)', () => {
    const lb = buildLeaderboard({
      jugadores: [
        jugador('b', 'Bogey', { '1': 5, '2': 5 }), // +2
        jugador('a', 'Par', { '1': 4, '2': 4 }), //  0
      ],
      holes: 2,
      parMap,
      siMap,
      courseHcpMap: {},
      modoJuego: 'gross',
      formatoJuego: 'stroke_play',
    })
    expect(lb.map(j => j.id)).toEqual(['a', 'b'])
    expect(lb[0].vsPar).toBe(0)
    expect(lb[1].vsPar).toBe(2)
  })

  it('ordena por puntos Stableford descendente (más puntos primero)', () => {
    const lb = buildLeaderboard({
      jugadores: [
        jugador('a', 'Pares', { '1': 4, '2': 4 }), // 2 + 2 = 4 pts
        jugador('b', 'Birdie', { '1': 3, '2': 4 }), // 3 + 2 = 5 pts
      ],
      holes: 2,
      parMap,
      siMap,
      courseHcpMap: { a: 0, b: 0 },
      modoJuego: 'gross',
      formatoJuego: 'stableford',
    })
    expect(lb.map(j => j.id)).toEqual(['b', 'a'])
    expect(lb[0].stablefordPts).toBeGreaterThan(lb[1].stablefordPts)
  })

  it('manda al final a los jugadores sin hoyos jugados', () => {
    const lb = buildLeaderboard({
      jugadores: [
        jugador('vacio', 'SinJugar', {}),
        jugador('jugo', 'Jugo', { '1': 5, '2': 5 }),
      ],
      holes: 2,
      parMap,
      siMap,
      courseHcpMap: {},
      modoJuego: 'gross',
      formatoJuego: 'stroke_play',
    })
    expect(lb[0].id).toBe('jugo')
    expect(lb[1].id).toBe('vacio')
    expect(lb[1].holesPlayed).toBe(0)
  })

  it('en modo neto, vsPar usa el valor neto (aplica strokes del course handicap)', () => {
    const lb = buildLeaderboard({
      jugadores: [jugador('a', 'A', { '1': 5, '2': 5 })],
      holes: 2,
      parMap,
      siMap,
      courseHcpMap: { a: 2 }, // recibe strokes → neto mejor que gross
      modoJuego: 'neto',
      formatoJuego: 'stroke_play',
    })
    expect(lb[0].vsPar).toBe(lb[0].vsParNeto)
    expect(lb[0].vsParNeto).toBeLessThan(lb[0].vsParGross)
  })

  it('preserva ambos vsPar (gross y neto) en cada entrada', () => {
    const lb = buildLeaderboard({
      jugadores: [jugador('a', 'A', { '1': 4, '2': 4 })],
      holes: 2,
      parMap,
      siMap,
      courseHcpMap: { a: 0 },
      modoJuego: 'gross',
      formatoJuego: 'stroke_play',
    })
    expect(lb[0].vsParGross).toBe(0)
    expect(lb[0].vsParNeto).toBe(0)
    expect(lb[0].courseHcp).toBe(0)
  })
})

describe('hasPlayData — fuente única de "¿hay puntajes para mostrar?"', () => {
  it('false cuando no jugó nadie (sin scores individuales ni de equipo)', () => {
    expect(hasPlayData([{ holesPlayed: 0 }], [])).toBe(false)
    expect(hasPlayData([], [])).toBe(false)
  })

  it('true si algún jugador tiene hoyos jugados (individual / best_ball)', () => {
    expect(hasPlayData([{ holesPlayed: 0 }, { holesPlayed: 3 }], [])).toBe(true)
  })

  it('true si algún equipo tiene scores aunque ningún jugador tenga hoyos individuales (scramble/foursome)', () => {
    // En scramble/foursome el puntaje vive en el equipo, no en el jugador.
    expect(hasPlayData([{ holesPlayed: 0 }], [{ scores: { '1': 4 } }])).toBe(true)
  })

  it('false si los equipos existen pero sin ningún score cargado', () => {
    expect(hasPlayData([{ holesPlayed: 0 }], [{ scores: {} }])).toBe(false)
  })

  it('no depende del orden del leaderboard (no usa [0])', () => {
    // Un jugador que jugó en cualquier posición del array alcanza para true.
    expect(hasPlayData([{ holesPlayed: 3 }, { holesPlayed: 0 }], [])).toBe(true)
  })
})
