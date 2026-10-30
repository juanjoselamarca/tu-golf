// La escena de un video de RRSS tiene que contar la historia que dice contar.
//
// Cada reel del lanzamiento muestra UNA cosa: el 1, que alguien anota un birdie y
// el líder cambia en el teléfono de todos; el 2, que el hándicap da vuelta el
// orden entero. Si los brutos sembrados no producen eso, la grabación sale igual
// —el guion tarda 40 segundos y nadie mira fotograma por fotograma— y la pieza
// queda mostrando una app que no hace lo que promete.
//
// Acá se recalcula el leaderboard con el MOTOR de golf, no con la aritmética del
// comentario de la escena: el course handicap sale del tee de cada jugador y los
// golpes por hoyo del stroke index, igual que en el scorer. `escena.mjs` verifica
// contra la base que el catálogo declarado siga siendo el real antes de sembrar.
import { describe, it, expect } from 'vitest'
// Módulo .mjs compartido con los scripts de captura.
import { ESCENAS } from '../../../scripts/rrss/escenas.mjs'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
// El motor se consulta a través del helper compartido: el mismo `courseHcp`
// que usa el test de los subtítulos, para que no haya dos cuentas del mismo
// hándicap.
import {
  type Escena,
  type JugadorDeEscena,
  brutoVsPar,
  courseHcp,
  netoVsPar,
  orden,
  sinEmpates,
} from '@/__tests__/helpers/rrss-escena'

describe('escena "anota-todos-ven" (reel 1 del lanzamiento)', () => {
  const escena = ESCENAS['anota-todos-ven'] as Escena
  const [juan, maria, diego, catalina] = escena.jugadores
  const ch = (j: JugadorDeEscena) => courseHcp(escena, j)
  const neto = (j: JugadorDeEscena, hoyos: number[], golpes: number[]) =>
    netoVsPar(escena, j, hoyos, golpes)

  it('la ronda que se siembra es la que este test sabe recalcular', () => {
    // Lo de abajo recalcula UN board: stroke play neto, 18 hoyos, hándicap
    // completo. Los cuatro campos salen de la escena y van tal cual al insert,
    // así que si alguno cambia hay que cambiar también lo que este archivo
    // modela —en bruto Juan ya lidera por seis golpes y el gesto no adelanta a
    // nadie; en 9 hoyos el motor usa los ratings de ida y el CourseData de acá
    // (slope/rating/par de 18) deja de representarlo.
    expect(escena.modo_juego).toBe('neto')
    expect(escena.formato_juego).toBe('stroke_play')
    expect(escena.holes).toBe(18)
    // `hcp_pct` no se fija: el test se lo pasa al motor, así que cualquier
    // porcentaje queda modelado de verdad.
    expect(escena.hcp_pct).toBeGreaterThan(0)
  })

  it('cada jugador recibe los golpes de SU tee', () => {
    // Las damas desde el rojo (rating y slope de damas): con todos en el blanco
    // el neto de ellas se calculaba con rating de varones.
    expect(escena.catalogo.tees.rojo.genero).toBe('F')
    expect(escena.catalogo.tees.blanco.genero).toBe('M')
    // Los números, no el nombre del tee: afirmar `tee === 'rojo'` repite el dato
    // declarado sin tocar el motor, y además el orden del leaderboard es el
    // mismo con las cuatro desde el blanco, así que ni el video lo delata. Lo
    // que cambia es la columna HCP que se ve en pantalla: María 19 desde el
    // rojo contra 16 desde el blanco, Catalina 34 contra 30.
    expect(ch(juan)).toBe(13)
    expect(ch(maria)).toBe(19)
    expect(ch(diego)).toBe(23)
    expect(ch(catalina)).toBe(34)
  })

  it('el que hace el gesto recibe golpe en ese hoyo', () => {
    // Sin golpe en el hoyo 12 el birdie vale un solo golpe neto y el
    // adelantamiento termina en empate: en pantalla no se ve nada.
    const hoyo = escena.catalogo.hoyos[escena.hoyo_del_gesto! - 1]
    expect(strokesRecibidosEnHoyo(ch(juan), hoyo.si, escena.holes)).toBe(1)
    expect(escena.golpes_del_gesto!).toBeLessThan(hoyo.par) // es birdie o mejor
  })

  it('antes del gesto el líder es Diego y el que anota va segundo', () => {
    const netos = escena.jugadores.map((j) => ({
      nombre: j.nombre,
      neto: neto(j, escena.hoyos_jugados, j.golpes),
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
      const hoyos = esElQueAnota ? [...escena.hoyos_jugados, escena.hoyo_del_gesto!] : escena.hoyos_jugados
      const golpes = esElQueAnota ? [...j.golpes, escena.golpes_del_gesto!] : j.golpes
      return { nombre: j.nombre, neto: neto(j, hoyos, golpes) }
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

describe('escena "cada-uno-su-handicap" (reel 2 del lanzamiento)', () => {
  const escena = ESCENAS['cada-uno-su-handicap'] as Escena
  const ch = (j: JugadorDeEscena) => courseHcp(escena, j)
  const netos = () =>
    escena.jugadores.map((j) => ({
      nombre: j.nombre,
      neto: netoVsPar(escena, j, escena.hoyos_jugados, j.golpes),
    }))
  const brutos = () =>
    escena.jugadores.map((j) => ({
      nombre: j.nombre,
      bruto: brutoVsPar(escena, escena.hoyos_jugados, j.golpes),
    }))

  it('la vuelta está entera: 18 hoyos anotados por los cuatro', () => {
    // El reel no anota nada en cámara: si faltara un hoyo, el board mostraría
    // THRU 17 y la pieza quedaría hablando de una vuelta sin terminar.
    expect(escena.holes).toBe(18)
    expect(escena.hoyos_jugados).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
    for (const j of escena.jugadores) expect(j.golpes.length).toBe(18)
    expect(escena.modo_juego).toBe('neto')
    expect(escena.formato_juego).toBe('stroke_play')
    expect(escena.hcp_pct).toBeGreaterThan(0)
  })

  it('cada uno recibe los golpes de SU tee — la columna HCP de la pieza', () => {
    const [juan, maria, diego, catalina] = escena.jugadores
    expect(ch(juan)).toBe(13)
    expect(ch(maria)).toBe(19)
    expect(ch(diego)).toBe(23)
    expect(ch(catalina)).toBe(34)
  })

  it('el neto da vuelta el orden entero del bruto', () => {
    // Es LA afirmación de la pieza. Si el orden deja de invertirse —se corrige un
    // golpe en la revisión— el video ya no muestra lo que el caption promete.
    expect(orden(netos())).toEqual([
      'Catalina Rojas',
      'Juan Pérez',
      'Diego Silva',
      'María González',
    ])
    expect([...brutos()].sort((a, b) => a.bruto - b.bruto).map((b) => b.nombre)).toEqual([
      'Juan Pérez',
      'María González',
      'Diego Silva',
      'Catalina Rojas',
    ])
    sinEmpates(netos().map((n) => n.neto))
    sinEmpates(brutos().map((b) => b.bruto))
  })

  it('la que gana el neto es la del PEOR bruto, y el mejor bruto no gana', () => {
    const porNeto = [...netos()].sort((a, b) => a.neto - b.neto)
    const porBruto = [...brutos()].sort((a, b) => a.bruto - b.bruto)
    expect(porNeto[0].nombre).toBe(porBruto[porBruto.length - 1].nombre)
    expect(porNeto[0].nombre).not.toBe(porBruto[0].nombre)
  })

  it('la fila cuadra en pantalla: hándicap + neto = bruto', () => {
    // La fila del board muestra los TRES números juntos (HCP 34 · −1 · +33) y el
    // público los resta de memoria. Por esto la pieza no usa el board del torneo,
    // donde la columna HCP muestra el índice (27) y la cuenta no cierra.
    for (const j of escena.jugadores) {
      const neto = netoVsPar(escena, j, escena.hoyos_jugados, j.golpes)
      const bruto = brutoVsPar(escena, escena.hoyos_jugados, j.golpes)
      expect(ch(j) + neto, `la fila de ${j.nombre} no cuadra`).toBe(bruto)
    }
  })

  it('el gesto abre tarjetas que existen, y la primera es la del líder neto', () => {
    const nombres = escena.jugadores.map((j) => j.nombre)
    expect(escena.tarjetas_del_gesto?.length).toBe(2)
    for (const nombre of escena.tarjetas_del_gesto ?? []) expect(nombres).toContain(nombre)
    expect(escena.tarjetas_del_gesto?.[0]).toBe(orden(netos())[0])
  })
})

// Lo que se siembra en la base lo arma `asegurarCancha` (`scripts/rrss/escena.mjs`)
// a partir de este mismo catálogo, así que el catálogo tiene que sostener UN par
// por cancha. Hasta hoy el par de la fila salía de `cat.tees[escena.tee]?.par ?? 72`:
// la pieza 3 no declara `tee` —no hay jugadores, solo se crea el torneo— y sembraba
// 72 de fábrica; una escena de 9 hoyos hubiera sembrado 72 igual, sin ruido, y el
// neto se habría calculado contra un par que no es el de la cancha. Ahora el par se
// suma de los hoyos, y acá se exige que los tees digan lo mismo: si la escena
// declara dos pares distintos para la misma cancha, nadie puede saber cuál muestra
// el video.
describe('el catálogo de cada escena sostiene un solo par por cancha', () => {
  // Solo el catálogo y el tee: la pieza 3 no declara jugadores ni modo de juego
  // —la toma crea el torneo, nadie juega— así que pedir la `Escena` entera dejaría
  // afuera justo a la escena que trajo el bug del par de fábrica.
  type EscenaDeCatalogo = Pick<Escena, 'catalogo'> & { tee?: string }
  const todas = Object.entries(ESCENAS as Record<string, EscenaDeCatalogo>)

  it('hay escenas para revisar', () => {
    expect(todas.length).toBeGreaterThan(0)
  })

  for (const [codigo, escena] of todas) {
    describe(codigo, () => {
      const cat = escena.catalogo

      it('declara todos sus hoyos con par y stroke index numéricos', () => {
        expect(cat.hoyos.length).toBeGreaterThan(0)
        cat.hoyos.forEach((h, i) => {
          expect(typeof h.par, `hoyo ${i + 1}: par ${h.par}`).toBe('number')
          expect(typeof h.si, `hoyo ${i + 1}: SI ${h.si}`).toBe('number')
        })
      })

      // Un stroke index que no es permutación de 1..N reparte los golpes mal y el
      // neto del reel deja de ser el neto de la app (`strokesRecibidosEnHoyo`).
      it('los stroke index son la permutación 1..N', () => {
        expect([...cat.hoyos.map((h) => h.si)].sort((a, b) => a - b)).toEqual(
          cat.hoyos.map((_, i) => i + 1),
        )
      })

      it('cada tee declara el mismo par que suman los hoyos', () => {
        const suma = cat.hoyos.reduce((t, h) => t + h.par, 0)
        for (const [nombre, t] of Object.entries(cat.tees))
          expect(t.par, `tee ${nombre}`).toBe(suma)
      })

      it('el tee que la escena juega está en su catálogo', () => {
        if (!escena.tee) return // la pieza 3 no tiene jugadores: nadie juega un tee
        expect(Object.keys(cat.tees)).toContain(escena.tee)
      })
    })
  }
})
