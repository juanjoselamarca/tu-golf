/**
 * Retiros de una Timba libre que este teléfono ya confirmó con el servidor pero que todavía no llegan en una
 * vista de `GET /juego` (sin señal, la recarga falló o llegó una respuesta pedida antes). Mientras tanto mandan
 * ellos: si el scorer se olvidara del retiro, "Siguiente" le pondría par al retirado y lo devolvería al juego.
 *
 * `null` = el retiro se deshizo (el jugador vuelve).
 */
export type RetirosConfirmados = Readonly<Record<string, number | null>>

/** Los retiros que valen: los del servidor con los confirmados en el teléfono encima. */
export function retirosVigentes(
  servidor: Readonly<Record<string, number>>,
  confirmados: RetirosConfirmados,
): Record<string, number> {
  const out: Record<string, number> = { ...servidor }
  for (const [jugadorId, desde] of Object.entries(confirmados)) {
    if (desde == null) delete out[jugadorId]
    else out[jugadorId] = desde
  }
  return out
}

/** Los confirmados que la vista del servidor todavía no refleja (los demás ya se pueden olvidar). */
export function retirosQueFaltanEnLaVista(
  servidor: Readonly<Record<string, number>>,
  confirmados: RetirosConfirmados,
): Record<string, number | null> {
  return Object.fromEntries(Object.entries(confirmados).filter(([jugadorId, desde]) => (servidor[jugadorId] ?? null) !== desde))
}
