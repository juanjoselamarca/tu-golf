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

describe('buildLeaderboard — ronda de 9 desde el 10', () => {
  // Los Leones 10..18 (par 36) y SI de catálogo 18h: el back 9 trae los pares 2..18.
  const PAR_18: Record<number, number> = {
    1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5,
    10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5,
  }
  const SI_18: Record<number, number> = {
    1: 1, 2: 3, 3: 5, 4: 7, 5: 9, 6: 11, 7: 13, 8: 15, 9: 17,
    10: 2, 11: 4, 12: 6, 13: 8, 14: 10, 15: 12, 16: 14, 17: 16, 18: 18,
  }
  const back = { '10': 4, '11': 4, '12': 4, '13': 5, '14': 3, '15': 4, '16': 5, '17': 4, '18': 6 }

  it('cuenta los hoyos 10..18 (antes: 0 hoyos jugados, fuera del leaderboard)', () => {
    const [j] = buildLeaderboard({
      jugadores: [jugador('a', 'Juanjo', back)],
      holes: 9, hoyoInicio: 10, parMap: PAR_18, siMap: SI_18, courseHcpMap: {},
      modoJuego: 'gross', formatoJuego: 'stroke_play',
    })
    expect(j.holesPlayed).toBe(9)
    expect(j.vsParGross).toBe(39 - 36)
  })

  it('neto: reparte el course handicap entero sobre los hoyos jugados', () => {
    // CH 9h = 5 → 5 golpes en los 5 hoyos de SI más bajo del back 9 (10,11,12,13,14).
    const [j] = buildLeaderboard({
      jugadores: [jugador('a', 'Juanjo', back, 10)],
      holes: 9, hoyoInicio: 10, parMap: PAR_18, siMap: SI_18, courseHcpMap: { a: 5 },
      modoJuego: 'neto', formatoJuego: 'stroke_play',
    })
    expect(j.vsParNeto).toBe(39 - 5 - 36)
  })

  it('sin hoyoInicio sigue mirando 1..N (compatibilidad)', () => {
    const [j] = buildLeaderboard({
      jugadores: [jugador('a', 'Juanjo', back)],
      holes: 9, parMap: PAR_18, siMap: SI_18, courseHcpMap: {},
      modoJuego: 'gross', formatoJuego: 'stroke_play',
    })
    expect(j.holesPlayed).toBe(0)
  })
})
