/**
 * Aviso al usuario cuando su índice WHS cambia en FedeGolf.
 *
 * Por qué existe: el sync de índice corre en cada carga de página (FedegolfSync,
 * cooldown 24h), detectaba el cambio y lo escribía en `indice_historial`… y al
 * usuario le avisaba con un `console.log`. Reporte del inbox f7b63d1d: el índice
 * de Juanjo pasó de 9.1 (14-jul) a 9.3 (27-jul) y nadie se enteró.
 *
 * Dirección del cambio: en golf MENOS es mejor (ver memoria de vocabulario de
 * strokes). Bajar el índice es un logro del jugador y se celebra; subir se informa
 * en tono neutro. Nunca se lo llama "mejora" cuando subió.
 */

export interface AvisoIndice {
  type:    'success' | 'info'
  title:   string
  message: string
}

/**
 * Construye el aviso. Puro y testeable — no toca el store de toasts.
 * Devuelve null si no hay nada honesto que decir (sin índice nuevo, o sin cambio
 * real contra el anterior).
 */
export function construirAvisoIndice(
  nuevo: number | null | undefined,
  anterior: number | null | undefined
): AvisoIndice | null {
  if (nuevo == null) return null

  const nuevoTxt = nuevo.toFixed(1)

  // Sin referencia anterior (primera sincronización) no se puede narrar un delta.
  if (anterior == null) {
    return {
      type: 'info',
      title: `Tu índice es ${nuevoTxt}`,
      message: 'Sincronizado con FedeGolf.',
    }
  }

  const anteriorTxt = anterior.toFixed(1)
  if (nuevoTxt === anteriorTxt) return null // cambio por debajo de la precisión que mostramos

  return nuevo < anterior
    ? {
        type: 'success',
        title: `Bajaste tu índice a ${nuevoTxt}`,
        message: `Venías de ${anteriorTxt}. Actualizado desde FedeGolf.`,
      }
    : {
        type: 'info',
        title: `Tu índice subió a ${nuevoTxt}`,
        message: `Venías de ${anteriorTxt}. Actualizado desde FedeGolf.`,
      }
}
