/**
 * Aviso de índices al finalizar una ronda libre: los dos, cada uno con su etiqueta
 * (decisión de Juanjo, 09-nov-2026), igual que las dos tarjetas del perfil
 * (`DualIndexCards`: "Federación" y "Golfers+").
 *
 * Por qué: antes el aviso leía solo `profiles.indice` (el de la Federación, que la
 * ronda no mueve) y lo comparaba antes/después del recálculo, que escribe
 * `indice_golfers`. Nunca cambiaba: decía "Índice actual: 18.0" con el número que
 * la ronda no toca, y el que sí se movió no aparecía.
 *
 * Dirección: en golf MENOS es mejor. Bajar se celebra; subir se informa en tono
 * neutro (mismo criterio que `construirAvisoIndice` de FedeGolf).
 */
import type { AvisoIndice } from '@/lib/fedegolf/aviso-indice'
import { MIN_DIFERENCIALES_INDICE } from '@/golf/core/whs-index'
import { formatearIndice } from '@/golf/handicap-index-range'

export interface IndicesDelJugador {
  /** `profiles.indice`: el de la Federación (FedeGolf o ingresado a mano). */
  federacion: number | null
  /** `profiles.indice_golfers`: el que calcula Golfers+ con sus rondas (null con menos de 3). */
  golfers: number | null
}

const txt = formatearIndice

function conFederacion(base: string, federacion: number | null): string {
  return federacion == null ? base : `${base} · Federación ${txt(federacion)}`
}

/**
 * Puro. `antes`/`despues` son null si la lectura falló o venció; `recalculado`
 * dice si el RPC del índice terminó bien.
 */
export function avisoDeIndicesAlFinalizar(
  antes: IndicesDelJugador | null,
  despues: IndicesDelJugador | null,
  recalculado: boolean,
): AvisoIndice {
  const federacion = despues?.federacion ?? antes?.federacion ?? null

  if (!recalculado || despues == null) {
    return { type: 'info', title: 'Ronda guardada', message: conFederacion('Tu índice Golfers+ se actualizará pronto', federacion) }
  }

  const nuevo = despues.golfers
  if (nuevo == null) {
    // "válidas": cuentan solo las rondas con diferencial (tee con rating, tarjeta
    // completa), no todas las jugadas.
    const activa = `Golfers+ se activa con ${MIN_DIFERENCIALES_INDICE} rondas válidas`
    return {
      type: 'success',
      title: 'Ronda guardada',
      message: federacion == null ? activa : `Federación ${txt(federacion)} · ${activa}`,
    }
  }

  const anterior = antes?.golfers ?? null
  if (anterior == null || txt(anterior) === txt(nuevo)) {
    return { type: 'success', title: 'Ronda guardada', message: conFederacion(`Golfers+ ${txt(nuevo)}`, federacion) }
  }

  return nuevo < anterior
    ? { type: 'success', title: `Bajaste tu índice Golfers+ a ${txt(nuevo)}`, message: conFederacion(`Venías de ${txt(anterior)}`, federacion) }
    : { type: 'info', title: `Tu índice Golfers+ subió a ${txt(nuevo)}`, message: conFederacion(`Venías de ${txt(anterior)}`, federacion) }
}
