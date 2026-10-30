/**
 * The Lakes Barceló (Punta Cana) — se juega una ronda completa en CADA modalidad
 * sobre la cancha que carga `20261030120000_cancha_the_lakes_barcelo.sql`.
 *
 * Por qué este test existe y no alcanza con los canarios del catálogo
 * ------------------------------------------------------------------
 * Una cancha nueva puede entrar al catálogo con todos sus números dentro de los
 * CHECK de la base y aun así repartir handicaps absurdos: lo que importa no es
 * que el dato sea válido, es que el MOTOR lo acepte y produzca lo mismo en las
 * seis modalidades. Acá se juega de verdad.
 *
 * El fixture NO está tipeado a mano: se PARSEA del archivo de migración. Si
 * alguien edita el SQL, el test juega con los números nuevos y falla donde
 * corresponda. Un fixture copiado a mano se habría quedado describiendo una
 * cancha que ya no es la que está en prod.
 *
 * El caso que este test protege de verdad: Barceló y GolfPass publican el pareo
 * tee↔rating cruzado (dorado 6.200 yds con CR 68.0 y azul 5.737 yds con CR
 * 70.3). Con ese pareo cada número sigue siendo creíble por separado, así que
 * `catalogo-rating-canary` lo deja pasar — pero el course handicap deja de
 * ordenarse por largo de tee. El test de monotonía de más abajo es lo que falla
 * si alguien "corrige" la migración de vuelta a lo publicado.
 *
 * Read-only y sin red: lee un archivo del repo y corre el motor.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolverCourseHandicap,
  courseHandicapDeLaCancha,
  ratingsDe9DelTee,
} from '@/golf/core/course-handicap'
import { calcularResumenRonda, strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import {
  calcularMatchPlay,
  calcularBestBall,
  calcularScramble,
  calcularFoursome,
  KNOWN_FORMAT_KEYS,
} from '@/golf/formats'
import type { BestBallTeam, ScrambleTeam, FoursomeTeam } from '@/golf/formats'
import { evaluarAptitudTorneo } from '@/golf/courses/aptitud-torneo'
import { TOLERANCIA_RATING_9H, TOLERANCIA_RATING_18H } from '@/golf/courses/rating-coherente'

// ─── El fixture sale de la migración, no de la memoria de quien escribe ───

const MIGRACION = join(process.cwd(), 'supabase/migrations/20261030120000_cancha_the_lakes_barcelo.sql')
const sql = readFileSync(MIGRACION, 'utf8')

interface Hole {
  numero: number
  par: number
  stroke_index: number
}
interface Tee {
  nombre: string
  yardaje: number
  rating: number
  slope: number
}

/** Las filas `( 1, 4, 17, 338, 310, 285, 250)` del INSERT de course_holes. */
function parsearHoyos(texto: string): Hole[] {
  const marca = 'AS v(numero, par, si, negras, azul, blanco, rojo)'
  const bloque = texto.slice(0, texto.indexOf(marca))
  const fila = /\(\s*(\d{1,2})\s*,\s*(\d)\s*,\s*(\d{1,2})\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g
  return [...bloque.matchAll(fila)].map((m) => ({
    numero: Number(m[1]),
    par: Number(m[2]),
    stroke_index: Number(m[3]),
  }))
}

/** Las filas `('negras', 6655, 72.1, 135)` del INSERT de course_tees. */
function parsearTees(texto: string): Tee[] {
  const marca = 'AS v(nombre, yardaje, rating, slope)'
  const bloque = texto.slice(0, texto.indexOf(marca))
  const fila = /\('(\w+)',\s*(\d{4}),\s*(\d{2}\.\d),\s*(\d{3})\)/g
  return [...bloque.matchAll(fila)].map((m) => ({
    nombre: m[1],
    yardaje: Number(m[2]),
    rating: Number(m[3]),
    slope: Number(m[4]),
  }))
}

const HOYOS = parsearHoyos(sql)
const TEES = parsearTees(sql)
const PAR_TOTAL = HOYOS.reduce((s, h) => s + h.par, 0)

function teeDe(nombre: string): Tee {
  const t = TEES.find((x) => x.nombre === nombre)
  if (!t) throw new Error(`La migración ya no trae el tee "${nombre}"`)
  return t
}
const canchaDelTee = (t: Tee) => ({ slope: t.slope, courseRating: t.rating, par: PAR_TOTAL })

/** Tarjeta de 18 hoyos como un `Record<"1".."18", golpes>`. */
function rondaDe(golpes: number[]): Record<string, number> {
  if (golpes.length !== 18) throw new Error('una tarjeta son 18 hoyos')
  return Object.fromEntries(golpes.map((g, i) => [String(i + 1), g]))
}

// Tarjetas fijas para que los totales sean verificables a mano.
const TARJETA_A = rondaDe([5, 3, 6, 6, 4, 6, 5, 4, 4, 5, 4, 3, 6, 4, 4, 6, 6, 5]) // 86
const TARJETA_B = rondaDe([4, 4, 5, 5, 5, 5, 4, 5, 3, 4, 5, 4, 5, 3, 5, 5, 5, 4]) // 81
const TARJETA_EQUIPO = rondaDe([4, 3, 5, 5, 4, 5, 4, 4, 3, 4, 4, 3, 5, 3, 4, 5, 4, 4]) // 73

const TOTAL_A = Object.values(TARJETA_A).reduce((s, g) => s + g, 0)
const TOTAL_B = Object.values(TARJETA_B).reduce((s, g) => s + g, 0)
const TOTAL_EQUIPO = Object.values(TARJETA_EQUIPO).reduce((s, g) => s + g, 0)

describe('The Lakes Barceló — el dato de la migración', () => {
  it('trae los 18 hoyos, par 72 y 36 por vuelta', () => {
    expect(HOYOS).toHaveLength(18)
    expect(PAR_TOTAL).toBe(72)
    expect(HOYOS.filter((h) => h.numero <= 9).reduce((s, h) => s + h.par, 0)).toBe(36)
    expect(HOYOS.filter((h) => h.numero >= 10).reduce((s, h) => s + h.par, 0)).toBe(36)
    expect(HOYOS.every((h) => [3, 4, 5].includes(h.par))).toBe(true)
  })

  it('la ventaja es una permutación de 1 a 18 (si no, el neto reparte golpes de más o de menos)', () => {
    expect([...HOYOS.map((h) => h.stroke_index)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    )
  })

  it('trae los 5 tees con rating y slope dentro de los CHECK de la base', () => {
    expect(TEES.map((t) => t.nombre)).toEqual(['negras', 'dorado', 'azul', 'blanco', 'rojo'])
    expect(TEES.every((t) => t.rating >= 50 && t.rating <= 85)).toBe(true)
    expect(TEES.every((t) => t.slope >= 55 && t.slope <= 155)).toBe(true)
  })

  it('los nombres de tee son los del catálogo: `resolvePlayerTee` matchea por nombre exacto', () => {
    // 'negro' en vez de 'negras', o 'dorada' en vez de 'dorado', deja al jugador
    // sin tee y lo manda al eslabón de abajo del fallback chain en silencio.
    const DEL_CATALOGO = new Set(['negras', 'dorado', 'azul', 'blanco', 'rojo'])
    for (const t of TEES) expect(DEL_CATALOGO.has(t.nombre), t.nombre).toBe(true)
  })
})

describe('The Lakes Barceló — el motor le cree al rating', () => {
  const comoCancha = (t: Tee) => ({
    par_total: PAR_TOTAL,
    course_rating: t.rating,
    slope_rating: t.slope,
    tees: TEES.map((x) => ({ rating: x.rating })),
  })

  it('la cancha es apta para un torneo de 18 hoyos', () => {
    const veredicto = evaluarAptitudTorneo(comoCancha(teeDe('azul')), 18)
    expect(veredicto.apta).toBe(true)
    expect(veredicto.motivo).toBeNull()
  })

  it('el tee rojo es el |CR − par| más grande de ESTA cancha y entra con 1.0 de aire', () => {
    // El rojo (CR 63.0 contra par 72) queda en delta 9.0 contra una tolerancia
    // de 10, y 4.5 contra 5 en la vuelta de 9 derivada. Según el barrido del
    // 30-oct-2026 ese 9.0 es además el peor caso legítimo de TODO el catálogo,
    // pero eso lo afirma la cabecera de `rating-coherente.ts`, no este test: acá
    // sólo se mide esta cancha, porque el test es read-only y no consulta la base.
    //
    // Si alguien baja esas tolerancias, el rojo se marca ROTO y su jugador baja
    // un eslabón sin ningún síntoma: recibe el `course_rating` de la tabla
    // `courses` (68.0, el del azul), o sea el course handicap del tee medio desde
    // el tee más adelantado. Por eso el test lee las constantes reales en vez de
    // repetir los números.
    const rojo = teeDe('rojo')
    const delta18 = Math.abs(rojo.rating - PAR_TOTAL)
    const delta9 = Math.abs(rojo.rating / 2 - PAR_TOTAL / 2)

    expect(delta18).toBeCloseTo(9.0, 10)
    expect(delta9).toBeCloseTo(4.5, 10)
    expect(delta18, 'el rojo cayó fuera de tolerancia a 18 hoyos').toBeLessThanOrEqual(
      TOLERANCIA_RATING_18H,
    )
    expect(delta9, 'el rojo cayó fuera de tolerancia a 9 hoyos').toBeLessThanOrEqual(
      TOLERANCIA_RATING_9H,
    )

    // Y que ningún OTRO tee de la cancha lo supere: si una edición futura del
    // SQL moviera un rating, el peor caso dejaría de ser el que dice la cabecera.
    for (const t of TEES) {
      expect(Math.abs(t.rating - PAR_TOTAL), `tee ${t.nombre}`).toBeLessThanOrEqual(delta18)
    }
  })

  it('NINGÚN tee cae al camino seguro: la fórmula WHS corre de verdad en los cinco', () => {
    // `courseHandicapDeLaCancha` devuelve null cuando el rating no es creíble.
    // Un null acá significa que ese tee reparte el índice crudo y nadie se enteró.
    for (const t of TEES) {
      expect(courseHandicapDeLaCancha(15, canchaDelTee(t)), `tee ${t.nombre}`).not.toBeNull()
    }
  })

  it('una vuelta de 9 también sale calculada: el motor parte el rating de 18 en dos', () => {
    // `front_*` / `back_*` quedan NULL (el resort no publica rating de 9) y eso
    // NO bloquea la vuelta corta: `ratingsDe9DelTee` reconoce el rating como de
    // 18 y lo escala, con slope9 ≈ slope18. Este test existe porque el
    // comentario de la migración afirmaba lo contrario y estaba equivocado.
    expect(evaluarAptitudTorneo(comoCancha(teeDe('azul')), 9).apta).toBe(true)

    const PAR_9 = 36
    const porLargo = [...TEES].sort((a, b) => b.yardaje - a.yardaje)
    const hcps9 = porLargo.map((t) => {
      const { courseRating, slope } = ratingsDe9DelTee(
        { rating: t.rating, slope: t.slope, front_course_rating: null, front_slope_rating: null },
        PAR_TOTAL,
      )
      expect(courseRating, `tee ${t.nombre}`).toBeCloseTo(t.rating / 2, 10)

      // Ningún tee cae al camino seguro (índice / 2) en la vuelta de 9 tampoco.
      const ch9 = courseHandicapDeLaCancha(15, { slope, courseRating, par: PAR_9 }, 9)
      expect(ch9, `tee ${t.nombre} a 9 hoyos`).not.toBeNull()

      // Y reparte cerca de la mitad de los golpes de 18, nunca el doble: el bug
      // de `is9Hole` leído dos veces daba exactamente eso.
      const ch18 = courseHandicapDeLaCancha(15, canchaDelTee(t), 18)
      expect(ch9!, `tee ${t.nombre}`).toBeLessThan(ch18!)
      expect(ch9!, `tee ${t.nombre}`).toBeGreaterThanOrEqual(Math.floor(ch18! / 2) - 1)
      return ch9!
    })

    // La monotonía por largo de tee se sostiene a 9 hoyos igual que a 18.
    for (let i = 1; i < hcps9.length; i++) {
      expect(hcps9[i], `9h: ${porLargo[i].nombre} vs ${porLargo[i - 1].nombre}`).toBeLessThanOrEqual(
        hcps9[i - 1],
      )
    }
  })

  it('el course handicap baja a medida que el tee se acorta (el pareo publicado falla acá)', () => {
    // ESTE es el test del bug: con dorado en CR 68.0 y azul en CR 70.3 (lo que
    // publican Barceló y GolfPass), el jugador de dorado recibe MENOS golpes que
    // el de azul desde un tee 463 yardas más largo.
    const porLargo = [...TEES].sort((a, b) => b.yardaje - a.yardaje)
    const hcps = porLargo.map((t) => resolverCourseHandicap(15, canchaDelTee(t)))
    for (let i = 1; i < hcps.length; i++) {
      expect(hcps[i], `${porLargo[i].nombre} vs ${porLargo[i - 1].nombre}`).toBeLessThanOrEqual(
        hcps[i - 1],
      )
    }
    expect(hcps[0]).toBeGreaterThan(hcps[hcps.length - 1])
  })

  it('los golpes repartidos suman EXACTO el course handicap, en los cinco tees', () => {
    for (const t of TEES) {
      const ch = resolverCourseHandicap(15, canchaDelTee(t))
      const repartidos = HOYOS.reduce(
        (s, h) => s + strokesRecibidosEnHoyo(ch, h.stroke_index, 18),
        0,
      )
      expect(repartidos, `tee ${t.nombre} (ch ${ch})`).toBe(ch)
    }
  })
})

describe('The Lakes Barceló — se juega una ronda en cada modalidad', () => {
  const chA = resolverCourseHandicap(18.2, canchaDelTee(teeDe('negras')))
  const chB = resolverCourseHandicap(9.4, canchaDelTee(teeDe('blanco')))

  it('las seis modalidades del registry quedan cubiertas por este suite', () => {
    expect([...KNOWN_FORMAT_KEYS].sort()).toEqual([
      'best_ball',
      'foursome',
      'match_play',
      'scramble',
      'stableford',
      'stroke_play',
    ])
  })

  it('stroke play: gross, neto y vs par cuadran', () => {
    const r = calcularResumenRonda(TARJETA_A, HOYOS, chA, PAR_TOTAL, 18)
    expect(r.holesPlayed).toBe(18)
    expect(r.totalGross).toBe(TOTAL_A)
    expect(r.parJugado).toBe(72)
    expect(r.overUnderGross).toBe(TOTAL_A - 72)
    expect(r.totalNeto).toBe(TOTAL_A - chA)
    expect(r.overUnderNeto).toBe(TOTAL_A - chA - 72)
  })

  it('stroke play desde un tee más corto: el mismo score da un neto distinto', () => {
    // Es lo que se pierde si el rating de un tee miente: los tees dejan de
    // diferenciarse y todos juegan como si la cancha fuera neutra.
    const desdeNegras = calcularResumenRonda(TARJETA_A, HOYOS, chA, PAR_TOTAL, 18)
    const desdeBlanco = calcularResumenRonda(TARJETA_A, HOYOS, chB, PAR_TOTAL, 18)
    expect(desdeNegras.totalNeto).toBeLessThan(desdeBlanco.totalNeto)
  })

  it('stableford: los puntos salen del neto hoyo a hoyo, no de un total aparte', () => {
    const r = calcularResumenRonda(TARJETA_A, HOYOS, chA, PAR_TOTAL, 18)
    const aMano = r.hoyos.reduce((s, h) => s + h.puntosStableford, 0)
    expect(r.totalStableford).toBe(aMano)
    // Un jugador que embolsa su handicap justo ronda los 36 puntos.
    expect(r.totalStableford).toBeGreaterThanOrEqual(20)
    expect(r.totalStableford).toBeLessThanOrEqual(50)
  })

  it('match play: se juegan los 18 hoyos y el conteo del motor cuadra con sus propios hoyos', () => {
    const m = calcularMatchPlay(TARJETA_A, TARJETA_B, HOYOS, {
      courseHandicapA: chA,
      courseHandicapB: chB,
      totalHoles: 18,
      modo: 'neto',
    })
    expect(m.holes).toHaveLength(18)
    const ganadosA = m.holes.filter((h) => h.result === 'won_a').length
    const ganadosB = m.holes.filter((h) => h.result === 'won_b').length
    const empatados = m.holes.filter((h) => h.result === 'halved').length
    expect(m.holesWonA).toBe(ganadosA)
    expect(m.holesWonB).toBe(ganadosB)
    expect(m.holesHalved).toBe(empatados)
    expect(m.state).toBe(ganadosA - ganadosB)
    expect(m.display).toBeTruthy()
    // Un match decidido antes del 18 es un match TERMINADO, no abandonado.
    if (m.isFinished) expect(m.winner).not.toBeNull()
  })

  it('match play en gross ignora el handicap: el tee del jugador deja de importar', () => {
    const conTees = calcularMatchPlay(TARJETA_A, TARJETA_B, HOYOS, {
      courseHandicapA: chA,
      courseHandicapB: chB,
      totalHoles: 18,
      modo: 'gross',
    })
    const sinTees = calcularMatchPlay(TARJETA_A, TARJETA_B, HOYOS, {
      courseHandicapA: 0,
      courseHandicapB: 0,
      totalHoles: 18,
      modo: 'gross',
    })
    expect(conTees.holes.map((h) => h.result)).toEqual(sinTees.holes.map((h) => h.result))
    expect(conTees.display).toBe(sinTees.display)
  })

  it('best ball: por hoyo cuenta el mejor de los dos', () => {
    const equipo: BestBallTeam = {
      id: 'e1',
      nombre: 'Los Lagos',
      jugadores: [
        { id: 'a', nombre: 'A', handicapIndex: chA, scores: TARJETA_A },
        { id: 'b', nombre: 'B', handicapIndex: chB, scores: TARJETA_B },
      ],
    }
    const r = calcularBestBall(equipo, HOYOS, PAR_TOTAL)
    expect(r.holesPlayed).toBe(18)
    // El gross del equipo nunca puede ser peor que el mejor de sus jugadores.
    expect(r.totalGross).toBeLessThanOrEqual(Math.min(TOTAL_A, TOTAL_B))
    expect(r.totalNeto).toBeLessThanOrEqual(r.totalGross)
    // Y por hoyo, el gross del equipo es exactamente el menor de los dos.
    for (const h of r.holes) {
      const esperado = Math.min(TARJETA_A[String(h.numero)], TARJETA_B[String(h.numero)])
      expect(h.teamGross, `hoyo ${h.numero}`).toBe(esperado)
    }
  })

  it('scramble: una bola por equipo con el handicap del equipo', () => {
    const equipo: ScrambleTeam = {
      id: 'e1',
      nombre: 'Los Lagos',
      scores: TARJETA_EQUIPO,
      teamHandicap: 7,
      teamHandicapJuego: 7,
    }
    const r = calcularScramble(equipo, HOYOS, PAR_TOTAL)
    expect(r.holesPlayed).toBe(18)
    expect(r.totalGross).toBe(TOTAL_EQUIPO)
    expect(r.totalNeto).toBe(TOTAL_EQUIPO - 7)
    expect(r.overUnderGross).toBe(TOTAL_EQUIPO - 72)
    expect(r.teamHandicap).toBe(7)
  })

  it('foursome: tiros alternados, misma aritmética de equipo', () => {
    const equipo: FoursomeTeam = {
      id: 'e1',
      nombre: 'Los Lagos',
      nombreA: 'A',
      nombreB: 'B',
      scores: TARJETA_EQUIPO,
      teamHandicap: 12,
      teamHandicapJuego: 12,
    }
    const r = calcularFoursome(equipo, HOYOS, PAR_TOTAL)
    expect(r.holesPlayed).toBe(18)
    expect(r.totalGross).toBe(TOTAL_EQUIPO)
    expect(r.totalNeto).toBe(TOTAL_EQUIPO - 12)
  })

  it('ronda a medias: el vs par mira sólo los hoyos jugados, no castiga los 9 que faltan', () => {
    const nueve = Object.fromEntries(
      Object.entries(TARJETA_A).filter(([k]) => Number(k) <= 9),
    )
    const grossNueve = Object.values(nueve).reduce((s, g) => s + g, 0)
    const r = calcularResumenRonda(nueve, HOYOS, chA, PAR_TOTAL, 18)
    expect(r.holesPlayed).toBe(9)
    expect(r.parJugado).toBe(36)
    expect(r.parTotalRonda).toBe(72)
    expect(r.overUnderGross).toBe(grossNueve - 36)
  })
})
