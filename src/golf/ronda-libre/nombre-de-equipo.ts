/**
 * El nombre de un equipo de la ronda libre: una sola fuente para el formulario y para la API que lo graba.
 */

/** Largo máximo del nombre de un equipo (lo exige la API; el input no deja escribir más). */
export const NOMBRE_EQUIPO_MAX = 50

/** Nombre por defecto del equipo en la posición `posicion` (desde 0): "Equipo 1", "Equipo 2"… */
export function nombreDeEquipo(posicion: number): string {
  return `Equipo ${posicion + 1}`
}

/**
 * El nombre con que se muestra y se graba un equipo: el que escribió el usuario sin espacios a los lados o, si
 * lo dejó vacío (o solo con espacios), el de por defecto. Así lo que dice la pantalla es lo que se guarda, y
 * borrar el nombre nunca hace fallar la creación de la ronda.
 */
export function nombreVisibleDeEquipo(nombre: string | null | undefined, posicion: number): string {
  return nombre?.trim() || nombreDeEquipo(posicion)
}
