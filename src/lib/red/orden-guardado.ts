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
//
// Residual abierto (aceptado): una recarga de la página es un dispositivo nuevo.
// Un POST que salió ANTES de recargar y que el servidor procesa DESPUÉS de un
// guardado de la página recargada se trata como de otro dispositivo y gana por
// llegar último. Exige un request en vuelo cruzando la recarga; persistir la
// secuencia lo cerraría, con el costo descrito abajo.

/** UUID v4 con `getRandomValues` (RFC 4122 §4.4). Respaldo de `randomUUID`, que falta en iOS < 15.4 y en
 *  contextos no seguros (http en la red local); `getRandomValues` existe en ambos. */
export function uuidDesdeAleatorios(bytesAleatorios: (b: Uint8Array) => Uint8Array): string {
  const b = bytesAleatorios(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Id de este dispositivo según lo que ofrezca el navegador. Exportado para probar cada camino. */
export function idDeDispositivo(c: Partial<Pick<Crypto, 'randomUUID' | 'getRandomValues'>> | undefined): string | null {
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const gv = c.getRandomValues.bind(c) as (b: Uint8Array) => Uint8Array
    return uuidDesdeAleatorios(gv)
  }
  return null
}

/**
 * Id del dispositivo, por carga de la página. No se persiste: la secuencia vive
 * en memoria, y con un id guardado en el teléfono una recarga volvería a empezar
 * desde 1 y el servidor descartaría cada guardado nuevo. Sin `randomUUID` (iOS <
 * 15.4, http en la red local) se arma con `getRandomValues`: sin id el servidor
 * guarda SIN orden, y un reenvío con secuencia nueva (scorer del organizador)
 * dejaría de ser seguro. Sólo sin `crypto` (servidor) es null.
 */
export const DISPOSITIVO_GUARDADO: string | null = idDeDispositivo(typeof crypto !== 'undefined' ? crypto : undefined)

let ultimaSecuencia = 0

/**
 * Secuencia de un guardado nuevo. Dos usos, los dos seguros:
 * - Ronda libre, equipos y scorer del jugador: se pide al armar el contenido y un
 *   reintento del MISMO contenido reusa la suya. Ahí varios envíos del mismo dato
 *   pueden convivir en una cola, y un reintento de un valor viejo con seq nueva
 *   pisaría uno más nuevo que entró mientras tanto.
 * - Scorer del organizador (`estado-hoyos`): cada envío lleva seq nueva, también
 *   un reintento. Es seguro porque hay UN store por torneo en la pestaña y UN vuelo
 *   por hoyo: el reintento sale después de que el anterior terminó (o se cortó) y
 *   lleva siempre el contenido VIGENTE, nunca uno viejo. Si el envío cortado llega
 *   tarde, su seq es menor y el servidor lo descarta.
 */
export function nuevaSecuencia(): number {
  return ++ultimaSecuencia
}
