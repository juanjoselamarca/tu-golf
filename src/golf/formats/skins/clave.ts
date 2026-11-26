/**
 * Clave y nombre del formato Skins. Archivo SIN imports a propósito: lo pueden importar `core/rules` y el barril de
 * formatos sin armar un ciclo (config.ts evalúa constantes de core al cargar).
 */

/** Clave del formato en `formato_juego`. Fuente única. */
export const FORMATO_SKINS = 'skins' as const
export const NOMBRE_FORMATO_SKINS = 'Skins'

export function esFormatoSkins(formato: string | null | undefined): formato is typeof FORMATO_SKINS {
  return formato === FORMATO_SKINS
}

/**
 * ¿La tarjeta de una ronda de este formato va al historial (y al índice)? Todas, salvo el Skins: un hoyo con X no tiene
 * golpes y su ajuste WHS no está resuelto (spec docs/specs/formato-skins.md, «Cierre de una ronda de skins»); el CHECK
 * de `historical_rounds` la rechaza a propósito. Fuente única para el cierre del scorer y «Guardar en mi historial».
 */
export function tarjetaVaAlHistorial(formato: string | null | undefined): boolean {
  return !esFormatoSkins(formato)
}
