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

  // El servidor indexa `insertedPlayers[idx]` con estas posiciones: la UI nunca
  // las arma mal (`equiposConIndices`), pero el POST es público para cualquier
  // sesión. Antes, `[0,0] + [1,1]` pasaba (tamaños 2, total 4) y dejaba a dos
  // jugadores sin equipo; un índice fuera de rango tiraba un 500 con la ronda ya
  // creada a medias.
  it('un jugador repetido en dos equipos bloquea aunque los tamaños cuadren', () => {
    const problema = validarNuevaRonda(
      ronda({
        formato: 'best_ball',
        jugadores: CUATRO,
        equipos: [
          { nombre: 'Equipo 1', jugadorIndices: [0, 1] },
          { nombre: 'Equipo 2', jugadorIndices: [1, 2] },
        ],
      }),
    )
    expect(problema?.titulo).toBe('Equipos incompletos')
  })

  it('el mismo jugador dos veces en un equipo bloquea', () => {
    const problema = validarNuevaRonda(
      ronda({
        formato: 'scramble',
        jugadores: CUATRO,
        equipos: [
          { nombre: 'Equipo 1', jugadorIndices: [0, 0] },
          { nombre: 'Equipo 2', jugadorIndices: [1, 1] },
        ],
      }),
    )
    expect(problema?.titulo).toBe('Equipos incompletos')
  })

  it('una posición fuera de la lista de jugadores bloquea', () => {
    for (const fuera of [4, -1, 1.5]) {
      const problema = validarNuevaRonda(
        ronda({
          formato: 'best_ball',
          jugadores: CUATRO,
          equipos: [
            { nombre: 'Equipo 1', jugadorIndices: [0, 1] },
            { nombre: 'Equipo 2', jugadorIndices: [2, fuera] },
          ],
        }),
      )
      expect(problema?.titulo, `posición ${fuera}`).toBe('Equipos incompletos')
    }
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

describe('rango del índice', () => {
  it('frena un índice tipeado sin el punto, también en gross', () => {
    const problema = validarNuevaRonda(
      ronda({ jugadores: [{ nombre: 'Juanjo', indice: 12.4 }, { nombre: 'Nico', indice: 185 }] }),
    )
    expect(problema?.titulo).toBe('Índice fuera de rango')
    expect(problema?.detalle).toContain('Nico')
    expect(problema?.detalle).not.toContain('Juanjo')
  })

  it('acepta los extremos: plus 10 y 54', () => {
    expect(validarNuevaRonda(ronda({ jugadores: [{ nombre: 'Plus', indice: -10 }] }))).toBeNull()
    expect(validarNuevaRonda(ronda({ jugadores: [{ nombre: 'Tope', indice: 54 }] }))).toBeNull()
  })

  it('va antes que el índice faltante: primero se corrige lo tipeado', () => {
    const problema = validarNuevaRonda(
      ronda({ modo: 'neto', jugadores: [{ nombre: 'Juanjo', indice: 540 }, { nombre: 'Nico', indice: null }] }),
    )
    expect(problema?.titulo).toBe('Índice fuera de rango')
  })
})

describe('nombres', () => {
  it('un jugador sin nombre frena la ronda — la API valida min(1)', () => {
    const problema = validarNuevaRonda(ronda({ jugadores: [{ nombre: '', indice: 12 }] }))
    expect(problema?.titulo).toBe('Falta un nombre')
  })

  it('un nombre de puros espacios tampoco pasa', () => {
    expect(validarNuevaRonda(ronda({ jugadores: [{ nombre: '   ', indice: 12 }] }))?.titulo)
      .toBe('Falta un nombre')
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

describe('cuentas elegidas para los rivales', () => {
  const CREADOR = '11111111-1111-4111-8111-111111111111'
  const NICO = '22222222-2222-4222-8222-222222222222'
  const PEDRO = '33333333-3333-4333-8333-333333333333'

  it('rivales con cuentas distintas y otros sin cuenta: se puede crear', () => {
    expect(validarNuevaRonda(ronda({
      creadorId: CREADOR,
      jugadores: [
        { nombre: 'Juanjo', indice: 12.4 },
        { nombre: 'Nico', indice: 8.1, perfilId: NICO },
        { nombre: 'Pedro', indice: 20, perfilId: PEDRO },
        { nombre: 'Tomás', indice: 15.5, perfilId: null },
      ],
    }))).toBeNull()
  })

  it('la misma cuenta en dos rivales se frena', () => {
    const p = validarNuevaRonda(ronda({
      creadorId: CREADOR,
      jugadores: [
        { nombre: 'Juanjo', indice: 12.4 },
        { nombre: 'Nico', indice: 8.1, perfilId: NICO },
        { nombre: 'Nicolás', indice: 8.1, perfilId: NICO },
      ],
    }))
    expect(p?.titulo).toBe('Jugador repetido')
    expect(p?.detalle).toContain('Nicolás')
  })

  it('el creador no se puede elegir como rival', () => {
    const p = validarNuevaRonda(ronda({
      creadorId: CREADOR,
      jugadores: [
        { nombre: 'Juanjo', indice: 12.4 },
        { nombre: 'Juanjo 2', indice: 12.4, perfilId: CREADOR },
      ],
    }))
    expect(p?.titulo).toBe('Ya estás en la ronda')
  })
})
