import { describe, it, expect } from 'vitest'
import { validarNuevaRonda, type RondaAValidar } from './validar-nueva-ronda'

function ronda(over: Partial<RondaAValidar> = {}): RondaAValidar {
  return {
    cancha: 'Club de Golf Lomas de La Dehesa',
    formato: 'stroke_play',
    modo: 'gross',
    jugadores: [{ nombre: 'Juanjo', indice: 12.4 }],
    equipos: [],
    ...over,
  }
}

const CUATRO = [
  { nombre: 'Juanjo', indice: 12.4 },
  { nombre: 'Nico', indice: 8.1 },
  { nombre: 'Pedro', indice: 20 },
  { nombre: 'Tomás', indice: 15.5 },
]

const DOS_EQUIPOS = [
  { nombre: 'Equipo 1', jugadorIndices: [0, 1] },
  { nombre: 'Equipo 2', jugadorIndices: [2, 3] },
]

describe('cancha', () => {
  it('sin cancha no hay ronda', () => {
    expect(validarNuevaRonda(ronda({ cancha: '' }))?.titulo).toBe('Selecciona una cancha')
  })

  it('una cancha de puros espacios no cuenta', () => {
    expect(validarNuevaRonda(ronda({ cancha: '   ' }))?.titulo).toBe('Selecciona una cancha')
  })
})

describe('stroke play', () => {
  it('un jugador solo puede crear su ronda', () => {
    expect(validarNuevaRonda(ronda())).toBeNull()
  })

  it('no admite más jugadores de los que la API acepta', () => {
    const cinco = [...CUATRO, { nombre: 'Quinto', indice: 10 }]
    expect(validarNuevaRonda(ronda({ jugadores: cinco }))?.titulo).toBe('Demasiados jugadores')
  })
})

describe('match play', () => {
  it('con un solo jugador pide el rival', () => {
    const problema = validarNuevaRonda(ronda({ formato: 'match_play', modo: 'neto' }))
    expect(problema?.titulo).toContain('2 jugadores')
    expect(problema?.detalle).toContain('Agrega')
  })

  it('con tres jugadores pide sacar los de más', () => {
    const problema = validarNuevaRonda(
      ronda({ formato: 'match_play', modo: 'neto', jugadores: CUATRO.slice(0, 3) }),
    )
    expect(problema?.detalle).toContain('quita')
  })

  it('exactamente dos pasa', () => {
    expect(
      validarNuevaRonda(ronda({ formato: 'match_play', modo: 'neto', jugadores: CUATRO.slice(0, 2) })),
    ).toBeNull()
  })
})

describe('formatos por equipo', () => {
  it('con menos de cuatro jugadores no se puede', () => {
    const problema = validarNuevaRonda(
      ronda({ formato: 'best_ball', jugadores: CUATRO.slice(0, 3), equipos: DOS_EQUIPOS }),
    )
    expect(problema?.titulo).toBe('Faltan jugadores')
  })

  it('cuatro jugadores en dos equipos de dos pasa', () => {
    expect(
      validarNuevaRonda(ronda({ formato: 'best_ball', jugadores: CUATRO, equipos: DOS_EQUIPOS })),
    ).toBeNull()
  })

  it('un jugador sin equipo bloquea la creación', () => {
    const problema = validarNuevaRonda(
      ronda({
        formato: 'scramble',
        jugadores: CUATRO,
        equipos: [
          { nombre: 'Equipo 1', jugadorIndices: [0, 1] },
          { nombre: 'Equipo 2', jugadorIndices: [2] },
        ],
      }),
    )
    expect(problema?.titulo).toBe('Equipos incompletos')
  })

  it('un equipo de uno bloquea aunque estén todos asignados', () => {
    const problema = validarNuevaRonda(
      ronda({
        formato: 'best_ball',
        jugadores: CUATRO,
        equipos: [
          { nombre: 'Equipo 1', jugadorIndices: [0, 1, 2] },
          { nombre: 'Equipo 2', jugadorIndices: [3] },
        ],
      }),
    )
    expect(problema?.titulo).toBe('Equipos incompletos')
  })

  it('foursome exige exactamente dos por equipo y lo dice', () => {
    const problema = validarNuevaRonda(
      ronda({
        formato: 'foursome',
        jugadores: CUATRO,
        equipos: [
          { nombre: 'Equipo 1', jugadorIndices: [0, 1, 2] },
          { nombre: 'Equipo 2', jugadorIndices: [3] },
        ],
      }),
    )
    expect(problema?.detalle).toContain('exactamente 2')
  })
})

describe('modo neto', () => {
  it('exige índice de todos', () => {
    const problema = validarNuevaRonda(
      ronda({
        modo: 'neto',
        jugadores: [
          { nombre: 'Juanjo', indice: 12.4 },
          { nombre: 'Nico', indice: null },
        ],
      }),
    )
    expect(problema?.titulo).toBe('Índice requerido')
    expect(problema?.detalle).toContain('Nico')
    expect(problema?.detalle).not.toContain('Juanjo')
  })

  it('gross no pide índices a nadie', () => {
    expect(
      validarNuevaRonda(
        ronda({
          modo: 'gross',
          jugadores: [
            { nombre: 'Juanjo', indice: null },
            { nombre: 'Nico', indice: null },
          ],
        }),
      ),
    ).toBeNull()
  })

  it('un índice de 0 es un índice válido, no un faltante', () => {
    expect(
      validarNuevaRonda(ronda({ modo: 'neto', jugadores: [{ nombre: 'Scratch', indice: 0 }] })),
    ).toBeNull()
  })
})

describe('orden de los problemas', () => {
  it('la cancha se reclama antes que los jugadores', () => {
    const problema = validarNuevaRonda(
      ronda({ cancha: '', formato: 'match_play', modo: 'neto', jugadores: [] }),
    )
    expect(problema?.titulo).toBe('Selecciona una cancha')
  })
})
