import { describe, it, expect } from 'vitest'
import { ordenarJugadoresDeLaRonda, conJugadoresOrdenados } from './orden-jugadores'

const creador = { id: 'c9', nombre: 'E2E Test', user_id: 'u-creador' }
const uno = { id: 'a1', nombre: 'Inv Uno', user_id: null }
const tres = { id: 'b2', nombre: 'Inv Tres', user_id: null }

describe('ordenarJugadoresDeLaRonda', () => {
  // Prod 22-oct, ronda T2R1V3: tras anotar, el embebido llegó como "Inv Uno, Inv Tres,
  // E2E Test" (orden físico = el último jugador actualizado va al final).
  it('el orden no depende de cómo llegaron las filas: cualquier permutación da lo mismo', () => {
    const esperado = ['E2E Test', 'Inv Tres', 'Inv Uno']
    for (const llegada of [[creador, uno, tres], [uno, tres, creador], [tres, creador, uno]]) {
      expect(ordenarJugadoresDeLaRonda(llegada, 'u-creador').map(j => j.nombre)).toEqual(esperado)
    }
  })

  it('el creador va primero aunque su nombre ordene después', () => {
    const zeta = { id: 'z', nombre: 'Zeta', user_id: 'u-z' }
    expect(ordenarJugadoresDeLaRonda([uno, zeta], 'u-z')[0].nombre).toBe('Zeta')
  })

  it('a igual nombre desempata por id (dos "Juan" no se cruzan entre cargas)', () => {
    const j1 = { id: 'x2', nombre: 'Juan', user_id: null }
    const j2 = { id: 'x1', nombre: 'juan', user_id: null }
    expect(ordenarJugadoresDeLaRonda([j1, j2], null).map(j => j.id)).toEqual(['x1', 'x2'])
    expect(ordenarJugadoresDeLaRonda([j2, j1], null).map(j => j.id)).toEqual(['x1', 'x2'])
  })

  it('no muta el arreglo original', () => {
    const llegada = [uno, creador]
    ordenarJugadoresDeLaRonda(llegada, 'u-creador')
    expect(llegada[0]).toBe(uno)
  })
})

describe('conJugadoresOrdenados', () => {
  it('ordena los jugadores de la ronda usando su creador', () => {
    const r = conJugadoresOrdenados({ creador_id: 'u-creador', ronda_libre_jugadores: [uno, tres, creador] })
    expect(r.ronda_libre_jugadores.map(j => j.id)).toEqual(['c9', 'b2', 'a1'])
  })
  it('sin arreglo de jugadores devuelve la ronda tal cual', () => {
    const r = { creador_id: 'u', ronda_libre_jugadores: undefined as never }
    expect(conJugadoresOrdenados(r)).toBe(r)
  })
})

describe('nombre nulo (varios selects lo tipan string | null)', () => {
  it('no revienta y manda el sin-nombre al principio', () => {
    const out = ordenarJugadoresDeLaRonda(
      [{ id: 'b', nombre: 'Ana', user_id: null }, { id: 'a', nombre: null, user_id: null }],
      null,
    )
    expect(out.map(j => j.id)).toEqual(['a', 'b'])
  })
})
