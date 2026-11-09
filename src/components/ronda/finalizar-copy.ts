/**
 * Aviso cuando Finalizar no llega al servidor — el mismo en los dos scorers. Los
 * golpes ya están en el teléfono; la ronda no se cierra a medias y se reintenta.
 */
export const AVISO_FINALIZAR_SIN_SERVIDOR = {
  title: 'No se pudo finalizar todavía',
  message: 'Sin conexión con el servidor. Tus golpes están guardados en este teléfono; vuelve a tocar Finalizar en un momento.',
} as const

/**
 * Match play NETO sin sesión con un jugador cuyo índice está en su perfil (#511):
 * sin ese índice el match (y qué hoyos quedaron sin jugar) saldría como gross. No
 * se cierra a su nombre; los golpes siguen anotados.
 */
export const AVISO_FINALIZAR_MATCH_SIN_SESION = {
  title: 'Inicia sesión para finalizar',
  message: 'Si no tienes cuenta, el jugador con cuenta lo finaliza desde su teléfono. Tus golpes siguen anotados.',
} as const

interface ProgresoDeLaTarjeta {
  missingCount: number
  holesPlayed: number
  totalHoles: number
}

/** ¿Están anotados todos los hoyos de la ronda? Decide el aviso "Tarjeta completa". */
export function tarjetaCompleta({ missingCount, holesPlayed, totalHoles }: ProgresoDeLaTarjeta): boolean {
  return missingCount === 0 && holesPlayed >= totalHoles
}

/**
 * La pregunta de la hoja de confirmación de "Finalizar ronda", la misma en los dos
 * scorers: avisa cuántos hoyos se marcarán como par, o que la ronda queda parcial.
 */
export function textoConfirmarFinalizar(input: ProgresoDeLaTarjeta): string {
  const { missingCount, holesPlayed, totalHoles } = input
  if (missingCount > 0) return `¿Marcar ${missingCount} hoyo${missingCount > 1 ? 's' : ''} como par y finalizar?`
  if (holesPlayed < totalHoles) return `¿Guardar ronda parcial (${holesPlayed}/${totalHoles} hoyos)?`
  return '¿Finalizar ronda?'
}
