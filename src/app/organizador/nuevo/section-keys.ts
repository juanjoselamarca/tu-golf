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
} as const satisfies Record<string, readonly RootKey[]>
