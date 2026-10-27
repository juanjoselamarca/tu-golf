/**
 * Motor de Timba libre (formato `personalizado`). Spec: docs/specs/formato-personalizado.md.
 *
 * Puro: sin I/O. Los puntos NUNCA se guardan: se derivan de golpes + puntos especiales marcados + reglas,
 * así que cambiar las reglas o corregir un score recalcula todo. Todo es entero: la regla de empate única
 * ("los empatados se reparten la suma de sus puestos; si no da entero, nadie se lleva nada") garantiza
 * que nunca aparece un decimal.
 */
import { strokesRecibidosEnHoyo } from '../../core/stableford-score'
import { esHandicapUsable, golpesALaDiferenciaDelMasBajo } from '../match-play'
import {
  COMBINACIONES_DE_4,
  type ConfigJuego,
  type DueloPareja,
  type DueloPorPuesto,
  type Pareja,
  type PuntitoConfig,
  type TipoPuntito,
} from './config'

export interface JugadorDelJuego {
  id: string
  /**
   * Course handicap de la ronda (9 h o 18 h, ya calculado por el canónico). Requerido solo en neto.
   * `null` si el jugador está en `sinIndice` de `courseHandicapsDeRonda`: su CH de índice 0 no es un hándicap.
   */
  courseHandicap: number | null
}

export interface HoyoDelJuego {
  numero: number
  par: number
  /** Stroke index ya normalizado para los hoyos de la ronda (`normalizedStrokeIndexByHole`). */
  strokeIndex: number
}

/** Una marca manual del scorer: "este jugador hizo este punto especial en este hoyo". */
export interface MarcaPuntito {
  jugadorId: string
  hoyo: number
  puntitoId: string
}

export interface EntradaJuego {
  config: ConfigJuego
  /** En el orden de la ronda: índice 0 = A, 1 = B… (las parejas de la config usan estos índices). */
  jugadores: readonly JugadorDelJuego[]
  /** En ORDEN DE JUEGO desde el hoyo de salida (`hoyosDeLaRonda`). La rotación de parejas sigue este orden. */
  hoyos: readonly HoyoDelJuego[]
  /** Golpes por jugador y hoyo: `{ [jugadorId]: { [numeroHoyo]: golpes } }`. */
  scores: Readonly<Record<string, Readonly<Record<number, number | null | undefined>>>>
  marcas: readonly MarcaPuntito[]
  /** Jugador → número del hoyo desde el que se retiró (inclusive, en orden de juego). */
  retiros?: Readonly<Record<string, number>>
  /** Ronda cerrada: un hoyo sin score cuenta como "no jugó" en vez de pendiente. */
  rondaCerrada?: boolean
}

export type EstadoHoyo = 'puntuado' | 'pendiente'

export interface ResultadoDuelo {
  tipo: DueloPorPuesto['tipo'] | DueloPareja['tipo']
  /** Puntos que este duelo le dio a cada jugador (cuenta individual). */
  porJugador: Record<string, number>
  /** Solo en duelos de parejas: lo que sumó cada pareja a su marcador [pareja 1, pareja 2]. */
  porPareja?: [number, number]
}

export interface PuntoEspecialEvaluado {
  jugadorId: string
  puntitoId: string
  tipo: TipoPuntito
  /** Puntos que aporta (0 si no cuenta). Birdie ya multiplicado (eagle 2×, hoyo en uno 3×). */
  puntos: number
  cuenta: boolean
  razon?: string
}

export interface ResultadoHoyoDelJuego {
  numero: number
  /** Posición en el orden de juego (0 = primer hoyo jugado). */
  orden: number
  estado: EstadoHoyo
  /** Índice del tramo de parejas (rotativas: 0..2; fijas: 0; individual: null). */
  tramo: number | null
  parejas: [Pareja, Pareja] | null
  /** Score que compitió: neto o gross; `null` = no jugó (retirado); `undefined` = falta (pendiente). */
  scoreDeJuego: Record<string, number | null | undefined>
  duelos: ResultadoDuelo[]
  especiales: PuntoEspecialEvaluado[]
  /** Total del hoyo por jugador (duelos + especiales). 0 para todos si está pendiente. */
  puntos: Record<string, number>
  /** Marcador del hoyo por pareja (duelos + especiales al marcador). */
  marcadorParejas: [number, number] | null
}

export interface ResultadoTramo {
  indice: number
  parejas: [Pareja, Pareja]
  /** Números de hoyo del tramo, en orden de juego. */
  hoyos: number[]
  marcador: [number, number]
}

export interface PosicionRanking {
  jugadorId: string
  puntos: number
  /** 1 = primero; los empatados comparten puesto. */
  puesto: number
}

export interface ResultadoJuego {
  hoyos: ResultadoHoyoDelJuego[]
  tramos: ResultadoTramo[]
  totales: Record<string, number>
  ranking: PosicionRanking[]
  hoyosPendientes: number[]
  /**
   * En neto: jugadores sin hándicap usable. Si hay alguno, nadie recibe golpes y el juego se calcula
   * como gross; la UI lo avisa con esta lista (no repite el predicado).
   */
  sinHandicap: string[]
}

/** Score de "no jugó": peor que cualquier score, y dos "no jugó" empatan entre sí. */
const NO_JUGO = Number.POSITIVE_INFINITY

/**
 * Regla de empate única. `valores` = valor de cada puesto, del mejor al peor; `scores` = score de cada
 * participante (menor es mejor). Devuelve lo que gana cada participante, siempre entero.
 */
export function repartirPorPuesto(scores: readonly number[], valores: readonly number[]): number[] {
  // Sin restar: Infinity − Infinity = NaN rompería el orden con dos "no jugó".
  const orden = scores.map((s, i) => ({ s, i })).sort((a, b) => (a.s === b.s ? 0 : a.s < b.s ? -1 : 1))
  const resultado = new Array<number>(scores.length).fill(0)
  let k = 0
  while (k < orden.length) {
    let fin = k
    while (fin + 1 < orden.length && orden[fin + 1].s === orden[k].s) fin++
    const cantidad = fin - k + 1
    let suma = 0
    for (let p = k; p <= fin; p++) suma += valores[p] ?? 0
    const cadaUno = suma % cantidad === 0 ? suma / cantidad : 0
    for (let p = k; p <= fin; p++) resultado[orden[p].i] = cadaUno
    k = fin + 1
  }
  return resultado
}

function parejasDelTramo(config: ConfigJuego, orden: number, totalHoyos: number): { tramo: number | null; parejas: [Pareja, Pareja] | null } {
  if (config.unidad === 'individual') return { tramo: null, parejas: null }
  if (config.unidad === 'parejas_fijas') return { tramo: 0, parejas: config.parejas ?? COMBINACIONES_DE_4[0] }
  const largo = Math.max(1, Math.floor(totalHoyos / 3))
  const tramo = Math.min(2, Math.floor(orden / largo))
  const sorteo = config.sorteo ?? [0, 1, 2]
  return { tramo, parejas: COMBINACIONES_DE_4[sorteo[tramo]] }
}

function scoreDeLaPareja(tipo: DueloPareja['tipo'], a: number, b: number): number {
  if (tipo === 'mejor_bola') return Math.min(a, b)
  if (tipo === 'peor_bola') return Math.max(a, b)
  return a + b
}

/**
 * Lo que una pareja se lleva de un duelo. Con `dividir`, si lo ganado no se parte en dos enteros (un empate
 * que dejó un impar), la regla de empate única manda: nadie se lleva nada, ni la pareja ni sus integrantes.
 */
function ganadoPorLaPareja(ganado: number, config: ConfigJuego): number {
  return config.repartoPareja === 'dividir' && ganado % 2 !== 0 ? 0 : ganado
}

/** Lo que suma cada integrante de lo que ganó su pareja (siempre entero: ver `ganadoPorLaPareja`). */
function aCadaIntegrante(puntosPareja: number, config: ConfigJuego): number {
  return config.repartoPareja === 'dividir' ? puntosPareja / 2 : puntosPareja
}

function multiplicadorBirdie(gross: number, par: number): number {
  if (gross === 1) return 3
  if (gross >= par) return 0
  return Math.min(par - gross, 3)
}

const NOMBRE_TIPO: Record<TipoPuntito, string> = {
  birdie: 'birdie',
  sandy: 'sandy',
  chipingo: 'chipingo',
  greenie: 'greenie',
  propio: 'punto',
}

/**
 * Golpes que recibe cada jugador en toda la ronda para el neto del juego (no tocan el índice), en el orden de
 * `jugadores`. Si el hándicap de alguno no es usable, nadie recibe golpes (regla de `esHandicapUsable`; el
 * validador ya bloquea neto sin hándicap al crear el juego).
 */
function golpesDelJuego(config: ConfigJuego, jugadores: readonly JugadorDelJuego[]): number[] {
  const handicaps = jugadores.map(j => j.courseHandicap)
  if (config.modo === 'gross' || !handicaps.every(esHandicapUsable)) return jugadores.map(() => 0)
  return config.handicap === 'diferencia_mas_bajo' ? golpesALaDiferenciaDelMasBajo(handicaps) : handicaps
}

/**
 * Golpes recibidos por jugador y hoyo (`{ [jugadorId]: { [numeroHoyo]: golpes } }`), el mismo reparto que usa
 * `calcularJuegoPersonalizado`. Es lo que el grupo ve de una Timba neto (decisión de Juanjo, 27-oct): la marca
 * de golpe recibido por hoyo, nunca el índice ni el hándicap de juego de otro. En gross, todo 0.
 */
export function golpesRecibidosPorHoyo(
  entrada: Pick<EntradaJuego, 'config' | 'jugadores' | 'hoyos'>,
): Record<string, Record<number, number>> {
  const base = golpesDelJuego(entrada.config, entrada.jugadores)
  const total = entrada.hoyos.length
  return Object.fromEntries(
    entrada.jugadores.map((j, i) => [
      j.id,
      Object.fromEntries(entrada.hoyos.map(h => [h.numero, strokesRecibidosEnHoyo(base[i], h.strokeIndex, total)])),
    ]),
  )
}

export function calcularJuegoPersonalizado(entrada: EntradaJuego): ResultadoJuego {
  const { config, jugadores, hoyos, scores, marcas } = entrada
  const ids = jugadores.map(j => j.id)
  const totalHoyos = hoyos.length
  const ordenDe = new Map(hoyos.map((h, i) => [h.numero, i]))

  const golpesBase = golpesDelJuego(config, jugadores)

  const puntitosActivos = config.puntitos.filter(p => p.activo)
  const puntitoPorId = new Map<string, PuntitoConfig>(puntitosActivos.map(p => [p.id, p]))
  const birdie = puntitosActivos.find(p => p.tipo === 'birdie')

  const totales: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
  const tramos = new Map<number, ResultadoTramo>()
  const resultadoHoyos: ResultadoHoyoDelJuego[] = []
  const pendientes: number[] = []

  const retiradoEn = (id: string, numero: number): boolean => {
    const desde = entrada.retiros?.[id]
    if (desde == null) return false
    const ordenDesde = ordenDe.get(desde)
    const ordenHoyo = ordenDe.get(numero)
    return ordenDesde != null && ordenHoyo != null && ordenHoyo >= ordenDesde
  }

  hoyos.forEach((hoyo, orden) => {
    const { tramo, parejas } = parejasDelTramo(config, orden, totalHoyos)

    // Gross de cada uno: número, `null` = no jugó (retirado o ronda cerrada sin score), `undefined` = falta.
    const gross: Record<string, number | null | undefined> = {}
    ids.forEach(id => {
      const g = scores[id]?.[hoyo.numero]
      if (typeof g === 'number' && Number.isFinite(g) && g > 0) gross[id] = g
      else if (retiradoEn(id, hoyo.numero) || entrada.rondaCerrada) gross[id] = null
      else gross[id] = undefined
    })

    const scoreDeJuego: Record<string, number | null | undefined> = {}
    ids.forEach((id, i) => {
      const g = gross[id]
      scoreDeJuego[id] =
        typeof g === 'number' ? g - strokesRecibidosEnHoyo(golpesBase[i], hoyo.strokeIndex, totalHoyos) : g
    })

    const pendiente = ids.some(id => scoreDeJuego[id] === undefined)
    if (pendiente) {
      pendientes.push(hoyo.numero)
      resultadoHoyos.push({
        numero: hoyo.numero,
        orden,
        estado: 'pendiente',
        tramo,
        parejas,
        scoreDeJuego,
        duelos: [],
        especiales: [],
        puntos: Object.fromEntries(ids.map(id => [id, 0])),
        marcadorParejas: parejas ? [0, 0] : null,
      })
      return
    }

    const numerico = (id: string) => {
      const s = scoreDeJuego[id]
      return typeof s === 'number' ? s : NO_JUGO
    }
    const puntos: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
    const marcador: [number, number] | null = parejas ? [0, 0] : null
    const duelos: ResultadoDuelo[] = []

    for (const duelo of config.duelos) {
      if (duelo.tipo === 'por_puesto') {
        const tabla = duelo.tablas[String(ids.length) as '3' | '4']
        if (!tabla) continue
        const ganado = repartirPorPuesto(ids.map(numerico), tabla)
        const porJugador = Object.fromEntries(ids.map((id, i) => [id, ganado[i]]))
        ids.forEach(id => { puntos[id] += porJugador[id] })
        duelos.push({ tipo: duelo.tipo, porJugador })
        continue
      }
      if (!parejas || !marcador) continue
      const scoresParejas = parejas.map(([a, b]) => scoreDeLaPareja(duelo.tipo, numerico(ids[a]), numerico(ids[b])))
      const ganado = repartirPorPuesto(scoresParejas, [duelo.valor, duelo.perdedorResta ? -duelo.valor : 0]).map(g =>
        ganadoPorLaPareja(g, config),
      )
      const porJugador: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
      parejas.forEach((par, p) => {
        marcador[p] += ganado[p]
        const cadaUno = aCadaIntegrante(ganado[p], config)
        par.forEach(i => {
          porJugador[ids[i]] = cadaUno
          puntos[ids[i]] += cadaUno
        })
      })
      duelos.push({ tipo: duelo.tipo, porJugador, porPareja: [ganado[0], ganado[1]] })
    }

    // Puntos especiales: se evalúan al calcular y nunca borran la marca.
    const especiales: PuntoEspecialEvaluado[] = []
    if (birdie) {
      ids.forEach(id => {
        const g = gross[id]
        if (typeof g !== 'number') return
        const mult = multiplicadorBirdie(g, hoyo.par)
        if (mult > 0) especiales.push({ jugadorId: id, puntitoId: birdie.id, tipo: 'birdie', puntos: birdie.valor * mult, cuenta: true })
      })
    }
    const marcasDelHoyo = marcas.filter(m => m.hoyo === hoyo.numero && puntitoPorId.has(m.puntitoId) && ids.includes(m.jugadorId))
    // Una marca por jugador y punto (la base lo garantiza; acá se defiende igual). El greenie es uno por hoyo:
    // si viene más de uno, vale el último.
    const vistos = new Set<string>()
    // Solo entre quienes jugaron el hoyo: marcar a un retirado no le quita el greenie al que sí lo ganó.
    const ultimoGreenie = [...marcasDelHoyo]
      .reverse()
      .find(m => puntitoPorId.get(m.puntitoId)?.tipo === 'greenie' && typeof gross[m.jugadorId] === 'number')
    for (const marca of marcasDelHoyo) {
      const p = puntitoPorId.get(marca.puntitoId)!
      if (p.tipo === 'birdie') continue
      const clave = `${marca.jugadorId}|${p.id}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      const g = gross[marca.jugadorId]
      const evaluado = (cuenta: boolean, razon?: string): PuntoEspecialEvaluado => ({
        jugadorId: marca.jugadorId,
        puntitoId: p.id,
        tipo: p.tipo,
        puntos: cuenta ? p.valor : 0,
        cuenta,
        razon,
      })
      if (typeof g !== 'number') { especiales.push(evaluado(false, 'No jugó el hoyo')); continue }
      if (p.tipo === 'greenie') {
        if (hoyo.par !== 3) { especiales.push(evaluado(false, 'El greenie es solo en par 3')); continue }
        // Uno por hoyo: el greenie reasignado desaparece (no queda como "no cuenta").
        if (marca.jugadorId !== ultimoGreenie?.jugadorId || marca.puntitoId !== ultimoGreenie?.puntitoId) continue
      }
      if ((p.tipo === 'sandy' || p.tipo === 'greenie') && g > hoyo.par) {
        especiales.push(evaluado(false, `El ${NOMBRE_TIPO[p.tipo]} cuenta solo con par o mejor`))
        continue
      }
      especiales.push(evaluado(true))
    }

    for (const e of especiales) {
      if (!e.cuenta) continue
      puntos[e.jugadorId] += e.puntos
      if (!parejas || !marcador) continue
      const idx = ids.indexOf(e.jugadorId)
      const p = parejas.findIndex(par => par.includes(idx))
      if (p < 0) continue
      marcador[p] += e.puntos
      const destino = puntitoPorId.get(e.puntitoId)?.destino
      if (destino === 'pareja') {
        const companero = parejas[p].find(i => i !== idx)!
        puntos[ids[companero]] += e.puntos
      }
    }

    ids.forEach(id => { totales[id] += puntos[id] })
    if (parejas && marcador && tramo != null) {
      const t = tramos.get(tramo) ?? { indice: tramo, parejas, hoyos: [], marcador: [0, 0] as [number, number] }
      t.marcador = [t.marcador[0] + marcador[0], t.marcador[1] + marcador[1]]
      tramos.set(tramo, t)
    }

    resultadoHoyos.push({
      numero: hoyo.numero,
      orden,
      estado: 'puntuado',
      tramo,
      parejas,
      scoreDeJuego,
      duelos,
      especiales,
      puntos,
      marcadorParejas: marcador,
    })
  })

  // Los tramos listan todos sus hoyos (también los pendientes), en orden de juego.
  resultadoHoyos.forEach(h => {
    if (h.tramo == null || !h.parejas) return
    const t = tramos.get(h.tramo) ?? { indice: h.tramo, parejas: h.parejas, hoyos: [], marcador: [0, 0] as [number, number] }
    t.hoyos.push(h.numero)
    tramos.set(h.tramo, t)
  })

  const ordenados = [...ids].sort((a, b) => totales[b] - totales[a])
  const ranking: PosicionRanking[] = ordenados.map(id => ({
    jugadorId: id,
    puntos: totales[id],
    puesto: 1 + ordenados.filter(o => totales[o] > totales[id]).length,
  }))

  return {
    hoyos: resultadoHoyos,
    tramos: [...tramos.values()].sort((a, b) => a.indice - b.indice),
    totales,
    ranking,
    hoyosPendientes: pendientes,
    sinHandicap: config.modo === 'neto' ? jugadores.filter(j => !esHandicapUsable(j.courseHandicap)).map(j => j.id) : [],
  }
}
