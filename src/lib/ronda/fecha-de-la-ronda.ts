/**
 * La fecha de una ronda libre como la muestran la vista en vivo y la tabla del scorer («26 nov 2026»).
 * `fecha` es un DATE (AAAA-MM-DD): a mediodía para que ningún huso la corra al día anterior. Sin fecha, vacío.
 */
export function fechaDeLaRonda(fecha: string | null | undefined): string {
  if (!fecha) return ''
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}
