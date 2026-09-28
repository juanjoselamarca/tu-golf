// src/lib/draft/duplicate-config.ts
//
// Config inicial de un borrador duplicado desde un torneo ya jugado. Los
// valores que vienen de la tabla `tournaments` (format, modo_juego) se
// normalizan contra el schema del borrador: un valor legacy o mal escrito
// caería en "base inválida" y bloquearía el autosave de campos que la UI no
// permite editar. La route solo hace I/O.

import { createInitialConfig } from './initial-config'
import { scoringModeSchema, tournamentFormatSchema } from './schema'
import type { TournamentConfig } from './types'

export interface SourceTournament {
  format: string | null
  modo_juego: string | null
  use_handicap: boolean | null
  course_id: string | null
  hole_count: number | null
}

export interface SourceCategory {
  name: string
  handicap_min: number | null
  handicap_max: number | null
}

export function configFromTournament(
  src: SourceTournament,
  categories: SourceCategory[],
  newId: () => string = () => crypto.randomUUID(),
): TournamentConfig {
  const config = createInitialConfig()
  const format = tournamentFormatSchema.safeParse(src.format)
  config.format = format.success ? format.data : 'stroke_play'
  const modo = scoringModeSchema.safeParse(src.modo_juego)
  config.modo = modo.success ? modo.data : 'gross'
  config.use_handicap = !!src.use_handicap
  if (categories.length > 0) {
    config.categories = categories.map((c) => ({
      id: newId(),
      name: c.name,
      handicap_min: c.handicap_min,
      handicap_max: c.handicap_max,
      gender: null,
    }))
  }
  config.rounds[0].course_id = src.course_id
  config.rounds[0].hole_count = src.hole_count === 9 ? 9 : 18
  // name, date_start, registration.code: vacíos (forzar al organizador a setearlos)
  config.name = ''
  config.date_start = null
  config.rounds[0].date = null
  return config
}
