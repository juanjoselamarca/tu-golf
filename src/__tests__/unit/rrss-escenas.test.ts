// La escena de un video de RRSS tiene que contar la historia que dice contar.
//
// El reel 1 del lanzamiento muestra UNA cosa: alguien anota un birdie y el líder
// cambia en el teléfono de todos. Si los brutos sembrados no producen ese orden,
// la grabación sale igual —el guion tarda 40 segundos y nadie mira fotograma por
// fotograma— y la pieza queda mostrando una app que no hace lo que promete.
//
// Acá se recalcula el leaderboard con el MOTOR de golf, no con la aritmética del
// comentario de la escena: el course handicap sale del tee de cada jugador y los
// golpes por hoyo del stroke index, igual que en el scorer. `escena.mjs` verifica
// contra la base que el catálogo declarado siga siendo el real antes de sembrar.
import { describe, it, expect } from 'vitest'
// Módulo .mjs compartido con los scripts de captura.
import { ESCENAS, teeDeJugador } from '../../../scripts/rrss/escenas.mjs'
import { resolverCourseHandicap } from '@/golf/core/course-handicap'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'

interface HoyoDeclarado {
  par: number
  si: number
}
interface TeeDeclarado {
  genero: string
  rating: number
  slope: number
  par: number
}
interface JugadorDeEscena {
  nombre: string
  handicap: number
  tee?: string
  golpes: number[]
}
interface Escena {
  codigo: string
  tee: string
  hoyos_jugados: number[]
  hoyo_del_gesto: number
  golpes_del_gesto: number
  catalogo: { nombre: string; hoyos: HoyoDeclarado[]; tees: Record<string, TeeDeclarado> }
  jugadores: JugadorDeEscena[]
}

const escena = ESCENAS['anota-todos-ven'] as Escena

/** Course handicap del jugador: del TEE que juega, como en `courseHandicapsDeRonda`. */
function courseHcp(j: JugadorDeEscena): number {
  const tee = escena.catalogo.tees[teeDeJugador(escena, j)]
  expect(tee, `la escena no declara el tee "${teeDeJugador(escena, j)}"`).toBeTruthy()
  return resolverCourseHandicap(
    j.handicap,
    { slope: tee.slope, courseRating: tee.rating, par: tee.par },
    18,
  )
}

/** Neto contra el par de los hoyos que lleva jugados (lo que muestra el board). */
function netoVsPar(j: JugadorDeEscena, hoyos: number[], golpes: number[]): number {
  const ch = courseHcp(j)
  let total = 0
  hoyos.forEach((numero, i) => {
    const hoyo = escena.catalogo.hoyos[numero - 1]
    total += golpes[i] - strokesRecibidosEnHoyo(ch, hoyo.si, 18) - hoyo.par
  })
  return total
}

/** El orden del leaderboard: neto contra par, de menor a mayor. */
function orden(netos: Array<{ nombre: string; neto: number }>): string[] {
  return [...netos].sort((a, b) => a.neto - b.neto).map((n) => n.nombre)
}

describe('escena "anota-todos-ven" (reel 1 del lanzamiento)', () => {
  const [juan, maria, diego, catalina] = escena.jugadores

  it('cada jugador recibe los golpes de SU tee', () => {
    // Las damas desde el rojo (rating y slope de damas): con todos en el blanco
    // el neto de ellas se calculaba con rating de varones.
    expect(teeDeJugador(escena, maria)).toBe('rojo')
    expect(teeDeJugador(escena, catalina)).toBe('rojo')
    expect(escena.catalogo.tees.rojo.genero).toBe('F')
    expect(teeDeJugador(escena, juan)).toBe('blanco')
    expect(teeDeJugador(escena, diego)).toBe('blanco')
    expect(escena.catalogo.tees.blanco.genero).toBe('M')
  })

  it('el que hace el gesto recibe golpe en ese hoyo', () => {
    // Sin golpe en el hoyo 12 el birdie vale un solo golpe neto y el
    // adelantamiento termina en empate: en pantalla no se ve nada.
    const hoyo = escena.catalogo.hoyos[escena.hoyo_del_gesto - 1]
    expect(strokesRecibidosEnHoyo(courseHcp(juan), hoyo.si, 18)).toBe(1)
    expect(escena.golpes_del_gesto).toBeLessThan(hoyo.par) // es birdie o mejor
  })

  it('antes del gesto el líder es Diego y el que anota va segundo', () => {
    const netos = escena.jugadores.map((j) => ({
      nombre: j.nombre,
      neto: netoVsPar(j, escena.hoyos_jugados, j.golpes),
    }))
    expect(orden(netos)).toEqual([
      'Diego Silva',
      'Juan Pérez',
      'María González',
      'Catalina Rojas',
    ])
    // Nadie empatado con el líder: un empate no se lee en el video.
    const [primero, segundo] = [...netos].sort((a, b) => a.neto - b.neto)
    expect(segundo.neto).toBeGreaterThan(primero.neto)
  })

  it('el gesto cambia al líder, y el que anota queda solo primero', () => {
    const conGesto = escena.jugadores.map((j) => {
      const esElQueAnota = j === juan
      const hoyos = esElQueAnota ? [...escena.hoyos_jugados, escena.hoyo_del_gesto] : escena.hoyos_jugados
      const golpes = esElQueAnota ? [...j.golpes, escena.golpes_del_gesto] : j.golpes
      return { nombre: j.nombre, neto: netoVsPar(j, hoyos, golpes) }
    })
    expect(orden(conGesto)[0]).toBe('Juan Pérez')
    const [primero, segundo] = [...conGesto].sort((a, b) => a.neto - b.neto)
    expect(primero.neto).toBeLessThan(segundo.neto)
  })

  it('los hoyos anotados no incluyen el del gesto', () => {
    // Si viniera anotado, la toma no tendría nada que tocar en cámara.
    expect(escena.hoyos_jugados).not.toContain(escena.hoyo_del_gesto)
    for (const j of escena.jugadores) expect(j.golpes.length).toBe(escena.hoyos_jugados.length)
  })
})
