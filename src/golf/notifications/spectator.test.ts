import { describe, it, expect } from 'vitest'
import {
  buildSpectatorNotification,
  buildCollapsedBody,
  sortSpectatorPlayers,
  spectatorTag,
  SPECTATOR_COPY,
  type SpectatorPlayer,
} from './spectator'

const p = (nombre: string, vsPar: number, holesCompleted: number, extra: Partial<SpectatorPlayer> = {}): SpectatorPlayer =>
  ({ nombre, vsPar, holesCompleted, totalHoles: 9, ...extra })

describe('buildSpectatorNotification — regresión "H0 / Lamarca E" (inbox f6cca8e3)', () => {
  // Reproducción exacta: Juanjo siguió su ronda desde /en-vivo antes de salir al
  // tee. maxHolesCompleted=0, vsPar=0. Prod mostró "Club de Golf Los Leones · H0"
  // y "Lamarca E".
  const repro = buildSpectatorNotification({
    courseName: 'Club de Golf Los Leones',
    codigo: '4YDC3G',
    totalHoles: 9,
    players: [p('Juan José Lamarca', 0, 0)],
  })

  it('nunca muestra "H0" ni un hoyo cero', () => {
    expect(repro.title).not.toMatch(/H0|Hoyo 0|Thru 0/)
    expect(repro.title).toBe(`Club de Golf Los Leones · ${SPECTATOR_COPY.notStarted}`)
  })

  it('no dice "E" (even) de un jugador que no empezó', () => {
    expect(repro.body).not.toContain('Lamarca E')
    expect(repro.body).toBe(SPECTATOR_COPY.noScoresYet)
  })

  it('tag y url por ronda', () => {
    expect(repro.tag).toBe(spectatorTag('4YDC3G'))
    expect(repro.url).toBe('/ronda-libre/4YDC3G')
    expect(repro.finished).toBe(false)
  })
})

describe('buildSpectatorNotification — avance con la convención PGA (Thru = hoyos terminados)', () => {
  it('terminó el hoyo 3 de 9 → "Thru 3" (no "Hoyo 4", no "H3")', () => {
    const n = buildSpectatorNotification({
      courseName: 'Club de Golf Los Leones', codigo: 'X', totalHoles: 9,
      players: [p('Juan José Lamarca', 4, 3)],
    })
    expect(n.title).toBe('Club de Golf Los Leones · Thru 3')
    expect(n.body).toBe('Lamarca +4')
  })

  it('usa el jugador más avanzado del grupo', () => {
    const n = buildSpectatorNotification({
      courseName: 'Los Leones', codigo: 'X', totalHoles: 18,
      players: [p('A Uno', 1, 5), p('B Dos', -1, 7), p('C Tres', 0, 0)],
    })
    expect(n.title).toBe('Los Leones · Thru 7')
  })

  it('todos terminaron pero la ronda no está cerrada → "Thru F", como el marcador', () => {
    const n = buildSpectatorNotification({
      courseName: 'Los Leones', codigo: 'X', totalHoles: 9,
      players: [p('A Uno', 2, 9)],
    })
    expect(n.title).toBe('Los Leones · Thru F')
  })

  it('sin totalHoles explícito toma el declarado por los jugadores', () => {
    const n = buildSpectatorNotification({
      courseName: 'Los Leones', codigo: 'X',
      players: [p('A Uno', 2, 9, { totalHoles: 9 })],
    })
    expect(n.title).toBe('Los Leones · Thru F')
  })

  it('ronda finalizada → "Resultado final" con url ?finished=true', () => {
    const n = buildSpectatorNotification({
      courseName: 'Los Leones', codigo: 'ABC', totalHoles: 9, finished: true,
      players: [p('A Uno', 2, 9)],
    })
    expect(n.title).toBe('Resultado final · Los Leones')
    expect(n.url).toBe('/ronda-libre/ABC?finished=true')
    expect(n.finished).toBe(true)
  })
})

describe('buildCollapsedBody', () => {
  it('ordena por vs-par y muestra GWI solo con 6+ hoyos', () => {
    const body = buildCollapsedBody([
      p('Pedro González', -1, 7, { gwi: 22.4 }),
      p('Juan Lamarca', -3, 7, { gwi: 68 }),
      p('Ana Silva', 0, 5, { gwi: 40 }),
    ])
    expect(body).toBe('Lamarca -3 68% | González -1 22% | Silva E')
  })

  it('el que no empezó va al final con "—", no con "E"', () => {
    const body = buildCollapsedBody([p('Ana Silva', 0, 0), p('Juan Lamarca', 2, 3)])
    expect(body).toBe('Lamarca +2 | Silva —')
  })

  it('máximo 4 jugadores', () => {
    const body = buildCollapsedBody([1, 2, 3, 4, 5].map(i => p(`Jugador N${i}`, i, 2)))
    expect(body.split(' | ')).toHaveLength(4)
  })

  it('nombre con espacios múltiples o de una palabra', () => {
    expect(buildCollapsedBody([p('  Juan   Lamarca ', 1, 1)])).toBe('Lamarca +1')
    expect(buildCollapsedBody([p('Tiger', -2, 1)])).toBe('Tiger -2')
  })
})

describe('sortSpectatorPlayers', () => {
  it('no muta el array de entrada', () => {
    const input = [p('B', 1, 1), p('A', -1, 1)]
    const copy = [...input]
    sortSpectatorPlayers(input)
    expect(input).toEqual(copy)
  })
})
