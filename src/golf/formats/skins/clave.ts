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
