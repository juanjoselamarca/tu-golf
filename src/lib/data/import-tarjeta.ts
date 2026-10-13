// ─── Capa de datos — cancha, tee, ratings, tope y diferencial de una tarjeta importada ─
//
// FUENTE ÚNICA de cómo se resuelve una tarjeta que entra por import (manual, foto,
// CSV, Garmin) y de cómo se re-resuelve cuando Garmin la vuelve a mandar. Antes la
// re-importación Garmin resolvía por su lado: sin el tee por defecto del usuario y
// con los CR/slope del ARCHIVO como respaldo, que es justo la raíz del índice
// corrupto (el rating del archivo no es el del tee real). Ahora los dos caminos
// llaman a esta función, así que la misma tarjeta da la misma fila.
//
// Reglas:
// - cancha: la que viene vinculada o, si no, la que resuelve el nombre;
// - tee: el de la tarjeta o, si no trae, el por defecto del usuario;
// - CR/slope: SOLO del catálogo (`course_tees`, con el género del usuario). Sin
//   cancha o sin tee resuelto no hay ratings y la ronda no aporta diferencial
//   (nunca se inventa ni se toma del archivo);
// - el tope (WHS 3.1) y el diferencial salen de los MISMOS ratings y de la MISMA
//   fila que se guarda; si el tope falla se reporta y queda el bruto.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCourse } from '@/lib/resolve-course'
import { diferencialDeTarjeta } from '@/lib/indice-golfers'
import { indiceParaTope } from '@/golf/core/ajuste-whs'
import { hoyosConGolpes, hoyosDesdeElUno } from '@/golf/core/hoyos-jugados'
import type { HoyoDeCatalogo } from '@/golf/courses/vueltas'
import { isSharedBallFormat } from '@/golf/formats'
import { resolveTeeRatingsForCourse } from './course-tees'
import { fetchHoyosDeLaRonda } from './course-holes'
import {
  catalogoPorHoyo,
  grossAjustadoAlGuardar,
  ratingsDelDiferencial,
  type GrossAjustadoDeFila,
  type RatingsResueltos,
} from './ajuste-whs-fila'

/** Columnas del perfil que necesita `resolverTarjetaImportada`. */
export const COLS_PERFIL_IMPORT = 'indice, indice_golfers, default_tee_color, genero'

export interface PerfilDelImport {
  indice?: number | null
  indice_golfers?: number | null
  default_tee_color?: string | null
  genero?: string | null
}

export interface TarjetaAImportar {
  userId: string
  courseName: string
  courseId?: string | null
  teeColor?: string | null
  /** Par por posición ("1".."N") que trae la tarjeta (OCR, archivo). */
  parPerHole?: Record<string, number> | null
  /** Golpes por posición. */
  scores: number[]
  totalGross: number
  holesPlayed: number
  /** `metadata.hoyos` = número real de hoyo de cada posición; `recorridos` = loops de un club de 27h. */
  metadata: Record<string, unknown> & { hoyos?: number[]; recorridos?: string[] | null }
  formatoJuego: string
  source: string
}

export interface ResolucionDeImport {
  courseId: string | null
  /** Tee efectivo (el de la tarjeta o el por defecto del usuario). */
  tee: string | null
  parPerHole: Record<string, number> | null
  ratings: RatingsResueltos | null
  ajuste: GrossAjustadoDeFila | null
  diferencial: number | null
  warnings: string[]
}

/**
 * Par del catálogo en las posiciones de la tarjeta ("1".."N" = hoyo `hoyos[i]`),
 * con la vuelta canónica (`catalogoPorHoyo`). Posiciones sin par en el catálogo
 * quedan fuera; catálogo vacío o ambiguo → null (el tope cae al catálogo de la
 * fila, que tampoco topa con un par dudoso).
 */
export function parDelCatalogoPorPosicion(
  filas: HoyoDeCatalogo[],
  hoyosTarjeta: readonly number[],
): Record<string, number> | null {
  const catalogo = catalogoPorHoyo(filas, hoyosTarjeta)
  if (!catalogo) return null
  const pares = hoyosTarjeta.flatMap((n, i) => {
    const par = catalogo.pares[n]
    return par != null ? [[String(i + 1), par] as const] : []
  })
  return pares.length > 0 ? Object.fromEntries(pares) : null
}

export async function resolverTarjetaImportada(
  supabase: SupabaseClient,
  t: TarjetaAImportar,
  perfil: PerfilDelImport | null,
): Promise<ResolucionDeImport> {
  const warnings: string[] = []
  // `metadata` puede venir del cliente: sólo se usa un `hoyos` que calce con los golpes
  // (mismo criterio que `hoyosConGolpes`) y un `recorridos` que sea lista.
  const hoyos = Array.isArray(t.metadata.hoyos) && t.metadata.hoyos.length === t.scores.length ? t.metadata.hoyos : null
  const recorridos = Array.isArray(t.metadata.recorridos) ? t.metadata.recorridos : null

  // Cancha: vinculada o resuelta por nombre (puede crear/enriquecer el catálogo).
  // El par de la tarjeta puebla `course_holes` por clave ("1".."N" = hoyo 1..N): una
  // tarjeta que no empieza en el 1 (back 9, `metadata.hoyos`) trae el par por
  // POSICIÓN y escribiría los pares del 10..18 en los hoyos 1..9 del catálogo
  // compartido. Esa tarjeta sólo resuelve por nombre, sin crear ni poblar hoyos.
  let courseId = t.courseId || null
  if (!courseId && t.courseName) {
    const r = await resolveCourse({
      supabase,
      courseName: t.courseName,
      parPerHole: hoyos ? null : (t.parPerHole ?? null),
      genero: perfil?.genero ?? null,
    })
    courseId = r.courseId
    warnings.push(...r.warnings)
  }

  // Par por hoyo: el de la tarjeta → el del catálogo → null. La fila lo lee por
  // POSICIÓN (`parDeLaFila`: posición i = hoyo `metadata.hoyos[i]`), así que el del
  // catálogo (por número de hoyo) se lleva a posiciones: un back 9 guarda en "1".."9"
  // el par de los hoyos 10..18, no el del front.
  let parPerHole: Record<string, number> | null = t.parPerHole ?? null
  if (!parPerHole && courseId) {
    const filas = await fetchHoyosDeLaRonda(supabase, courseId, recorridos)
    parPerHole = parDelCatalogoPorPosicion(filas, hoyos ?? hoyosDesdeElUno(t.scores.length || t.holesPlayed))
  }

  // Tee: el de la tarjeta o, si no trae (foto/manual sin tee), el por defecto del usuario.
  const tee = t.teeColor || perfil?.default_tee_color || null
  const resolved = courseId && tee
    ? await resolveTeeRatingsForCourse(supabase, courseId, tee, t.holesPlayed, perfil?.genero)
    : null
  const ratings: RatingsResueltos | null = resolved
    ? { cr: resolved.cr, slope: resolved.slope, nineHoleRatings: resolved.nineHoleRatings }
    : null

  const ajuste = await grossAjustadoAlGuardar(supabase, {
    course_id: courseId,
    tee_color: tee,
    holes_played: t.holesPlayed,
    scores: t.scores,
    par_per_hole: parPerHole,
    metadata: t.metadata,
    formato_juego: t.formatoJuego,
    import_source: t.source,
  }, {
    indice: indiceParaTope({ perfil: perfil?.indice, golfersPlus: perfil?.indice_golfers }),
    ratings: ratings ?? undefined,
  }, { context: 'import.tope-whs', meta: { userId: t.userId, courseId } })

  const diferencial = ratings
    ? diferencialDeTarjeta({
        grossAjustado: ajuste?.grossAjustado ?? t.totalGross,
        holesPlayed: t.holesPlayed,
        hoyosJugados: hoyosConGolpes(t.scores, hoyos),
        ratings: ratingsDelDiferencial(ratings),
        bolaCompartida: isSharedBallFormat(t.formatoJuego),
      })
    : null

  return { courseId, tee, parPerHole, ratings, ajuste, diferencial, warnings }
}
