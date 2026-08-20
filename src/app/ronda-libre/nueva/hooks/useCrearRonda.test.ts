import { describe, it, expect } from 'vitest'
import { jugadoresDeLaRonda, equiposConIndices } from './useCrearRonda'
import { ID_DEL_CREADOR, type EquipoDeLaRonda, type RivalDelCreador } from './useFormularioDeRonda'

function rival(id: string, nombre: string, over: Partial<RivalDelCreador> = {}): RivalDelCreador {
  return { id, tipo: 'invitado', nombre, telefono: '', handicap: null, tees: null, profileId: null, ...over }
}

const CREADOR = { nombre: 'Juanjo', indice: 12.4 }

describe('jugadoresDeLaRonda', () => {
  it('el creador va primero y los rivales sin nombre no entran', () => {
    const jugadores = jugadoresDeLaRonda({
      creador: CREADOR,
      teeGlobal: 'blanco',
      rivales: [rival('r1', 'Nico'), rival('r2', '  '), rival('r3', 'Pedro')],
    })
    expect(jugadores.map(j => j.nombre)).toEqual(['Juanjo', 'Nico', 'Pedro'])
    expect(jugadores[0].id).toBe(ID_DEL_CREADOR)
    expect(jugadores[0].esCreador).toBe(true)
  })

  it('cada rival conserva SU índice, SU tee y SU teléfono', () => {
    // El bug viejo: la lista se filtraba por nombre pero el payload indexaba la
    // lista sin filtrar, así que con un hueco en el medio los datos se corrían
    // un lugar y el rival jugaba con el handicap del siguiente.
    const jugadores = jugadoresDeLaRonda({
      creador: CREADOR,
      teeGlobal: 'blanco',
      rivales: [
        rival('r1', '', { handicap: 99, telefono: '+56900000000' }),
        rival('r2', 'Nico', { handicap: 8.1, tees: 'azul', telefono: '+56911111111' }),
      ],
    })
    expect(jugadores).toHaveLength(2)
    expect(jugadores[1]).toMatchObject({
      nombre: 'Nico',
      indice: 8.1,
      tees: 'azul',
      telefono: '+56911111111',
    })
  })

  it('un rival sin tee propio hereda el tee de la ronda', () => {
    const jugadores = jugadoresDeLaRonda({
      creador: CREADOR,
      teeGlobal: 'negras',
      rivales: [rival('r1', 'Nico')],
    })
    expect(jugadores[1].tees).toBe('negras')
  })

  it('el nombre se recorta', () => {
    const jugadores = jugadoresDeLaRonda({
      creador: CREADOR,
      teeGlobal: 'blanco',
      rivales: [rival('r1', '  Nico  ')],
    })
    expect(jugadores[1].nombre).toBe('Nico')
  })
})

describe('equiposConIndices', () => {
  const rivales = [rival('r1', 'Nico'), rival('r2', 'Pedro'), rival('r3', 'Tomás')]
  const jugadores = jugadoresDeLaRonda({ creador: CREADOR, teeGlobal: 'blanco', rivales })

  const equipos: EquipoDeLaRonda[] = [
    { nombre: 'Equipo 1', miembros: [ID_DEL_CREADOR, 'r1'] },
    { nombre: 'Equipo 2', miembros: ['r2', 'r3'] },
  ]

  it('traduce ids a las posiciones que espera la API', () => {
    expect(equiposConIndices(equipos, jugadores)).toEqual([
      { nombre: 'Equipo 1', jugadorIndices: [0, 1] },
      { nombre: 'Equipo 2', jugadorIndices: [2, 3] },
    ])
  })

  it('borrar el nombre de un rival del medio NO mueve a los demás de equipo', () => {
    // Con posiciones guardadas en el estado, Pedro desaparecía de la lista y
    // Tomás pasaba a ocupar su índice: el equipo 2 terminaba con Tomás dos
    // veces y Pedro puntuando para nadie. Con ids, Pedro simplemente se cae.
    const sinPedro = jugadoresDeLaRonda({
      creador: CREADOR,
      teeGlobal: 'blanco',
      rivales: [rivales[0], rival('r2', ''), rivales[2]],
    })
    expect(sinPedro.map(j => j.nombre)).toEqual(['Juanjo', 'Nico', 'Tomás'])
    expect(equiposConIndices(equipos, sinPedro)).toEqual([
      { nombre: 'Equipo 1', jugadorIndices: [0, 1] },
      { nombre: 'Equipo 2', jugadorIndices: [2] },
    ])
  })

  it('un id que ya no existe se cae en vez de apuntar a otro jugador', () => {
    const dosJugadores = jugadoresDeLaRonda({
      creador: CREADOR,
      teeGlobal: 'blanco',
      rivales: [rivales[0]],
    })
    expect(equiposConIndices([{ nombre: 'Equipo 1', miembros: ['r9'] }], dosJugadores)).toEqual([
      { nombre: 'Equipo 1', jugadorIndices: [] },
    ])
  })

  it('ninguna posición devuelta cae fuera de la lista de jugadores', () => {
    for (const equipo of equiposConIndices(equipos, jugadores)) {
      for (const i of equipo.jugadorIndices) {
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(jugadores.length)
      }
    }
  })

  it('un jugador no puede quedar en dos equipos por culpa de la traducción', () => {
    const todas = equiposConIndices(equipos, jugadores).flatMap(e => e.jugadorIndices)
    expect(new Set(todas).size).toBe(todas.length)
  })
})
