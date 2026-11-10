/**
 * Nombre con que se muestra a un jugador que todavía no tiene nombre escrito: "Jugador N", donde N es su
 * número EN PANTALLA (el orden en que el usuario ve las tarjetas o filas, partiendo en 1). Así un aviso que
 * dice "Jugador 3" apunta a la tercera tarjeta que ve el usuario, no a una posición interna de una lista.
 */
export function nombreOJugadorN(nombre: string | null | undefined, numeroEnPantalla: number): string {
  return nombre?.trim() || `Jugador ${numeroEnPantalla}`
}
