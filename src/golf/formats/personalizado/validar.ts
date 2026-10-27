/**
 * Validador de un juego de Timba libre contra la ronda concreta. Devuelve mensajes humanos (español de Chile)
 * para mostrar tal cual; la API usa el mismo validador para rechazar lo que la UI no debió dejar pasar.
 */
import { esHandicapUsable } from '../match-play'
import { configJuegoSchema, LIMITES_JUEGO, type ConfigJuego } from './config'
import { JUGADORES_POR_PLANTILLA, NOMBRE_PLANTILLA } from './plantillas'

export interface ContextoValidacion {
  /** Nombre y course handicap de cada jugador, en el orden de la ronda (`null` si está en `sinIndice`). */
  jugadores: readonly { nombre: string; courseHandicap: number | null }[]
  cantidadHoyos: number
}

export type ResultadoValidacion =
  | { ok: true; config: ConfigJuego }
  | { ok: false; errores: string[] }

export function validarJuegoPersonalizado(config: unknown, ctx: ContextoValidacion): ResultadoValidacion {
  const parsed = configJuegoSchema.safeParse(config)
  if (!parsed.success) return { ok: false, errores: ['Las reglas del juego no son válidas. Vuelve a armarlo.'] }
  const c = parsed.data
  const errores: string[] = []
  const n = ctx.jugadores.length
  const esParejas = c.unidad !== 'individual'

  const rango = JUGADORES_POR_PLANTILLA[c.plantilla]
  const { min, max } = LIMITES_JUEGO.jugadores
  if (n < min || n > max) errores.push(`Timba libre es para ${min} o ${max} jugadores.`)
  else if (n < rango.min || n > rango.max) {
    errores.push(
      rango.min === rango.max
        ? `${NOMBRE_PLANTILLA[c.plantilla]} es para ${rango.min} jugadores.`
        : `${NOMBRE_PLANTILLA[c.plantilla]} es para ${rango.min} a ${rango.max} jugadores.`,
    )
  } else if (esParejas && n !== 4) errores.push('Los juegos de parejas son para 4 jugadores.')

  if (c.unidad === 'parejas_rotativas') {
    if (ctx.cantidadHoyos % 3 !== 0) errores.push('Las parejas que rotan necesitan una cantidad de hoyos divisible por 3.')
    if (!c.sorteo || new Set(c.sorteo).size !== 3) errores.push('Falta sortear el orden de las parejas.')
  }
  if (c.unidad === 'parejas_fijas') {
    const usados = c.parejas ? c.parejas.flat() : []
    if (!c.parejas || new Set(usados).size !== 4) errores.push('Elige las dos parejas: cada jugador en una sola.')
  }

  for (const d of c.duelos) {
    if (d.tipo === 'por_puesto') {
      if (esParejas) errores.push('El duelo por puesto es para juegos individuales.')
      else if (n >= min && n <= max && !d.tablas[String(n) as '3' | '4']) {
        errores.push(`Falta el valor de cada puesto para ${n} jugadores.`)
      }
    } else {
      if (!esParejas) errores.push('Mejor bola, peor bola y suma son para juegos de parejas.')
      if (c.repartoPareja === 'dividir' && d.valor % 2 !== 0) {
        errores.push('Para dividir los puntos entre la pareja, cada duelo tiene que valer un número par.')
      }
    }
  }

  const activos = c.puntitos.filter(p => p.activo)
  if (c.duelos.length === 0 && activos.length === 0) errores.push('Elige al menos un duelo o un punto especial.')
  const tipos = c.puntitos.filter(p => p.tipo !== 'propio').map(p => p.tipo)
  if (new Set(tipos).size !== tipos.length) errores.push('Cada punto especial puede ir una sola vez.')
  if (new Set(c.puntitos.map(p => p.id)).size !== c.puntitos.length) errores.push('Las reglas del juego no son válidas. Vuelve a armarlo.')
  if (c.puntitos.some(p => p.tipo === 'propio' && !p.nombre)) errores.push('Ponle nombre a tu punto propio.')

  if (c.modo === 'neto') {
    const sinHcp = ctx.jugadores.filter(j => !esHandicapUsable(j.courseHandicap))
    for (const j of sinHcp) errores.push(`Para jugar neto, ${j.nombre} necesita hándicap.`)
  }

  return errores.length > 0 ? { ok: false, errores: [...new Set(errores)] } : { ok: true, config: c }
}
