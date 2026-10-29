/**
 * Hándicap que entra al motor de Timba libre (contrato del PR B, cláusula 1). Único mapeo, SIN valor por
 * defecto:
 *  - `null` si el jugador está en `sinIndice` de `courseHandicapsDeRonda` (su CH de índice 0 no es un
 *    hándicap) o si no tiene entrada en `courseHcpMap`;
 *  - `courseHcpMap[id]` si no.
 *
 * No se reutiliza el de `tarjeta-para-historial.ts`: su `?? 0` convierte un CH faltante en 0 y apaga el aviso
 * `sinHandicap` del motor. `sinIndice` llega como Set desde `courseHandicapsDeRonda` y como array desde
 * `cargarRondaLibreEnVivo`: se aceptan los dos para que nadie llame `.includes` sobre un Set.
 *
 * El neto solo se puede calcular con `courseHandicapsDeRonda` llamado con un lector real de índices, nunca
 * desde la respuesta pública de la ronda en vivo (`courseHcpMap: {}`): ahí todos caerían en `sinHandicap`.
 */
export interface MapasDeHandicap {
  courseHcpMap: Readonly<Record<string, number>>
  sinIndice: ReadonlySet<string> | readonly string[]
}

export function courseHandicapDelJuego(mapas: MapasDeHandicap, jugadorId: string): number | null {
  const { sinIndice, courseHcpMap } = mapas
  const sinIndiceTiene = sinIndice instanceof Set ? sinIndice.has(jugadorId) : (sinIndice as readonly string[]).includes(jugadorId)
  if (sinIndiceTiene) return null
  return Object.prototype.hasOwnProperty.call(courseHcpMap, jugadorId) ? courseHcpMap[jugadorId] : null
}
