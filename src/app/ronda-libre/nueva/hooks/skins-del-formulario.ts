/**
 * Skins en el asistente de Nueva Ronda (funciones puras): qué se envía y qué frena la creación. Valida con el MISMO
 * validador que la API (`validarConfigSkins`, vía `problemasDeLaRondaDelSkins` + el contexto de
 * `contextoSkinsDeRondaNueva`): si pasa acá, pasa allá.
 */
import type { ModoJuego } from '@/golf/core/rules'
import {
  CONFIG_SKINS_POR_DEFECTO, LIMITES_SKINS, leerPozoEscrito, validarConfigSkins, type ConfigSkins,
  type ContextoValidacionSkins,
} from '@/golf/formats/skins'
import { TITULO_REVISA_EL_SKINS, problemasDeLaRondaDelSkins } from '@/golf/ronda-libre/skins-de-ronda-nueva'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'

/** Lo que propone el armado al abrirlo: los defaults del spec («Variantes»), con el % de hándicap en 100. */
export function skinsPorDefecto(): ConfigSkins {
  return { ...CONFIG_SKINS_POR_DEFECTO, puntitos: [] }
}

/** El skins juega en el modo de la ronda: un solo modo, el del selector Neto | Gross. */
export function configSkinsParaEnviar(config: ConfigSkins, modo: ModoJuego): ConfigSkins {
  return { ...config, modo }
}

/**
 * Pozo escrito → config. Un monto que no es monto (letras, decimales) o pasa el techo deja la config como estaba: la
 * tecla no entra. Vacío = 0 (sin plata). `sobreElTope`: se rechazó por pasar el máximo (la pantalla lo dice).
 */
export function conPozoEscrito(config: ConfigSkins, texto: string): { config: ConfigSkins; sobreElTope: boolean } {
  const monto = leerPozoEscrito(texto)
  if (monto == null) return { config, sobreElTope: false }
  if (monto > LIMITES_SKINS.pozoPorJugador.max) return { config, sobreElTope: true }
  return { config: { ...config, pozoPorJugador: monto }, sobreElTope: false }
}

/** Estado del contexto (CH y SI) que se carga de la base para validar. */
export type ContextoDelSkins =
  | { estado: 'cargando' }
  /** `mensaje`: qué falló, en el idioma de la pantalla (la señal o un dato de la cancha). */
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; contexto: ContextoValidacionSkins }

export const PROBLEMA_SKINS_CARGANDO: ProblemaDeLaRonda = {
  titulo: 'Calculando golpes',
  detalle: 'Estamos leyendo la cancha para revisar el skins.',
}

/**
 * Lo que frena crear la ronda con este skins, o `null`. Mismo orden que la API: lo de la ronda (un celular, cancha,
 * hoyos), después las reglas contra los jugadores y los hoyos. Con los nombres que se ven ahora (el contexto se
 * carga por índice y tee; los nombres se escriben después sin volver a leer la base).
 */
export function problemaDelSkins(args: {
  config: ConfigSkins
  modo: ModoJuego
  adminMode: boolean
  courseId: string | null
  holes: number
  nombres: readonly string[]
  contexto: ContextoDelSkins
}): ProblemaDeLaRonda | null {
  const previos = problemasDeLaRondaDelSkins(args)
  if (previos.length > 0) return { titulo: TITULO_REVISA_EL_SKINS, detalle: previos.join(' '), esError: true }
  if (args.contexto.estado === 'cargando') return PROBLEMA_SKINS_CARGANDO
  if (args.contexto.estado === 'error') return { titulo: TITULO_REVISA_EL_SKINS, detalle: args.contexto.mensaje, esError: true }

  const { contexto } = args.contexto
  // El contexto es de otra lista de jugadores (se está recargando): no se valida con datos de otros.
  if (contexto.jugadores.length !== args.nombres.length) return PROBLEMA_SKINS_CARGANDO
  const r = validarConfigSkins(configSkinsParaEnviar(args.config, args.modo), {
    ...contexto,
    jugadores: contexto.jugadores.map((j, i) => ({ ...j, nombre: args.nombres[i].trim() })),
  })
  return r.ok ? null : { titulo: TITULO_REVISA_EL_SKINS, detalle: r.errores.join(' '), esError: true }
}
