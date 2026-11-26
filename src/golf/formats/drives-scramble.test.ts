import { describe, expect, it } from 'vitest'
import {
  avisoDeDrives,
  contarDrives,
  conteoDeDrives,
  drivesConCambios,
  drivesMinimoPorJugador,
  jugadoresDeDrive,
  leerDrives,
  problemaDeJugadoresDeDrive,
  textoAvisoDeDrives,
} from './drives-scramble'

const H18 = Array.from({ length: 18 }, (_, i) => i + 1)
const H9_VUELTA = [10, 11, 12, 13, 14, 15, 16, 17, 18]
const EQUIPO = ['Pedro', 'Juan', 'Diego', 'Tomás']

/** drives con el jugador `j` en los hoyos dados. */
function con(...pares: Array<[number, number]>): Record<string, number> {
  return Object.fromEntries(pares.map(([h, j]) => [String(h), j]))
}

describe('drivesMinimoPorJugador', () => {
  it('4 a 18 hoyos, 2 a 9, null en otra cantidad', () => {
    expect(drivesMinimoPorJugador(18)).toBe(4)
    expect(drivesMinimoPorJugador(9)).toBe(2)
    expect(drivesMinimoPorJugador(27)).toBeNull()
  })
})

describe('leerDrives / jugadoresDeDrive', () => {
  it('descarta hoyos no enteros, índices fuera del equipo y valores que no son número', () => {
    expect(leerDrives({ '1': 0, '2': 3, '3': 4, '4': -1, x: 1, '0': 1, '5': 1.5, '6': '2', '7': null }, 4)).toEqual({ '1': 0, '2': 3 })
  })
  it('null, arreglo o texto → vacío', () => {
    expect(leerDrives(null, 4)).toEqual({})
    expect(leerDrives([0, 1], 4)).toEqual({})
    expect(leerDrives('x', 4)).toEqual({})
  })
  it('jugadores: null si no hay o no son textos', () => {
    expect(jugadoresDeDrive(null)).toBeNull()
    expect(jugadoresDeDrive([])).toBeNull()
    expect(jugadoresDeDrive([1, 2])).toBeNull()
    expect(jugadoresDeDrive(EQUIPO)).toEqual(EQUIPO)
  })
})

describe('contarDrives', () => {
  it('cuenta solo los hoyos de la ronda', () => {
    // Ronda de 9 desde el 10: el drive del hoyo 1 no es de esta ronda.
    expect(contarDrives(con([1, 0], [10, 0], [11, 1], [12, 0]), 4, H9_VUELTA)).toEqual([2, 1, 0, 0])
  })
})

describe('avisoDeDrives', () => {
  it('sin jugadores o sin mínimo no avisa (equipo sin drives)', () => {
    expect(avisoDeDrives({ jugadores: null, drives: {}, minimo: 4, hoyos: H18 })).toBeNull()
    expect(avisoDeDrives({ jugadores: EQUIPO, drives: {}, minimo: null, hoyos: H18 })).toBeNull()
  })

  it('al empezar no avisa: 18 hoyos libres y faltan 16', () => {
    expect(avisoDeDrives({ jugadores: EQUIPO, drives: {}, minimo: 4, hoyos: H18 })).toBeNull()
  })

  it('avisa justo cuando los hoyos libres dejan de sobrar (libres == faltan)', () => {
    // Pedro en los hoyos 1 a 6: libres 12; faltan 0 + 4 + 4 + 4 = 12 → aviso.
    const drives = con([1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0])
    const aviso = avisoDeDrives({ jugadores: EQUIPO, drives, minimo: 4, hoyos: H18 })
    expect(aviso).toEqual({
      hoyosRestantes: 12,
      faltan: [
        { posicion: 1, nombre: 'Juan', faltan: 4 },
        { posicion: 2, nombre: 'Diego', faltan: 4 },
        { posicion: 3, nombre: 'Tomás', faltan: 4 },
      ],
    })
    // Con un hoyo menos de Pedro sobra uno: no avisa.
    const { '6': _seis, ...cinco } = drives
    void _seis
    expect(avisoDeDrives({ jugadores: EQUIPO, drives: cinco, minimo: 4, hoyos: H18 })).toBeNull()
  })

  it('todos con el mínimo: no avisa aunque no queden hoyos', () => {
    const drives = Object.fromEntries(H18.map(h => [String(h), h % 4]))
    expect(avisoDeDrives({ jugadores: EQUIPO, drives, minimo: 4, hoyos: H18 })).toBeNull()
  })

  it('9 hoyos con mínimo 2', () => {
    // 10, 11 Pedro; 12, 13 Juan; 14 Diego: libres 4 (15-18), faltan Diego 1 + Tomás 2 = 3 → sin aviso.
    const drives = con([10, 0], [11, 0], [12, 1], [13, 1], [14, 2])
    expect(avisoDeDrives({ jugadores: EQUIPO, drives, minimo: 2, hoyos: H9_VUELTA })).toBeNull()
    // Uno más de Pedro (15): libres 3, faltan 3 → aviso.
    const aviso = avisoDeDrives({ jugadores: EQUIPO, drives: { ...drives, '15': 0 }, minimo: 2, hoyos: H9_VUELTA })
    expect(aviso?.hoyosRestantes).toBe(3)
    expect(aviso?.faltan.map(f => [f.nombre, f.faltan])).toEqual([['Diego', 1], ['Tomás', 2]])
  })
})

describe('textoAvisoDeDrives', () => {
  it('uno, con plural y singular', () => {
    expect(textoAvisoDeDrives({ faltan: [{ posicion: 0, nombre: 'Pedro', faltan: 2 }], hoyosRestantes: 3 }))
      .toBe('A Pedro le faltan 2 drives · quedan 3 hoyos')
    expect(textoAvisoDeDrives({ faltan: [{ posicion: 0, nombre: 'Pedro', faltan: 1 }], hoyosRestantes: 1 }))
      .toBe('A Pedro le falta 1 drive · queda 1 hoyo')
    expect(textoAvisoDeDrives({ faltan: [{ posicion: 0, nombre: 'Pedro', faltan: 1 }], hoyosRestantes: 0 }))
      .toBe('A Pedro le falta 1 drive · no quedan hoyos')
  })
  it('varios', () => {
    expect(textoAvisoDeDrives({
      faltan: [{ posicion: 0, nombre: 'Pedro', faltan: 2 }, { posicion: 1, nombre: 'Juan', faltan: 1 }], hoyosRestantes: 3,
    })).toBe('A Pedro le faltan 2 drives y a Juan 1 · quedan 3 hoyos')
    expect(textoAvisoDeDrives({
      faltan: [
        { posicion: 0, nombre: 'Pedro', faltan: 2 }, { posicion: 1, nombre: 'Juan', faltan: 1 }, { posicion: 2, nombre: 'Diego', faltan: 3 },
      ],
      hoyosRestantes: 6,
    })).toBe('A Pedro le faltan 2 drives, a Juan 1 y a Diego 3 · quedan 6 hoyos')
  })
})

describe('problemaDeJugadoresDeDrive', () => {
  it('exactamente 4, sin vacíos, sin repetidos, dentro del largo', () => {
    expect(problemaDeJugadoresDeDrive(EQUIPO)).toBeNull()
    expect(problemaDeJugadoresDeDrive(['Pedro', 'Juan', 'Diego'])).toBe('faltan')
    expect(problemaDeJugadoresDeDrive(['Pedro', 'Juan', '  ', 'Tomás'])).toBe('faltan')
    expect(problemaDeJugadoresDeDrive(['Pedro', 'juan', 'Diego', 'Juan '])).toBe('repetidos')
    expect(problemaDeJugadoresDeDrive(['Pedro', 'Juan', 'Diego', 'x'.repeat(21)])).toBe('largo')
  })
})

describe('conteoDeDrives', () => {
  it('conteo por jugador, lo que falta y ✓ al cumplir', () => {
    const drives = con([1, 0], [2, 0], [3, 0], [4, 2], [5, 2], [6, 2], [7, 2], [8, 3])
    expect(conteoDeDrives({ jugadores: EQUIPO, drives, minimo: 4, hoyos: H18 })).toEqual([
      { posicion: 0, nombre: 'Pedro', drives: 3, faltan: 1, cumple: false },
      { posicion: 1, nombre: 'Juan', drives: 0, faltan: 4, cumple: false },
      { posicion: 2, nombre: 'Diego', drives: 4, faltan: 0, cumple: true },
      { posicion: 3, nombre: 'Tomás', drives: 1, faltan: 3, cumple: false },
    ])
  })
  it('pasarse del mínimo sigue cumpliendo; sin mínimo no cumple ni falta', () => {
    const drives = con([1, 1], [2, 1], [3, 1], [4, 1], [5, 1])
    expect(conteoDeDrives({ jugadores: EQUIPO, drives, minimo: 4, hoyos: H18 })[1]).toMatchObject({ drives: 5, faltan: 0, cumple: true })
    expect(conteoDeDrives({ jugadores: EQUIPO, drives, minimo: null, hoyos: H18 })[1]).toMatchObject({ drives: 5, faltan: 0, cumple: false })
  })
  it('equipo sin drives → []', () => {
    expect(conteoDeDrives({ jugadores: null, drives: {}, minimo: 4, hoyos: H18 })).toEqual([])
  })
})

describe('drivesConCambios', () => {
  it('pisa por hoyo en orden, un negativo quita el drive y no muta la base', () => {
    const base = con([1, 0], [2, 1], [3, 2])
    expect(drivesConCambios(base, { '2': 3, '4': 0 }, { '1': -1, '4': 2 })).toEqual(con([2, 3], [3, 2], [4, 2]))
    expect(base).toEqual(con([1, 0], [2, 1], [3, 2]))
  })
  it('sin cambios = copia de la base', () => {
    expect(drivesConCambios(con([5, 1]))).toEqual(con([5, 1]))
  })
})
