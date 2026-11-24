/**
 * Reglas de un Skins tal como las elige el organizador al crear (spec: docs/specs/formato-skins.md, «Variantes»).
 * Es DATO versionado: se guarda tal cual (ronda libre: `rondas_libres.reglas_juego.config`) y el motor la lee
 * con `opcionesDelMotor`. La cantidad de hoyos no está acá: la manda la ronda.
 */
import { z } from 'zod'
import { HCP_PCT_DEFAULT, esHcpPctValido, handicapDeJuego, type HcpPct } from '../../core/playing-handicap'
import { esHandicapUsable } from '../match-play'
import { TIPOS_PUNTITO_MANUAL, LIMITES_JUEGO } from '../personalizado/config'
import { MODOS_JUEGO } from '../../core/rules'
import { EMPATES_ULTIMO_HOYO, golpesDelSkins, type HoyoSkins, type OpcionesSkins } from './motor'

export { FORMATO_SKINS, NOMBRE_FORMATO_SKINS, esFormatoSkins } from './clave'

export const VERSION_CONFIG_SKINS = 1

export const LIMITES_SKINS = {
  jugadores: { min: 2 },
  /** Pozo por jugador en pesos chilenos. El techo solo frena un dedo de más (un cero extra). */
  pozoPorJugador: { min: 0, max: 5_000_000 },
  maxPuntitos: LIMITES_JUEGO.maxPuntitos,
  largoNombrePuntito: LIMITES_JUEGO.largoNombrePuntito,
} as const

/**
 * Puntos especiales de un skins: los mismos que se marcan a mano en la Timba (sandy, chipingo, greenie,
 * propios). Valen 1 skin cada uno, así que no llevan valor. El birdie no existe acá: ya gana skins solo.
 * Misma forma {id, tipo, nombre?} y mismo lugar (`config.puntitos`) que en la Timba: la RPC que guarda las marcas
 * (marcar_puntito_ronda_libre) busca el tipo ahí para los dos formatos.
 */
const puntitoSkinsSchema = z.object({
  /** Identificador estable dentro de la config: las marcas del scorer lo referencian. */
  id: z.string().min(1).max(40),
  tipo: z.enum(TIPOS_PUNTITO_MANUAL),
  nombre: z.string().trim().min(1).max(LIMITES_SKINS.largoNombrePuntito).optional(),
})

export const configSkinsSchema = z.object({
  version: z.literal(VERSION_CONFIG_SKINS),
  modo: z.enum(MODOS_JUEGO),
  /** % del hándicap de juego (WHS 6.2a). Solo cuenta en neto. */
  hcpPct: z.custom<HcpPct>(esHcpPctValido),
  empateUltimoHoyo: z.enum(EMPATES_ULTIMO_HOYO),
  validacion: z.boolean(),
  pozoPorJugador: z.number().int().min(LIMITES_SKINS.pozoPorJugador.min).max(LIMITES_SKINS.pozoPorJugador.max),
  puntitos: z.array(puntitoSkinsSchema).max(LIMITES_SKINS.maxPuntitos),
})

export type ConfigSkins = z.infer<typeof configSkinsSchema>
export type PuntitoSkins = z.infer<typeof puntitoSkinsSchema>

/** Lo que propone el armado al abrirlo (spec: defaults de la tabla «Variantes»). */
export const CONFIG_SKINS_POR_DEFECTO: ConfigSkins = {
  version: VERSION_CONFIG_SKINS,
  modo: 'neto',
  hcpPct: HCP_PCT_DEFAULT,
  empateUltimoHoyo: 'repartir',
  validacion: false,
  pozoPorJugador: 0,
  puntitos: [],
}

/** Las perillas que usa el motor (el % de hándicap se aplica antes, al calcular cada hándicap de juego). */
export function opcionesDelMotor(c: ConfigSkins): OpcionesSkins {
  return { modo: c.modo, empateUltimoHoyo: c.empateUltimoHoyo, validacion: c.validacion, pozoPorJugador: c.pozoPorJugador }
}

export interface ContextoValidacionSkins {
  /** Nombre y course handicap de cada jugador (`null` si no tiene índice), en la escala de los hoyos de la ronda. */
  jugadores: readonly { nombre: string; courseHandicap: number | null }[]
  /** Hoyos de la ronda con su SI (normalizado a 1..N). Sin ellos no se pueden revisar los golpes. */
  hoyos: readonly HoyoSkins[]
}

export type ResultadoValidacionSkins =
  | { ok: true; config: ConfigSkins }
  | { ok: false; errores: string[] }

/**
 * Valida las reglas contra la ronda concreta. Mensajes para mostrar tal cual; la API usa el mismo validador
 * para rechazar lo que la pantalla no debió dejar pasar.
 */
export function validarConfigSkins(config: unknown, ctx: ContextoValidacionSkins): ResultadoValidacionSkins {
  const parsed = configSkinsSchema.safeParse(config)
  if (!parsed.success) return { ok: false, errores: ['Las reglas del skins no son válidas. Vuelve a armarlas.'] }
  const c = parsed.data
  const errores: string[] = []

  if (ctx.jugadores.length < LIMITES_SKINS.jugadores.min) errores.push('El skins es para 2 jugadores o más.')

  if (c.modo === 'neto') {
    // Los mismos bloqueos que el motor (una sola regla): lo que la pantalla deja crear, el motor lo puede liquidar.
    const jugadores = ctx.jugadores.map((j, i) => ({
      id: String(i),
      handicapDeJuego: esHandicapUsable(j.courseHandicap) ? handicapDeJuego(j.courseHandicap as number, c.hcpPct) : null,
    }))
    const { bloqueos } = golpesDelSkins({ opciones: opcionesDelMotor(c), jugadores, hoyos: ctx.hoyos })
    for (const i of bloqueos.sinHandicap) {
      errores.push(`${ctx.jugadores[Number(i)].nombre} no tiene hándicap: el skins neto lo necesita. Juega en gross o agrega su índice.`)
    }
    if (bloqueos.indiceDificultadInvalido) {
      errores.push('La cancha no tiene bien los índices de dificultad de estos hoyos. Juega en gross o elige otro recorrido.')
    }
    for (const i of bloqueos.golpesSobreElTope) {
      errores.push(`${ctx.jugadores[Number(i)].nombre} recibe más de 3 golpes por hoyo: baja el % de hándicap o juega en gross.`)
    }
  }
  if (ctx.hoyos.length === 0) errores.push('Elige la cancha y los hoyos antes de armar el skins.')

  const ids = new Set<string>()
  for (const e of c.puntitos) {
    if (ids.has(e.id)) { errores.push('Hay dos puntos especiales repetidos.'); break }
    ids.add(e.id)
  }
  if (c.puntitos.some(e => e.tipo === 'propio' && !e.nombre)) errores.push('Ponle nombre a tu punto especial.')
  const tipos = c.puntitos.filter(e => e.tipo !== 'propio').map(e => e.tipo)
  if (new Set(tipos).size !== tipos.length) errores.push('Cada punto especial va una sola vez.')

  return errores.length ? { ok: false, errores } : { ok: true, config: c }
}
