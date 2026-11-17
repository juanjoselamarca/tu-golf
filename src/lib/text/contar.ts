/**
 * "1 espiral" / "3 espirales" / "0 espirales": número + sustantivo concordado.
 *
 * Fuente única para contar cosas en la UI (regla "un concepto, una fuente").
 * El plural va explícito porque en español no basta con agregar "s"
 * (espiral → espirales) y hay invariables ("1 tilt" / "3 tilt").
 */
export function contar(n: number, singular: string, plural: string): string {
  return `${n} ${concordar(n, singular, plural)}`
}

/** Solo el sustantivo concordado, para cuando el número se pinta aparte. */
export function concordar(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural
}
