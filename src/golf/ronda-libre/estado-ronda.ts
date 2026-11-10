// src/golf/ronda-libre/estado-ronda.ts
//
// Qué significa el `estado` de una ronda libre. Puro (sin red ni base): lo usan el motor del juego,
// la capa de datos (`lib/data/ronda-libre-estado`, que lo re-exporta), los scorers, la vista de la
// ronda y las rutas de push.

/** `estado` de una ronda que ya no existe (el creador la descartó: se borra). */
export const RONDA_NO_EXISTE = 'no_existe'

/**
 * La ronda existe y no acepta golpes: la misma regla que el RPC de guardado (`estado <> 'en_curso'`
 * → P0002). Una sola definición de "cerrada" para todo el código.
 * Sin lectura (`null`) o con la ronda borrada (`RONDA_NO_EXISTE`) NO está cerrada: es otro caso.
 */
export function esRondaCerrada(estado: string | null | undefined): boolean {
  return estado != null && estado !== RONDA_NO_EXISTE && estado !== 'en_curso'
}
