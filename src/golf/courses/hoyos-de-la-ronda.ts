// src/golf/courses/hoyos-de-la-ronda.ts
//
// FUENTE ÚNICA de "¿cuáles son los hoyos que se juegan en esta ronda, y en qué
// orden?". La parte pura: ordenar y renumerar. El acceso a datos vive en
// `@/lib/data/course-holes`.
//
// Por qué existe
// --------------
// El par hoyo por hoyo se resolvía inline en cuatro lugares
// (`useRondaScoreData`, `score-grupo/page`, `lib/data/ronda-libre`,
// `lib/data/ronda-metadata`), los cuatro con la misma query: `course_holes`
// filtrado por `course_id` de la ronda y, si hay loops elegidos, por la columna
// `recorrido`.
//
// Esa query NO encuentra nada en un complejo de 27 hoyos. Los tres del catálogo
// (Brisas, Rocas, Marbella) tienen 0 filas en el club PADRE y 9 en cada
// recorrido HIJO, así que `course_id = padre` devuelve vacío y el scorer cae a
// su default: par 4 en los 18 hoyos y stroke index 1..18 secuencial. El total
// queda tapado por `parTotalEstandar(18) = 72`, pero cada par-3 y cada par-5 se
// pinta mal, y en modo neto el stroke index falso reparte los golpes donde no
// corresponde.
//
// El motor de handicap YA sabía leer los hijos (`resolverCourseData` paso 0
// combina sus ratings). El de par por hoyo no. Esta es esa inconsistencia,
// cerrada: una sola función contesta la pregunta, y mira las dos vías.
//
// ⚠️ El orden lo manda la SELECCIÓN, no el alfabeto. Las cuatro copias hacían
// `.order('recorrido')`, que para `['Sur','Norte']` devolvía Norte primero y
// numeraba los hoyos al revés de como se jugaron. Con `['Norte','Sur']` salía
// bien por casualidad alfabética.

import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'

/** Un hoyo del catálogo, como viene de `course_holes`. */
export interface HoyoDelCatalogo {
  numero: number
  par: number
  stroke_index: number | null
  recorrido: string | null
  [columna: string]: unknown
}

/**
 * Los hoyos de una ronda multi-recorrido, en el orden en que se juegan y
 * renumerados 1..N.
 *
 * `porRecorrido` mapea cada loop elegido a sus hoyos ya ordenados por `numero`.
 * `recorridos` es el orden que eligió el jugador y es el que manda.
 *
 * Un loop que no esté en el mapa se omite: el caller ya decidió si eso es un
 * error (el gate de aptitud lo bloquea antes de que la ronda exista).
 */
export function ordenarHoyosDeLosRecorridos(
  porRecorrido: Map<string, HoyoDelCatalogo[]>,
  recorridos: string[],
): HoyoDelCatalogo[] {
  const out: HoyoDelCatalogo[] = []
  for (const loop of recorridos) {
    const hoyos = porRecorrido.get(loop)
    if (!hoyos) continue
    for (const h of hoyos) out.push(h)
  }
  return normalizarStrokeIndex(renumerarSiEsMultiLoop(out, recorridos.length))
}

/**
 * Rankea el stroke index sobre los hoyos que se juegan, para que sea una
 * permutación 1..N.
 *
 * Cada nueve publica SU stroke index 1..9, así que al concatenar dos loops cada
 * número aparece DOS veces. Los sitios que reparten golpes ya normalizan por su
 * cuenta (`normalizeStrokeIndexMap` en la capa de datos, `siAlloc` en el
 * scoreboard), así que el neto salía bien — pero los de DISPLAY usan el valor
 * crudo, y ahí un jugador con hándicap 9 veía el punto de golpe en los 18 hoyos
 * cuando sólo 9 lo reciben, y la tarjeta mostraba "SI 8" en el hoyo 1 y otra vez
 * en el 10.
 *
 * Antes esto no se veía porque en los complejos de 27 hoyos el catálogo devolvía
 * 0 filas y el scorer inventaba un 1..18 secuencial — una permutación válida,
 * pero falsa. Al empezar a devolver los hoyos reales, el problema se vuelve
 * alcanzable, así que se normaliza acá: un solo lugar, todos los consumidores
 * consistentes.
 *
 * Idempotente sobre un stroke index ya válido.
 */
function normalizarStrokeIndex(hoyos: HoyoDelCatalogo[]): HoyoDelCatalogo[] {
  if (hoyos.length === 0) return hoyos
  const normalizado = normalizedStrokeIndexByHole(
    hoyos.map((h) => ({ numero: h.numero, stroke_index: h.stroke_index ?? h.numero })),
  )
  return hoyos.map((h) => ({ ...h, stroke_index: normalizado[h.numero] ?? h.stroke_index }))
}

/**
 * Renumera 1..N cuando la ronda combina más de un recorrido.
 *
 * Con un solo loop se conserva el `numero` del catálogo: una cancha de 9 hoyos
 * jugada sola numera 1..9, y el scorer ya sabe repetir la vuelta para una ronda
 * de 18 (`@/golf/courses/vueltas`). Con dos loops los números se pisan (dos
 * hoyos "1"), así que hay que renumerar o el mapa por hoyo pierde la mitad.
 */
export function renumerarSiEsMultiLoop(
  hoyos: HoyoDelCatalogo[],
  cantidadDeLoops: number,
): HoyoDelCatalogo[] {
  if (cantidadDeLoops <= 1) return hoyos
  return hoyos.map((h, i) => ({ ...h, numero: i + 1 }))
}
