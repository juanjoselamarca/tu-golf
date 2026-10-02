/**
 * Copy del botón "Finalizar ronda" cuando pide confirmación — el mismo en el
 * scorer individual y en el de grupo. Avisa cuántos hoyos se marcarán como
 * par, o que la ronda queda parcial. `completa` es el texto del caso sin
 * faltantes (difiere entre los dos scorers).
 */
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
