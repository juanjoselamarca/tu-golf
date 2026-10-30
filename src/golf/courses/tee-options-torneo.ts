// src/golf/courses/tee-options-torneo.ts
//
// Las opciones del campo "Tee" de un torneo. Son los tees REALES de su cancha:
// `tournaments.tees` se matchea contra `course_tees.nombre` al resolver CR y
// slope, así que una lista fija deja al organizador eligiendo un tee que su
// cancha no tiene (y sin poder elegir el que sí tiene: el dorado está en 48
// canchas activas y la lista fija de 4 colores no lo incluía).

import { categoryTeeOptions, teeLabel, type CourseTees } from './category-tee-options'
import { TEE_NAMES_GENERICOS } from './tee-colors'

export interface OpcionDeTee {
  /** Valor a guardar en `tournaments.tees` (minúsculas, como el histórico). */
  value: string
  /** Etiqueta visible ("Azul", "Azul · norte / sur"). */
  label: string
  /** ¿Sale del catálogo de la cancha, o es un genérico / el valor ya guardado? */
  delCatalogo: boolean
}

const key = (v: string) => v.trim().toLowerCase()

/**
 * Opciones para el selector de tee del torneo.
 *
 * - Con tees en el catálogo: esos, en el orden en que vienen.
 * - Sin tees (cancha no cargada todavía): los genéricos, para no dejar el
 *   campo vacío.
 * - El tee ya guardado SIEMPRE aparece, aunque no esté en el catálogo: si no,
 *   el organizador no ve qué tiene configurado y al guardar lo perdería sin
 *   haberlo tocado. Va al final y marcado como ajeno al catálogo.
 */
export function opcionesDeTeeDelTorneo(
  courses: CourseTees[],
  teeActual: string | null | undefined,
): OpcionDeTee[] {
  const delCatalogo = categoryTeeOptions(courses, null)
  const opciones: OpcionDeTee[] = delCatalogo.length > 0
    ? delCatalogo.map(o => ({ value: key(o.nombre), label: o.label, delCatalogo: true }))
    : TEE_NAMES_GENERICOS.map(n => ({ value: key(n), label: teeLabel(n), delCatalogo: false }))

  const actual = teeActual?.trim()
  if (actual && !opciones.some(o => o.value === key(actual))) {
    opciones.push({ value: key(actual), label: teeLabel(actual), delCatalogo: false })
  }

  return opciones
}
