import { describe, it, expect } from 'vitest'
import { armarReglasGuardadas, crearConfigDePlantilla } from '@/golf/formats/personalizado'
import { ordenarJugadoresDeLaRonda, conJugadoresOrdenados, conOrdenEnPantalla, ordenDelJuego } from './orden-jugadores'

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

// QA Timba 17-nov (B1): el scorer ordenaba creador + alfabético y la pestaña Juego por `jugadorIds`: en la misma
// pantalla dos órdenes y el compañero de pareja lejos. Decisión de Juanjo: en una Timba, el orden del juego en todo.
describe('conJugadoresOrdenados — Timba libre: el orden del juego', () => {
  const ids = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000d']
  const [A, B, C, D] = ids.map((id, i) => ({ id, nombre: ['Zeta', 'Ana', 'Mario', 'Beto'][i], user_id: i === 0 ? 'u-creador' : null }))
  const reglas = (jugadorIds: string[]) => armarReglasGuardadas({ ...crearConfigDePlantilla('subterranea'), parejas: [[0, 1], [2, 3]] }, jugadorIds)

  it('sigue `reglas_juego.jugadorIds`, llegue como llegue el embebido', () => {
    for (const llegada of [[D, C, B, A], [B, D, A, C]]) {
      const r = conJugadoresOrdenados({ creador_id: 'u-creador', formato_juego: 'personalizado', reglas_juego: reglas(ids), ronda_libre_jugadores: llegada })
      expect(r.ronda_libre_jugadores.map(j => j.nombre)).toEqual(['Zeta', 'Ana', 'Mario', 'Beto'])
    }
  })

  it('reglas que no nombran exactamente a los jugadores (o inválidas): el orden canónico', () => {
    const canonico = ['Zeta', 'Ana', 'Beto', 'Mario']
    const con = (reglas_juego: unknown, jug = [D, C, B, A]) =>
      conJugadoresOrdenados({ creador_id: 'u-creador', formato_juego: 'personalizado', reglas_juego, ronda_libre_jugadores: jug }).ronda_libre_jugadores.map(j => j.nombre)
    expect(con(reglas([ids[0], ids[1], ids[2], '00000000-0000-4000-8000-0000000000ff']))).toEqual(canonico)
    expect(con(reglas(ids), [D, C, B])).toEqual(['Ana', 'Beto', 'Mario'])
    expect(con({ basura: true })).toEqual(canonico)
    expect(con(null)).toEqual(canonico)
  })

  it('ordenDelJuego: null sin reglas', () => {
    expect(ordenDelJuego(undefined, [A])).toBeNull()
  })

  // Revisión Fable: en otro formato el orden decide al jugador A (match play); las reglas no mandan fuera de una Timba.
  it('fuera de una Timba (o sin formato) las reglas no cambian el orden canónico', () => {
    for (const formato_juego of ['match_play', null, undefined]) {
      const r = conJugadoresOrdenados({ creador_id: 'u-creador', formato_juego, reglas_juego: reglas(ids), ronda_libre_jugadores: [D, C, B, A] })
      expect(r.ronda_libre_jugadores.map(j => j.nombre)).toEqual(['Zeta', 'Ana', 'Beto', 'Mario'])
    }
  })
})

// Revisión Fable: una copia local de antes del orden del juego abre en el canónico; el refresco de fondo no mueve las filas.
describe('conOrdenEnPantalla', () => {
  const j = (id: string) => ({ id })
  it('mismos jugadores: conserva el orden en pantalla con los datos nuevos', () => {
    const enPantalla = { ronda_libre_jugadores: [j('a'), j('b'), j('c')] }
    const nueva = { ronda_libre_jugadores: [{ id: 'c', x: 3 }, { id: 'a', x: 1 }, { id: 'b', x: 2 }] }
    expect(conOrdenEnPantalla(enPantalla as typeof nueva, nueva).ronda_libre_jugadores).toEqual([{ id: 'a', x: 1 }, { id: 'b', x: 2 }, { id: 'c', x: 3 }])
  })
  it('cambió quién juega: manda el orden nuevo', () => {
    const nueva = { ronda_libre_jugadores: [j('c'), j('a')] }
    expect(conOrdenEnPantalla({ ronda_libre_jugadores: [j('a'), j('b')] }, nueva)).toBe(nueva)
    expect(conOrdenEnPantalla({ ronda_libre_jugadores: [j('a')] }, nueva)).toBe(nueva)
    // Ids repetidos en pantalla no se aceptan como "los mismos" (perdería a un jugador).
    expect(conOrdenEnPantalla({ ronda_libre_jugadores: [j('a'), j('a'), j('c')] }, { ronda_libre_jugadores: [j('a'), j('b'), j('c')] }).ronda_libre_jugadores.map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
})
