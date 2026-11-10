/**
 * Aviso cuando Finalizar no llega al servidor — el mismo en los dos scorers. Los
 * golpes ya están en el teléfono; la ronda no se cierra a medias y se reintenta.
 */
export const AVISO_FINALIZAR_SIN_SERVIDOR = {
  title: 'No se pudo finalizar todavía',
  message: 'Sin conexión con el servidor. Tus golpes están guardados en este teléfono; vuelve a tocar Finalizar en un momento.',
} as const

/**
 * La ronda ya no existe (quien la creó la descartó): el mismo aviso en los dos scorers,
 * al guardar un golpe o al finalizar. Las copias locales se borran y el jugador sale.
 */
export const AVISO_RONDA_NO_EXISTE = {
  title: 'Esta ronda ya no existe',
  message: 'Quien la creó la descartó.',
} as const

/**
 * El servidor rechazó en firme la tarjeta (golpe fuera de rango, parámetro inválido): reintentar
 * no cambia nada. Aprobado por Juanjo (09-nov-2026).
 */
export const AVISO_TARJETA_RECHAZADA = {
  title: 'No pudimos guardar tu tarjeta',
  message: 'Revisa los golpes anotados; tus scores siguen en tu teléfono.',
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

/**
 * La pregunta de la hoja de confirmación de "Finalizar ronda", la misma en los dos
 * scorers: avisa cuántos hoyos se marcarán como par. `hoyosPorMarcar` sale de
 * `hoyosPorMarcarAlFinalizar`; en 0 ya no falta nada.
 */
export function textoConfirmarFinalizar(hoyosPorMarcar: number): string {
  if (hoyosPorMarcar === 0) return '¿Finalizar ronda?'
  return `¿Marcar ${hoyosPorMarcar} hoyo${hoyosPorMarcar > 1 ? 's' : ''} como par y finalizar?`
}
