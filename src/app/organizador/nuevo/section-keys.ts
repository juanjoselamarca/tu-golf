// src/app/organizador/nuevo/section-keys.ts
//
// Qué keys raíz del config edita cada sección del wizard. Única fuente para
// mostrar los errores (inválidos en cliente, rechazos del server) debajo de la
// sección correcta. Vive acá y no en cada sección porque cuatro de ellas
// (QueTorneo, Categorias, Rondas, Tees) están reservadas para otros PRs en
// curso; cuando se liberen, cada sección puede exportar las suyas y este
// archivo pasa a re-exportarlas.

import type { TournamentConfig } from '@/lib/draft/types'

type RootKey = keyof TournamentConfig

export const SECTION_KEYS = {
  queTorneo: ['name', 'date_start', 'description', 'cover_image_url'],
  comoJuegan: ['format', 'modo', 'use_handicap'],
  equipos: ['team_config'],
  matchPlay: ['match_play_config'],
  stableford: ['stableford_config'],
  categorias: ['categories'],
  rondas: ['rounds'],
  inscripcion: ['registration'],
  premios: ['prizes'],
  // Keys que ninguna sección edita a mano (las fija el server o la IA): si la
  // base viene inválida en ellas, el error se muestra al final del formulario.
  admins: ['is_practice', 'pending_confirmations', 'schema_version'],
} as const satisfies Record<string, readonly RootKey[]>

/**
 * Campos que muestran su error JUNTO al input (borde + mensaje debajo), como dot-path
 * con `*` para el índice de listas. Un issue cuyo path calza acá no se repite debajo
 * de la sección; el resto (rechazos sin path, keys sin input propio) sí.
 */
export const INLINE_FIELD_PATTERNS = [
  'name',
  'description',
  'date_start',
  'prizes.*.description',
  'prizes.*.position',
  'prizes.*.hole_number',
  'categories.*.name',
  'categories.*.handicap_min',
  'categories.*.handicap_max',
  'registration.max_players',
  'registration.deadline',
  'rounds.*.date',
] as const

/** ¿El dot-path ("prizes.0.description") tiene un input que muestra su error? */
export function isInlineFieldPath(dotPath: string): boolean {
  const parts = dotPath.split('.')
  return INLINE_FIELD_PATTERNS.some((pattern) => {
    const p = pattern.split('.')
    return p.length === parts.length && p.every((seg, i) => seg === '*' ? /^\d+$/.test(parts[i]) : seg === parts[i])
  })
}
