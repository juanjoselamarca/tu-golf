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

/** Qué hacer cuando PostgREST falla. */
export interface OpcionesHoyos {
  columnas?: string
  /**
   * `true` = camino de GATE: un error de la BD LANZA.
   *
   * Sin esto el gate hereda el degradado de las pantallas de scoring y falla
   * CERRADO en silencio: un timeout de `course_holes` devuelve `[]`, el gate
   * lee "0 hoyos", bloquea la creación con un mensaje que miente ("esta cancha
   * no tiene el par hoyo por hoyo cargado") y el `.catch()` de la ruta —que es
   * quien reporta a Sentry y abre el paso— nunca corre. Un hipo de PostgREST
   * dejaría al país entero sin poder empezar una ronda, sin una sola señal.
   *
   * Por defecto `false`: las cuatro pantallas de scoring TIENEN que degradar,
   * no tumbar la tarjeta con el jugador parado en el tee.
   */
  lanzarSiFalla?: boolean
}

/** Los hoyos de la ronda más de cuántos recorridos salieron. */
export interface HoyosDeLaRonda {
  hoyos: HoyoDelCatalogo[]
  /**
   * Cuántos de los recorridos pedidos aportaron hoyos. El gate lo compara
   * contra los que se eligieron: si un loop no tiene scorecard, la ronda
   * quedaría con la mitad de los hoyos y `hoyosDeLaVuelta` repetiría el otro.
   */
  loopsResueltos: number
}

/**
 * Los hoyos que se juegan en esta ronda, en orden y renumerados.
 *
 * Devuelve `[]` cuando no hay dato — el caller decide su fallback (hoy las
 * pantallas caen a par 4, que es lo que este módulo existe para volver
 * innecesario en las canchas que sí tienen el dato).
 */
export async function fetchHoyosDeLaRonda(
  supabase: MinimalClient,
  courseId: string,
  recorridos: string[] | null | undefined,
  columnas: string = COLUMNAS_HOYOS,
): Promise<HoyoDelCatalogo[]> {
  const { hoyos } = await resolverHoyosDeLaRonda(supabase, courseId, recorridos, { columnas })
  return hoyos
}

/**
 * Igual que `fetchHoyosDeLaRonda`, con el detalle que necesita el gate y la
 * opción de fallar CERRADO ante un error de la BD.
 */
export async function resolverHoyosDeLaRonda(
  supabase: MinimalClient,
  courseId: string,
  recorridos: string[] | null | undefined,
  opciones: OpcionesHoyos = {},
): Promise<HoyosDeLaRonda> {
  const columnas = opciones.columnas ?? COLUMNAS_HOYOS
  const loops = Array.from(new Set((recorridos ?? []).filter((r): r is string => !!r)))

  /** Aplica el contrato de error elegido por el caller. */
  const filas = <T>(
    { data, error }: { data: unknown; error: { message?: string } | null },
    que: string,
  ): T[] => {
    if (error && opciones.lanzarSiFalla) {
      throw new Error(`No se pudo leer ${que}: ${error.message ?? 'error desconocido'}`)
    }
    return (data ?? []) as T[]
  }

  // Vía 1: la cancha elegida tiene sus propios hoyos.
  let q = supabase.from('course_holes').select(columnas).eq('course_id', courseId)
  if (loops.length > 0) q = q.in('recorrido', loops) as typeof q
  const filasPropias = filas<HoyoDelCatalogo>(
    await q.order('recorrido').order('numero'),
    'los hoyos de la cancha',
  )

  if (filasPropias.length > 0) {
    // Con recorridos elegidos, el orden lo manda la selección y no el alfabeto
    // que devolvió PostgREST — y el resultado pasa por el MISMO tratamiento que
    // la vía 2 (orden, renumeración y normalización del stroke index). La rama
    // de un solo loop entra acá igual: con los datos de hoy es indistinguible,
    // pero en un módulo cuya tesis es "las dos vías contestan igual" una
    // asimetría es una divergencia esperando datos que la despierten.
    if (loops.length > 0) {
      const porRecorrido = agruparPorRecorrido(filasPropias)
      return {
        hoyos: ordenarHoyosDeLosRecorridos(porRecorrido, loops),
        loopsResueltos: loops.filter((l) => porRecorrido.has(l)).length,
      }
    }
    // Sin recorridos elegidos no hay nada que componer: es la cancha tal cual la
    // publica el club, con su numeración y su stroke index oficiales. Son 168 de
    // las 186 canchas activas y este camino no las toca.
    return { hoyos: filasPropias, loopsResueltos: 0 }
  }

  // Vía 2: es el club padre de un complejo y los hoyos cuelgan de los hijos.
  // Sin loops elegidos no hay nada que buscar: no se adivina qué se jugó.
  if (loops.length === 0) return { hoyos: [], loopsResueltos: 0 }

  const filasHijos = filas<{ id: string; loop_nombre: string | null }>(
    await supabase
      .from('courses')
      .select('id, loop_nombre')
      .eq('parent_id', courseId)
      .in('loop_nombre', loops),
    'los recorridos de la cancha',
  )
  if (filasHijos.length === 0) return { hoyos: [], loopsResueltos: 0 }

  // Se pide `course_id` explícito: es lo que ata cada hoyo a SU recorrido.
  // Agrupar por la columna `recorrido` sería más frágil — hoy los 9 hijos del
  // catálogo la tienen igual a su `loop_nombre`, pero es un dato redundante que
  // puede desincronizarse, y si un hijo la tuviera con otro valor el filtro
  // devolvería vacío y volveríamos al par 4 de relleno. El `course_id` no puede
  // mentir: es la fila por la que preguntamos.
  const hoyosHijos = filas<HoyoDelCatalogo & { course_id?: string }>(
    await supabase
      .from('course_holes')
      .select(columnas.includes('course_id') ? columnas : `course_id, ${columnas}`)
      .in('course_id', filasHijos.map((h) => h.id))
      .order('numero'),
    'los hoyos de los recorridos',
  )
  if (hoyosHijos.length === 0) return { hoyos: [], loopsResueltos: 0 }

  const porLoop = new Map<string, HoyoDelCatalogo[]>()
  for (const hijo of filasHijos) {
    if (!hijo.loop_nombre) continue
    const suyos = hoyosHijos
      .filter((h) => h.course_id === hijo.id)
      .sort((a, b) => a.numero - b.numero)
    if (suyos.length > 0) porLoop.set(hijo.loop_nombre, suyos)
  }

  return {
    hoyos: ordenarHoyosDeLosRecorridos(porLoop, loops),
    loopsResueltos: loops.filter((l) => porLoop.has(l)).length,
  }
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
