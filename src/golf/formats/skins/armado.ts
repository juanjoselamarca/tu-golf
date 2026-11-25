/**
 * Armado de un Skins en el asistente (funciones puras sobre `ConfigSkins`). Spec: docs/specs/formato-skins.md,
 * «Variantes» y «Puntos especiales».
 */
import { PUNTITOS_DEL_CATALOGO, type PuntitoDelCatalogo } from '../personalizado/armado'
import type { ConfigSkins } from './config'

/** Puntos especiales que se ofrecen en un skins: los del catálogo de la Timba menos el birdie (ya gana skins solo). */
export type PuntitoSkinsDelCatalogo = Exclude<PuntitoDelCatalogo, 'birdie'>
export const PUNTITOS_DEL_CATALOGO_SKINS: readonly PuntitoSkinsDelCatalogo[] =
  PUNTITOS_DEL_CATALOGO.filter((t): t is PuntitoSkinsDelCatalogo => t !== 'birdie')

/** Agrega o quita un punto especial del catálogo. El `id` es el tipo, igual que en la Timba (`alternarPuntito`). */
export function alternarPuntitoSkins(config: ConfigSkins, tipo: PuntitoSkinsDelCatalogo): ConfigSkins {
  if (config.puntitos.some(p => p.tipo === tipo)) {
    return { ...config, puntitos: config.puntitos.filter(p => p.tipo !== tipo) }
  }
  return { ...config, puntitos: [...config.puntitos, { id: tipo, tipo }] }
}

/** Cantidades de hoyos en que se juega un skins (spec «Variantes»: 18 o 9). */
export const HOYOS_SKINS = [18, 9] as const

export function esCantidadDeHoyosDelSkins(holes: number): boolean {
  return (HOYOS_SKINS as readonly number[]).includes(holes)
}

/**
 * Pozo escrito por el organizador → pesos enteros ≥ 0. Acepta «20.000», «20000» o «$20.000» (separador de miles
 * chileno); vacío es 0 (sin plata). Devuelve `null` si no es un monto (letras, decimales, negativo).
 */
export function leerPozoEscrito(texto: string): number | null {
  const limpio = texto.replace(/[\s$]/g, '').replace(/\./g, '')
  if (limpio === '') return 0
  if (!/^\d+$/.test(limpio)) return null
  const n = Number(limpio)
  return Number.isSafeInteger(n) ? n : null
}

