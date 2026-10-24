// src/golf/formats/team-handicap.ts
//
// Fuente única de la asignación OFICIAL del handicap de equipo en bola
// compartida (Rules of Handicapping, Apéndice C; decisión de producto
// 23-oct-2026):
//   - Scramble: un % por posición, del jugador con menor handicap de cancha al
//     de mayor. 2 jugadores 35/15 · 3 jugadores 30/20/10 · 4 jugadores 25/20/15/10.
//   - Foursome: 50 % de la suma de los dos handicaps de cancha.
// Se aplica sobre el handicap de cancha de cada jugador, sin redondear, con un
// solo redondeo final (WHS).
//
// PR-C: aquí vive también el cálculo (`handicapEquipoScramble`,
// `handicapEquipoFoursome`) que reemplaza a `calcularHandicapScramble` /
// `calcularHandicapFoursome`. Hoy solo lo leen el wizard y el validador.

export type TamanoEquipo = 2 | 3 | 4

export const SCRAMBLE_ASIGNACION_OFICIAL: Readonly<Record<TamanoEquipo, readonly number[]>> = {
  2: [35, 15],
  3: [30, 20, 10],
  4: [25, 20, 15, 10],
}

export const FOURSOME_PCT_SUMA_OFICIAL = 50

/**
 * Un porcentaje de handicap de equipo válido: entero entre 0 y 100. Fuente
 * única para el schema, el validador, la lectura de la forma vieja y el wizard.
 */
export function esPorcentajeDeEquipo(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100
}

/**
 * Aviso (no bloquea) para un scramble personalizado cuyos % suman más de 100:
 * el equipo recibiría más golpes que el handicap completo de un jugador. Lo
 * muestran el wizard (bajo los %) y el validador (`team_handicap_pcts_sum`).
 * null si no corresponde o si algún % no es válido (eso ya es un error).
 */
export function avisoSumaScramble(porcentajes: readonly unknown[]): string | null {
  if (!porcentajes.every(esPorcentajeDeEquipo)) return null
  const suma = porcentajes.reduce((a, b) => a + b, 0)
  return suma > 100
    ? `Los porcentajes suman ${suma} %: el equipo recibe más golpes que el handicap completo de un jugador. ¿Es lo que quieres?`
    : null
}

/** Porcentajes oficiales de scramble para `n` jugadores; null si no hay asignación. */
export function asignacionOficialScramble(n: number): readonly number[] | null {
  return n === 2 || n === 3 || n === 4 ? SCRAMBLE_ASIGNACION_OFICIAL[n] : null
}
