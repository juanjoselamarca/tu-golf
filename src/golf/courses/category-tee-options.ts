// src/golf/courses/category-tee-options.ts
//
// Opciones del selector "Tee por defecto" de una categoría de torneo.
//
// `resolvePlayerTee` matchea `categories.default_tee_color` contra
// `course_tees.nombre` (case-insensitive) en la cancha de cada ronda. Por eso
// las opciones válidas son los NOMBRES reales de tee de las canchas del torneo,
// no un texto libre ni los 4 colores genéricos del perfil (`tee-colors.ts`).
// Un nombre que no existe en una cancha hace caer al jugador al siguiente
// eslabón del fallback chain en esa ronda — el selector lo informa.

export interface TeeNameRow {
  nombre: string | null
  genero?: string | null
}

export interface CourseTees {
  courseId: string
  courseName: string
  tees: TeeNameRow[]
}

import { normalizeGender } from './gender-variant'

export type CategoryGender = 'male' | 'female' | 'mixed' | null

export interface CategoryTeeOption {
  /** Nombre del tee tal como está en la primera cancha donde aparece (valor a guardar). */
  nombre: string
  /** Nombre para mostrar: el catálogo trae minúsculas ("rojo", "negras"). */
  label: string
  /** Canchas del torneo donde NO existe un tee con este nombre. */
  missingIn: string[]
}

const key = (nombre: string) => nombre.trim().toLowerCase()

/** 'male' → 'M', 'female' → 'F'; mixto o sin definir no filtra. */
function genderLetter(gender: CategoryGender): 'M' | 'F' | null {
  if (gender === 'male') return 'M'
  if (gender === 'female') return 'F'
  return null
}

function teeMatchesGender(tee: TeeNameRow, letter: 'M' | 'F' | null): boolean {
  if (!letter) return true
  const teeGender = normalizeGender(tee.genero)
  return teeGender === null || teeGender === letter
}

/**
 * Nombres de tee disponibles para una categoría, deduplicados sin distinguir
 * mayúsculas, filtrados por el género de la categoría, en el orden en que
 * aparecen en las canchas. Cada opción lista las canchas donde no existe.
 */
export function categoryTeeOptions(
  courses: CourseTees[],
  gender: CategoryGender,
): CategoryTeeOption[] {
  const letter = genderLetter(gender)
  const byKey = new Map<string, CategoryTeeOption>()

  for (const course of courses) {
    for (const tee of course.tees) {
      const nombre = tee.nombre?.trim()
      if (!nombre || !teeMatchesGender(tee, letter)) continue
      if (!byKey.has(key(nombre))) byKey.set(key(nombre), { nombre, label: teeLabel(nombre), missingIn: [] })
    }
  }

  for (const option of byKey.values()) {
    option.missingIn = courses
      .filter(c => !c.tees.some(t => t.nombre && key(t.nombre) === key(option.nombre)))
      .map(c => c.courseName)
  }

  return [...byKey.values()]
}

/**
 * Nombre de tee para mostrar. El catálogo trae minúsculas ("negras") y, en
 * canchas multi-recorrido (27h), el color seguido de los loops separados por
 * "_" ("azul_norte_sur" → "Azul · norte / sur"), igual que `canonicalColor`.
 */
export function teeLabel(nombre: string): string {
  const [color, ...loops] = nombre.trim().split('_')
  const cap = color.charAt(0).toLocaleUpperCase('es-CL') + color.slice(1)
  return loops.length > 0 ? `${cap} · ${loops.join(' / ')}` : cap
}

/** ¿El valor guardado corresponde a alguna opción? (vacío = sin definir = válido). */
export function isKnownCategoryTee(value: string | null | undefined, options: CategoryTeeOption[]): boolean {
  if (!value || !value.trim()) return true
  return options.some(o => key(o.nombre) === key(value))
}
