/**
 * FUENTE ÚNICA del orden de los jugadores de una ronda libre en pantalla.
 *
 * `ronda_libre_jugadores(...)` embebido no trae ORDER BY, así que Postgres los
 * devuelve en orden físico, y ese orden cambia con cada UPDATE de scores (MVCC
 * reescribe la fila). Reproducido en prod el 22-oct (ronda T2R1V3): tras anotar,
 * el scorer de grupo pasó de "E2E Test, Inv Uno, Inv Tres" a "Inv Uno, Inv Tres,
 * E2E Test" al recargar. Con guante y apuro, la fila que se mueve es un golpe
 * anotado al jugador equivocado; y en match play `[0]` es el jugador A.
 *
 * `created_at` no sirve: el alta inserta a todos en una transacción (mismo valor).
 * Orden estable: el creador primero, después por nombre y, a igual nombre, por id.
 */
export function ordenarJugadoresDeLaRonda<J extends { id: string; nombre?: string | null; user_id?: string | null }>(
  jugadores: readonly J[],
  creadorId: string | null | undefined,
): J[] {
  const esCreador = (j: J) => !!creadorId && j.user_id === creadorId
  return [...jugadores].sort((a, b) => {
    const ca = esCreador(a), cb = esCreador(b)
    if (ca !== cb) return ca ? -1 : 1
    // `nombre` es NOT NULL en la tabla, pero varios selects lo tipan `string | null`.
    const porNombre = (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es', { sensitivity: 'base' })
    if (porNombre !== 0) return porNombre
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/** La ronda con sus jugadores en el orden canónico (no muta la original). */
export function conJugadoresOrdenados<R extends { creador_id?: string | null; ronda_libre_jugadores: ReadonlyArray<{ id: string; nombre?: string | null; user_id?: string | null }> }>(
  ronda: R,
): R {
  if (!Array.isArray(ronda.ronda_libre_jugadores)) return ronda
  return { ...ronda, ronda_libre_jugadores: ordenarJugadoresDeLaRonda(ronda.ronda_libre_jugadores, ronda.creador_id) }
}
