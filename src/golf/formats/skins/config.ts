/**
 * Reglas de un Skins tal como las elige el organizador al crear (spec: docs/specs/formato-skins.md, «Variantes»).
 * Es DATO versionado: se guarda tal cual (ronda libre: `rondas_libres.reglas_juego.config`) y el motor la lee
 * con `opcionesDelMotor`. La cantidad de hoyos no está acá: la manda la ronda.
 */
import { z } from 'zod'
import { HCP_PCT_DEFAULT, esHcpPctValido, type HcpPct } from '../../core/playing-handicap'
import { esHandicapUsable } from '../match-play'
import { PUNTITOS_MANUALES, LIMITES_JUEGO } from '../personalizado/config'
import { MODOS_JUEGO } from '../../core/rules'
import { EMPATES_ULTIMO_HOYO, type OpcionesSkins } from './motor'

/** Clave del formato en `formato_juego`. Fuente única. */
export const FORMATO_SKINS = 'skins' as const
export const NOMBRE_FORMATO_SKINS = 'Skins'

export const VERSION_CONFIG_SKINS = 1

export const LIMITES_SKINS = {
  jugadores: { min: 2 },
  /** Pozo por jugador en pesos chilenos. El techo solo frena un dedo de más (un cero extra). */
  pozoPorJugador: { min: 0, max: 5_000_000 },
  maxEspeciales: LIMITES_JUEGO.maxPuntitos,
  largoNombreEspecial: LIMITES_JUEGO.largoNombrePuntito,
} as const

/**
 * Puntos especiales de un skins: los mismos que se marcan a mano en la Timba (sandy, chipingo, greenie,
 * propios). Valen 1 skin cada uno, así que no llevan valor. El birdie no existe acá: ya gana skins solo.
 */
export const TIPOS_ESPECIAL_SKINS = PUNTITOS_MANUALES as readonly ['sandy', 'chipingo', 'greenie', 'propio']

const especialSchema = z.object({
  /** Identificador estable dentro de la config: las marcas del scorer lo referencian. */
  id: z.string().min(1).max(40),
  tipo: z.enum(TIPOS_ESPECIAL_SKINS),
  nombre: z.string().trim().min(1).max(LIMITES_SKINS.largoNombreEspecial).optional(),
})

export const configSkinsSchema = z.object({
  version: z.literal(VERSION_CONFIG_SKINS),
  modo: z.enum(MODOS_JUEGO),
  /** % del hándicap de juego (WHS 6.2a). Solo cuenta en neto. */
  hcpPct: z.custom<HcpPct>(esHcpPctValido),
  empateUltimoHoyo: z.enum(EMPATES_ULTIMO_HOYO),
  validacion: z.boolean(),
  pozoPorJugador: z.number().int().min(LIMITES_SKINS.pozoPorJugador.min).max(LIMITES_SKINS.pozoPorJugador.max),
  especiales: z.array(especialSchema).max(LIMITES_SKINS.maxEspeciales),
})

export type ConfigSkins = z.infer<typeof configSkinsSchema>
export type EspecialSkins = z.infer<typeof especialSchema>

/** Lo que propone el armado al abrirlo (spec: defaults de la tabla «Variantes»). */
export const CONFIG_SKINS_POR_DEFECTO: ConfigSkins = {
  version: VERSION_CONFIG_SKINS,
  modo: 'neto',
  hcpPct: HCP_PCT_DEFAULT,
  empateUltimoHoyo: 'repartir',
  validacion: false,
  pozoPorJugador: 0,
  especiales: [],
}

export function esFormatoSkins(formato: string | null | undefined): formato is typeof FORMATO_SKINS {
  return formato === FORMATO_SKINS
}

/** Las perillas que usa el motor (el % de hándicap se aplica antes, al calcular cada hándicap de juego). */
export function opcionesDelMotor(c: ConfigSkins): OpcionesSkins {
  return { modo: c.modo, empateUltimoHoyo: c.empateUltimoHoyo, validacion: c.validacion, pozoPorJugador: c.pozoPorJugador }
}

export interface ContextoValidacionSkins {
  /** Nombre y course handicap de cada jugador (`null` si no tiene índice). */
  jugadores: readonly { nombre: string; courseHandicap: number | null }[]
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
    const sinIndice = ctx.jugadores.filter(j => !esHandicapUsable(j.courseHandicap)).map(j => j.nombre)
    if (sinIndice.length) {
      errores.push(
        `${sinIndice.join(', ')} no ${sinIndice.length === 1 ? 'tiene' : 'tienen'} hándicap: el skins neto lo necesita. Juega en gross o agrega su índice.`,
      )
    }
  }

  const ids = new Set<string>()
  for (const e of c.especiales) {
    if (ids.has(e.id)) { errores.push('Hay dos puntos especiales repetidos.'); break }
    ids.add(e.id)
  }
  if (c.especiales.some(e => e.tipo === 'propio' && !e.nombre)) errores.push('Ponle nombre a tu punto especial.')
  const tipos = c.especiales.filter(e => e.tipo !== 'propio').map(e => e.tipo)
  if (new Set(tipos).size !== tipos.length) errores.push('Cada punto especial va una sola vez.')

  return errores.length ? { ok: false, errores } : { ok: true, config: c }
}
