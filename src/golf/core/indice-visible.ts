/**
 * FUENTE ÚNICA de "qué índice ve el jugador" fuera de /perfil (decisión de Juanjo, 16-nov-2026).
 *
 * El índice que se muestra en toda la app es el oficial de la Federación
 * (`profiles.indice`: FedeGolf o ingresado a mano), rotulado "Índice". El Índice
 * Golfers+ (`profiles.indice_golfers`, el que calcula la app con las rondas) vive
 * SOLO en /perfil, al lado del oficial y con su propio rótulo: mostrarlo suelto como
 * "el índice" del jugador hacía que el dashboard dijera 10.4 y el perfil 8.5
 * (auditoría 16-nov-2026).
 *
 * El hándicap de juego de una ronda o torneo es otra cosa (HCP) y no pasa por aquí.
 *
 * Puro: sin React, sin Supabase. El canario `canary-indice-golfers-solo-perfil`
 * frena que vuelva a aparecer `indice_golfers` en pantallas fuera de /perfil.
 */
import { formatearIndice } from '@/golf/handicap-index-range'

/** Rótulo del índice oficial. Nunca "HCP": HCP es el hándicap de juego de una ronda. */
export const ROTULO_INDICE = 'Índice'

/** Llamado a la acción cuando el jugador no tiene índice cargado. */
export const CTA_SIN_INDICE = 'Agrega tu índice'

export type IndiceVisible =
  | { estado: 'con-indice'; valor: number; texto: string }
  | { estado: 'sin-indice' }

/**
 * El índice que se muestra del jugador: `profiles.indice`. Sin índice (null, o un
 * valor que no es número finito) no se inventa ninguno: la pantalla muestra el CTA.
 */
export function indiceVisible({ indice }: { indice: number | null | undefined }): IndiceVisible {
  if (typeof indice !== 'number' || !Number.isFinite(indice)) return { estado: 'sin-indice' }
  return { estado: 'con-indice', valor: indice, texto: formatearIndice(indice) }
}
