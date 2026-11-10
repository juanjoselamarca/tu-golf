// 09-nov-2026 (revisión del PR #757) — El orden de equipos es UNA fuente para la
// tabla, el cuadro ganador y la imagen para compartir. Un equipo que no anotó
// ningún hoyo tenía score primario 0 y quedaba primero ("E") delante de equipos
// que sí jugaron sobre el par.
import { describe, it, expect } from 'vitest'
import { rankTeamsWithCountback } from './team-tiebreak'

interface Fila { id: string; vsPar: number; hoyos: number[] }

const ordenar = (filas: Fila[]) => rankTeamsWithCountback(filas, {
  mode: 'lower_wins',
  primaryScore: (t) => t.vsPar,
  holeScores: (t) => t.hoyos,
  holesPlayed: (t) => t.hoyos.filter((h) => h > 0).length,
}).map((t) => t.id)

describe('rankTeamsWithCountback — equipos sin hoyos', () => {
  it('un equipo sin ningún hoyo anotado va al final, aunque su vs par sea 0', () => {
    const filas: Fila[] = [
      { id: 'vacio', vsPar: 0, hoyos: [0, 0, 0] },
      { id: 'jugo', vsPar: 4, hoyos: [5, 5, 6] },
      { id: 'mejor', vsPar: 2, hoyos: [5, 4, 5] },
    ]
    expect(ordenar(filas)).toEqual(['mejor', 'jugo', 'vacio'])
  })

  it('varios equipos sin hoyos conservan su orden de llegada al final', () => {
    const filas: Fila[] = [
      { id: 'v1', vsPar: 0, hoyos: [] },
      { id: 'jugo', vsPar: 1, hoyos: [4, 4, 5] },
      { id: 'v2', vsPar: 0, hoyos: [0] },
    ]
    expect(ordenar(filas)).toEqual(['jugo', 'v1', 'v2'])
  })

  it('con un solo equipo que anotó no hay countback que hacer y el vacío igual va último', () => {
    expect(ordenar([{ id: 'vacio', vsPar: 0, hoyos: [] }, { id: 'jugo', vsPar: -1, hoyos: [3, 4, 4] }])).toEqual(['jugo', 'vacio'])
  })

  it('el countback sigue desempatando entre los que jugaron', () => {
    const filas: Fila[] = [
      { id: 'a', vsPar: 0, hoyos: [4, 4, 4] },
      { id: 'b', vsPar: 0, hoyos: [5, 4, 3] }, // mejor back → gana el countback
      { id: 'vacio', vsPar: 0, hoyos: [0, 0, 0] },
    ]
    expect(ordenar(filas)).toEqual(['b', 'a', 'vacio'])
  })
})

describe('rankTeamsWithCountback — clave de empate (posiciones "T" de la tabla)', () => {
  const clasificar = (filas: Fila[]) => rankTeamsWithCountback(filas, {
    mode: 'lower_wins',
    primaryScore: (t) => t.vsPar,
    holeScores: (t) => t.hoyos,
    holesPlayed: (t) => t.hoyos.filter((h) => h > 0).length,
  }).map((t) => `${t.id}:${t.claveEmpate}`)

  // 9 hoyos, par 4 todos: -12 no cabe, se usa el mismo empate a escala (−3 cada uno).
  const A = { id: 'A', vsPar: -3, hoyos: [4, 4, 4, 4, 4, 4, 3, 3, 3] } // back 3 mejor
  const B = { id: 'B', vsPar: -3, hoyos: [3, 3, 3, 4, 4, 4, 4, 4, 4] }

  it('scramble cerrado con dos equipos empatados: el countback separa (A 1°, B 2°), como el podio', () => {
    const out = clasificar([B, A, { id: 'C', vsPar: 1, hoyos: new Array(9).fill(4).map((v, i) => (i === 0 ? 5 : v)) }])
    expect(out).toEqual(['A:0#0', 'B:0#1', 'C:1#0'])
  })

  it('a mitad de vuelta no corre el countback: mismo vs par = misma clave (T), arriba el de más hoyos', () => {
    const enCancha = { id: 'B', vsPar: -3, hoyos: [3, 3, 3, 4, 4, 4, 0, 0, 0] }
    expect(clasificar([enCancha, A])).toEqual(['A:0#0', 'B:0#0'])
  })

  it('un equipo sin hoyos queda con clave null (sin posición)', () => {
    expect(clasificar([{ id: 'V', vsPar: 0, hoyos: [0, 0, 0] }, A])).toEqual(['A:0#0', 'V:null'])
  })
})
