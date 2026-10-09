// src/golf/handicap-index-range.ts
//
// FUENTE ÚNICA del rango aceptable de un ÍNDICE de handicap que entra por un
// write-path (inscripción de invitados, ronda libre, admin).
//
// WHS: el índice máximo es 54.0. Abajo no hay tope formal; los plus se guardan
// en negativo (+2.0 → -2.0) y -10 cubre con holgura a cualquier jugador real.
//
// Por qué existe: el índice entra directo al neto del leaderboard. Un invitado
// que tipea "185" queriendo decir 18.5 (al sol, con guante) quedaba inscrito
// con índice 185 y ganaba el neto sin que nadie lo notara. El rango estaba
// copiado a mano en dos endpoints y ausente en los dos de invitados.

export const HANDICAP_INDEX_MIN = -10
export const HANDICAP_INDEX_MAX = 54

/** Mensaje para el usuario cuando el índice está fuera de rango. */
export const MENSAJE_INDICE_FUERA_DE_RANGO =
  `Revisa el índice de handicap: debe estar entre +${-HANDICAP_INDEX_MIN} (plus) y ${HANDICAP_INDEX_MAX}.`

/** true si `v` es un número finito dentro del rango WHS aceptado. */
export function esIndiceDeHandicapValido(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= HANDICAP_INDEX_MIN &&
    v <= HANDICAP_INDEX_MAX
  )
}
