// src/lib/data/tournaments/categories.ts
//
// Mapeo de `CategoryConfig` (wizard) → fila para insertar en `categories`.
// Mismo patrón que `mapPrizeForInsert`: contrato único entre wizard y tabla,
// testeable sin route.
//
// Hasta sep-2026 `create-tournament` armaba el insert inline y DESCARTABA en
// silencio `gender` y `default_tee_color`, que el wizard sí captura y el motor
// sí lee (`resolvePlayerTee`, eslabón "category"; `players.ts`). Con canchas
// distintas por ronda ese eslabón es el que hace que una categoría "Damas →
// rojo" resuelva el tee correcto en la cancha de CADA ronda, por nombre.

import type { CategoryConfig } from '@/lib/draft/types'

/** `categories.gender` tiene CHECK ('M','F'). El wizard habla en 'male'|'female'|'mixed'. */
export type CategoryGenderDb = 'M' | 'F'

export interface CategoryInsertRow {
  tournament_id: string
  name: string
  handicap_min: number | null
  handicap_max: number | null
  gender: CategoryGenderDb | null
  /** Nombre del tee de la cancha (`course_tees.nombre`), trim; null si vacío. */
  default_tee_color: string | null
}

/**
 * 'male' → 'M', 'female' → 'F'. 'mixed' y null → null: la tabla sólo modela
 * categorías de un género; "mixta" es "sin restricción".
 */
export function categoryGenderForDb(gender: CategoryConfig['gender']): CategoryGenderDb | null {
  if (gender === 'male') return 'M'
  if (gender === 'female') return 'F'
  return null
}

/**
 * El default de tee se persiste tal cual lo escribió/eligió el organizador,
 * trim()eado. NO se normaliza a un color canónico: `resolvePlayerTee` matchea
 * contra `course_tees.nombre` (case-insensitive), y ese nombre es lo que hay
 * que guardar. Vacío → null (sin default; el jugador cae al tee global).
 */
export function defaultTeeColorForDb(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

export function mapCategoryForInsert(category: CategoryConfig, tournamentId: string): CategoryInsertRow {
  return {
    tournament_id: tournamentId,
    name: category.name.trim(),
    handicap_min: category.handicap_min,
    handicap_max: category.handicap_max,
    gender: categoryGenderForDb(category.gender),
    default_tee_color: defaultTeeColorForDb(category.default_tee_color),
  }
}
