// src/lib/data/course-holes.ts
//
// Capa de datos de "los hoyos de esta ronda". Contesta la pregunta que antes se
// resolvía inline en cuatro pantallas, y la contesta MIRANDO LAS DOS VÍAS que
// tiene el catálogo para guardar el par hoyo por hoyo:
//
//   1. `course_holes` de la cancha elegida (el caso de 177 de las 186 canchas
//      activas), opcionalmente filtrado por la columna `recorrido`.
//   2. `course_holes` de los recorridos HIJOS, cuando la cancha es el club
//      padre de un complejo de 27 hoyos y el jugador eligió qué loops juega.
//
// La vía 2 es la que faltaba. Ver `@/golf/courses/hoyos-de-la-ronda` para el
// detalle del bug que cierra.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ordenarHoyosDeLosRecorridos,
  renumerarSiEsMultiLoop,
  type HoyoDelCatalogo,
} from '@/golf/courses/hoyos-de-la-ronda'

/** Cliente mínimo que necesita este módulo (sirve anon, ssr o service role). */
type MinimalClient = Pick<SupabaseClient, 'from'>

/**
 * Columnas de `course_holes` que necesita el scorer. Fuente única del SELECT:
 * las cuatro copias inline pedían listas distintas y una pantalla mostraba
 * yardajes que otra no.
 */
export const COLUMNAS_HOYOS =
  'numero, par, stroke_index, recorrido, yardaje_negras, yardaje_azul, yardaje_blanco, yardaje_rojo, yardaje_verificado_at'

/**
 * Los hoyos que se juegan en esta ronda, en orden y renumerados.
 *
 * Devuelve `[]` cuando no hay dato — el caller decide su fallback (hoy los
 * cuatro caen a par 4, que es lo que este módulo existe para volver innecesario
 * en las canchas que sí tienen el dato).
 *
 * No lanza: es camino de LECTURA de una pantalla de scoring, no un gate. Un
 * hipo de PostgREST tiene que degradar como degradaba antes, no tumbar la
 * tarjeta con el jugador en el tee.
 */
export async function fetchHoyosDeLaRonda(
  supabase: MinimalClient,
  courseId: string,
  recorridos: string[] | null | undefined,
  columnas: string = COLUMNAS_HOYOS,
): Promise<HoyoDelCatalogo[]> {
  const loops = (recorridos ?? []).filter((r): r is string => !!r)

  // Vía 1: la cancha elegida tiene sus propios hoyos.
  let q = supabase.from('course_holes').select(columnas).eq('course_id', courseId)
  if (loops.length > 0) q = q.in('recorrido', loops) as typeof q
  const { data: propios } = await q.order('recorrido').order('numero')

  const filasPropias = (propios ?? []) as unknown as HoyoDelCatalogo[]
  if (filasPropias.length > 0) {
    // Con varios loops el orden lo manda la selección, no el alfabeto que
    // devolvió PostgREST. Se reordena acá para que las dos vías contesten igual.
    if (loops.length > 1) {
      return ordenarHoyosDeLosRecorridos(agruparPorRecorrido(filasPropias), loops)
    }
    return renumerarSiEsMultiLoop(filasPropias, loops.length)
  }

  // Vía 2: es el club padre de un complejo y los hoyos cuelgan de los hijos.
  // Sin loops elegidos no hay nada que buscar: no se adivina qué se jugó.
  if (loops.length === 0) return []

  const { data: hijos } = await supabase
    .from('courses')
    .select('id, loop_nombre')
    .eq('parent_id', courseId)
    .in('loop_nombre', loops)

  const filasHijos = (hijos ?? []) as Array<{ id: string; loop_nombre: string | null }>
  if (filasHijos.length === 0) return []

  // Se pide `course_id` explícito: es lo que ata cada hoyo a SU recorrido.
  // Agrupar por la columna `recorrido` sería más frágil — hoy los 9 hijos del
  // catálogo la tienen igual a su `loop_nombre`, pero es un dato redundante que
  // puede desincronizarse, y si un hijo la tuviera con otro valor el filtro
  // devolvería vacío y volveríamos al par 4 de relleno. El `course_id` no puede
  // mentir: es la fila por la que preguntamos.
  const { data: hoyosHijos } = await supabase
    .from('course_holes')
    .select(columnas.includes('course_id') ? columnas : `course_id, ${columnas}`)
    .in('course_id', filasHijos.map((h) => h.id))
    .order('numero')

  const filas = (hoyosHijos ?? []) as unknown as Array<HoyoDelCatalogo & { course_id?: string }>
  if (filas.length === 0) return []

  const porLoop = new Map<string, HoyoDelCatalogo[]>()
  for (const hijo of filasHijos) {
    if (!hijo.loop_nombre) continue
    const suyos = filas
      .filter((h) => h.course_id === hijo.id)
      .sort((a, b) => a.numero - b.numero)
    if (suyos.length > 0) porLoop.set(hijo.loop_nombre, suyos)
  }

  return ordenarHoyosDeLosRecorridos(porLoop, loops)
}

/** Agrupa filas por su columna `recorrido`, conservando el orden por `numero`. */
function agruparPorRecorrido(filas: HoyoDelCatalogo[]): Map<string, HoyoDelCatalogo[]> {
  const out = new Map<string, HoyoDelCatalogo[]>()
  for (const h of filas) {
    const key = h.recorrido ?? ''
    const lista = out.get(key)
    if (lista) lista.push(h)
    else out.set(key, [h])
  }
  out.forEach((lista) => lista.sort((a, b) => a.numero - b.numero))
  return out
}
