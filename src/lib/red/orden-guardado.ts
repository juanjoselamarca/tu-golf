// ─── Orden de los guardados de un dispositivo — fuente única ─────────────────
//
// Un guardado de golpes que llega tarde al servidor (red lenta, reintento) no
// puede pisar a uno más nuevo del MISMO dispositivo. Cada guardado lleva el id
// de este dispositivo y una secuencia creciente; el servidor recuerda la más
// alta que aplicó y descarta una igual o menor. Lo usan la ronda libre y los
// equipos (`upsert_ronda_libre_scores`, `upsert_ronda_equipos_scores`, puntitos
// y retiros: marca por tarjeta o por clave) y el torneo (`guardar_hole_score`,
// vía /api/game: marca por hoyo).
//
// Entre dispositivos distintos gana el que llega último: ninguno está "más al
// día" que el otro. Por eso no se usa el reloj del teléfono: dos relojes no se
// pueden comparar, y uno corregido hacia atrás descartaría golpes buenos.

/**
 * Id del dispositivo, por carga de la página. No se persiste: la secuencia vive
 * en memoria, y con un id guardado en el teléfono una recarga volvería a empezar
 * desde 1 y el servidor descartaría cada guardado nuevo. Sin `randomUUID`
 * (contexto no seguro, como http en la red local) es null y se guarda sin orden,
 * como antes, en vez de no cargar el scorer.
 */
export const DISPOSITIVO_GUARDADO: string | null =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null

let ultimaSecuencia = 0

/**
 * Secuencia de un guardado nuevo. Se pide al armar el contenido (el valor
 * vigente) y un reintento del MISMO contenido reusa la suya: con una nueva, el
 * reintento de un valor viejo pisaría a uno más nuevo que entró mientras tanto.
 */
export function nuevaSecuencia(): number {
  return ++ultimaSecuencia
}
