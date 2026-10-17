/**
 * Copy del botón "Finalizar ronda" cuando pide confirmación — el mismo en el
 * scorer individual y en el de grupo. Avisa cuántos hoyos se marcarán como
 * par, o que la ronda queda parcial. `completa` es el texto del caso sin
 * faltantes (difiere entre los dos scorers).
 */
/**
 * Aviso cuando Finalizar no llega al servidor — el mismo en los dos scorers. Los
 * golpes ya están en el teléfono; la ronda no se cierra a medias y se reintenta.
 */
export const AVISO_FINALIZAR_SIN_SERVIDOR = {
  title: 'No se pudo finalizar todavía',
  message: 'Sin conexión con el servidor. Tus golpes están guardados en este teléfono; vuelve a tocar Finalizar en un momento.',
} as const

export function textoConfirmarFinalizar(input: {
  missingCount: number
  holesPlayed: number
  totalHoles: number
  completa: string
}): string {
  const { missingCount, holesPlayed, totalHoles, completa } = input
  if (missingCount > 0) return `¿Marcar ${missingCount} hoyo${missingCount > 1 ? 's' : ''} como par y finalizar?`
  if (holesPlayed < totalHoles) return `¿Guardar ronda parcial (${holesPlayed}/${totalHoles} hoyos)?`
  return completa
}
