// Decisiones puras sobre los golpes apartados (`apartarRechazados`) que toma `saveAllScores` de `useGrupoScoreSave`.

import type { PendientesGrupo } from '@/lib/ronda/score-storage'

/**
 * Golpes apartados que Finalizar / «Terminar mi equipo» reenvían (`reintentarRechazados`): sólo de tarjetas vigentes, y
 * sin los hoyos que tienen un valor pendiente de subir (ese valor es más nuevo: una corrección del marcador).
 */
export function golpesAReintentar(
  rechazados: PendientesGrupo,
  pendientes: PendientesGrupo,
  vigentes: ReadonlySet<string>,
): [string, Record<string, number>][] {
  return Object.entries(rechazados)
    .filter(([id]) => vigentes.has(id))
    .map(([id, golpes]): [string, Record<string, number>] =>
      [id, Object.fromEntries(Object.entries(golpes).filter(([h]) => pendientes[id]?.[h] == null))])
    .filter(([, libres]) => Object.keys(libres).length > 0)
}

/**
 * ¿Algún equipo que rebotó por terminado (`terminados`, ids `eq:<id>`) sigue en la pantalla (`vigentes`, leídas al
 * empezar el envío: la relectura que dispara el rebote lo saca de la lista antes de que el envío termine) con golpes
 * apartados? Entonces cerrar la copia local los perdería: «Terminar mi equipo» no sigue. Sin apartados no frena (nada
 * que perder), así un equipo ya reabierto y reenviado no queda bloqueado.
 */
export function hayEquipoTerminadoConApartados(
  terminados: ReadonlySet<string>,
  vigentes: ReadonlySet<string>,
  rechazados: PendientesGrupo,
): boolean {
  return [...terminados].some(id => vigentes.has(id) && Object.keys(rechazados[id] ?? {}).length > 0)
}
