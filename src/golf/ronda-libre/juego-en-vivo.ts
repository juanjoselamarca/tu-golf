/**
 * Lo que la pestaña Juego de una Timba EN VIVO dice con palabras (rediseño C+, aprobado por Juanjo el 18-nov):
 * quién va ganando, en qué está cada tramo de parejas y quién ganó cada hoyo del tramo. Funciones puras.
 *
 * No calculan puntos: leen el `ResultadoJuego` del motor (puntos, marcadores, estados de hoyo) y le ponen nombre.
 */
import { nombreDelPuntito, type PuntitoConfig, type ResultadoHoyoDelJuego } from '@/golf/formats/personalizado'

/** El hoyo tiene al menos un golpe anotado (o ya se puntuó). */
export function hoyoConGolpes(h: Pick<ResultadoHoyoDelJuego, 'estado' | 'scoreDeJuego'>): boolean {
  return h.estado === 'puntuado' || Object.values(h.scoreDeJuego).some(s => typeof s === 'number')
}

/** Quién se llevó el hoyo en el duelo de parejas: la pareja 1 (`a`), la 2 (`b`), empate, o todavía nada. */
export type GanadorDelHoyo = 'a' | 'b' | 'empate' | 'pendiente' | 'sin_jugar'

export function ganadorDelHoyoDeParejas(h: Pick<ResultadoHoyoDelJuego, 'estado' | 'marcadorParejas'>): GanadorDelHoyo {
  if (h.estado === 'sin_jugar') return 'sin_jugar'
  if (h.estado !== 'puntuado' || !h.marcadorParejas) return 'pendiente'
  const [a, b] = h.marcadorParejas
  return a > b ? 'a' : b > a ? 'b' : 'empate'
}

/**
 * Estado de un tramo de parejas. `terminado`: ningún hoyo pendiente. `en_juego`: ya tiene golpes; `quedan` = hoyos
 * sin puntuar. `por_jugar`: nadie anotó nada todavía. `no_se_jugo`: todos sus hoyos quedaron sin jugar.
 */
export type EstadoDelTramo =
  | { tipo: 'por_jugar' }
  | { tipo: 'en_juego'; quedan: number }
  | { tipo: 'terminado' }
  | { tipo: 'no_se_jugo' }

export function estadoDelTramo(hoyos: readonly Pick<ResultadoHoyoDelJuego, 'estado' | 'scoreDeJuego'>[]): EstadoDelTramo {
  if (hoyos.length > 0 && hoyos.every(h => h.estado === 'sin_jugar')) return { tipo: 'no_se_jugo' }
  const cerrados = hoyos.filter(h => h.estado !== 'pendiente').length
  if (cerrados === hoyos.length) return { tipo: 'terminado' }
  if (!hoyos.some(hoyoConGolpes)) return { tipo: 'por_jugar' }
  return { tipo: 'en_juego', quedan: hoyos.length - cerrados }
}

/**
 * Qué tramo va en la tarjeta grande: el del hoyo del scorer si lo hay; si no, el que está en juego; si no, el
 * próximo por jugar; si no, el último (todos terminados). `-1` sin tramos.
 */
export function indiceDelTramoDestacado(estados: readonly EstadoDelTramo[], tramoDelHoyoActual: number | null): number {
  if (estados.length === 0) return -1
  if (tramoDelHoyoActual != null && tramoDelHoyoActual >= 0 && tramoDelHoyoActual < estados.length) return tramoDelHoyoActual
  const enJuego = estados.findIndex(e => e.tipo === 'en_juego')
  if (enJuego >= 0) return enJuego
  const porJugar = estados.findIndex(e => e.tipo === 'por_jugar')
  return porJugar >= 0 ? porJugar : estados.length - 1
}

/**
 * Hoyos de un tramo en orden de juego, en tramos consecutivos: [1..6] → "1–6"; saliendo del 10, el que pasa del 18,
 * [16,17,18,1,2,3] → "16–18 y 1–3" (nunca "16–3", que se lee como 16 a 3 hacia atrás).
 */
export function rangoDeHoyos(hoyos: readonly number[]): string {
  const tramos: number[][] = []
  for (const h of hoyos) {
    const actual = tramos.at(-1)
    if (actual && h === actual.at(-1)! + 1) actual.push(h)
    else tramos.push([h])
  }
  return unirNombres(tramos.map(t => (t.length === 1 ? String(t[0]) : `${t[0]}–${t.at(-1)}`)))
}

/** "Hoyos 7 a 12"; si el tramo pasa del 18 al 1 (salida por el 10), "Hoyos 16–18 y 1–3". */
export function tituloDelTramo(hoyos: readonly number[]): string {
  if (hoyos.length === 0) return ''
  if (hoyos.length === 1) return `Hoyo ${hoyos[0]}`
  const seguidos = hoyos.every((h, i) => i === 0 || h === hoyos[i - 1] + 1)
  return seguidos ? `Hoyos ${hoyos[0]} a ${hoyos[hoyos.length - 1]}` : `Hoyos ${rangoDeHoyos(hoyos)}`
}

const primeraMayuscula = (s: string) => (s ? s[0].toLocaleUpperCase('es-CL') + s.slice(1) : s)

/** Candidatas de etiqueta de un nombre corto, de la más corta a la más larga. */
function candidatas(nombre: string, i: number): string[] {
  const [primero = '', segundo] = nombre.trim().split(/\s+/)
  const out = [primeraMayuscula(primero.slice(0, 1))]
  if (segundo) out.push(primeraMayuscula(primero.slice(0, 1)) + primeraMayuscula(segundo.slice(0, 1)))
  for (let n = 2; n <= Math.min(3, primero.length); n++) out.push(primeraMayuscula(primero.slice(0, n)))
  out.push(`${primeraMayuscula(primero.slice(0, 1)) || 'J'}${i + 1}`)
  return out.filter(Boolean)
}

/**
 * Etiqueta más corta de cada jugador que no se repite con la de otro ("Pancho" y "Pedro" → "Pa" y "Pe"; "Pancho E."
 * y "Pancho R." → "PE" y "PR"). Se arma con TODOS los jugadores de la ronda, así una persona tiene la misma
 * etiqueta en todos los tramos. Las casillas de un tramo juntan las de los dos de la pareja ganadora.
 */
export function etiquetasUnicas(nombres: readonly string[]): string[] {
  const opciones = nombres.map(candidatas)
  const nivel = nombres.map(() => 0)
  const etiqueta = (i: number) => opciones[i][Math.min(nivel[i], opciones[i].length - 1)]
  const clave = (i: number) => etiqueta(i).toLocaleUpperCase('es-CL')
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const repetidos = nombres.map((_, i) => i).filter(i => nombres.some((__, j) => j !== i && clave(j) === clave(i)))
    if (repetidos.length === 0) break
    for (const i of repetidos) nivel[i]++
  }
  return nombres.map((_, i) => etiqueta(i))
}

/**
 * Letra de cada punto especial en la tabla hoyo a hoyo ("G" greenie, "S" sandy); si dos empiezan igual, más letras.
 * Clave = `puntito.id`.
 */
export function letrasDeLosPuntitos(puntitos: readonly Pick<PuntitoConfig, 'id' | 'tipo' | 'nombre'>[]): Record<string, string> {
  const nombres = puntitos.map(p => nombreDelPuntito(p))
  const opciones = nombres.map((n, i) => {
    const limpio = n.replace(/\s+/g, '')
    const out: string[] = []
    for (let k = 1; k <= Math.min(3, limpio.length); k++) out.push(primeraMayuscula(limpio.slice(0, k)))
    out.push(`${primeraMayuscula(limpio.slice(0, 1)) || 'P'}${i + 1}`)
    return out
  })
  const nivel = puntitos.map(() => 0)
  const letra = (i: number) => opciones[i][Math.min(nivel[i], opciones[i].length - 1)]
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const repetidos = puntitos.map((_, i) => i).filter(i => puntitos.some((__, j) => j !== i && letra(j).toUpperCase() === letra(i).toUpperCase()))
    if (repetidos.length === 0) break
    for (const i of repetidos) nivel[i]++
  }
  return Object.fromEntries(puntitos.map((p, i) => [p.id, letra(i)]))
}

/** "Pedro", "Pedro y Juan", "Pedro, Juan y Diego". */
export function unirNombres(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

export interface FraseDelEstado {
  /** "Pancho gana por 1 punto", "Pancho y Cristóbal empatados", "Aún no parten". */
  texto: string
  /** "9 de 18 hoyos · quedan 9" o, antes de partir, "18 hoyos · salen del 1". */
  detalle: string
  /** `false` antes de partir: la frase va en el color del texto, no en oro. */
  empezo: boolean
}

/**
 * Frase de arriba de la pestaña Juego. `ranking` viene ordenado del motor (puesto 1 primero; empatados comparten
 * puesto). Un hoyo que nadie jugó (`sinJugar`) no queda pendiente.
 */
export function fraseDelEstado(args: {
  ranking: readonly { nombre: string; puntos: number; puesto: number }[]
  hoyosPuntuados: number
  hoyosSinJugar: number
  totalHoyos: number
  hayGolpes: boolean
  hoyoDeSalida: number
  /** Ronda cerrada (se ve al abrir "Hoyo a hoyo" desde el resultado final): "ganó", no "gana". */
  cerrada?: boolean
}): FraseDelEstado {
  const { ranking, hoyosPuntuados, hoyosSinJugar, totalHoyos, hayGolpes, hoyoDeSalida, cerrada = false } = args
  if (!hayGolpes && hoyosPuntuados === 0) {
    return { texto: 'Aún no parten', detalle: `${totalHoyos} hoyos · salen del ${hoyoDeSalida}`, empezo: false }
  }
  const quedan = Math.max(0, totalHoyos - hoyosPuntuados - hoyosSinJugar)
  const detalle = `${hoyosPuntuados} de ${totalHoyos} hoyos${quedan > 0 ? ` · quedan ${quedan}` : ''}`
  const lideres = ranking.filter(r => r.puesto === 1)
  if (lideres.length === 0) return { texto: '', detalle, empezo: true }
  if (lideres.length === ranking.length) return { texto: 'Todos empatados', detalle, empezo: true }
  if (lideres.length > 1) return { texto: `${unirNombres(lideres.map(l => l.nombre))} empatados`, detalle, empezo: true }
  const segundo = ranking.find(r => r.puesto !== 1)
  const ventaja = segundo ? lideres[0].puntos - segundo.puntos : 0
  return {
    texto: `${lideres[0].nombre} ${cerrada ? 'ganó' : 'gana'} por ${ventaja} ${ventaja === 1 ? 'punto' : 'puntos'}`,
    detalle,
    empezo: true,
  }
}
