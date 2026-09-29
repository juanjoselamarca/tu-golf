// src/app/organizador/nuevo/tournament-templates.ts
//
// Plantillas de arranque rápido del wizard ("Empezar con plantilla").
// Cada una fija formato + modo + hoyos de la primera ronda sobre un borrador
// recién creado. Las keys de formato están escritas acá (el nombre y la
// descripción son copy propio del wizard, no los del registry); el test
// `tournament-templates.test.ts` verifica que todas existan en
// `KNOWN_FORMAT_KEYS` de `src/golf/formats`.

import type { TournamentConfig, TournamentFormat, ScoringMode } from '@/lib/draft/types'

export interface TournamentTemplate {
  name: string
  description: string
  format: TournamentFormat
  modo: ScoringMode
  holes: 9 | 18
}

export const TOURNAMENT_TEMPLATES: TournamentTemplate[] = [
  { name: 'Stroke Play 18 hoyos', description: 'El clásico: golpes netos sobre 18 hoyos', format: 'stroke_play', modo: 'neto', holes: 18 },
  { name: 'Stableford 18 hoyos', description: 'Puntos por hoyo, ideal para todos los niveles', format: 'stableford', modo: 'neto', holes: 18 },
  { name: 'Scramble equipos', description: 'Mejor tiro del equipo, diversión garantizada', format: 'scramble', modo: 'neto', holes: 18 },
  { name: 'Best Ball parejas', description: 'Cada jugador su bola, cuenta la mejor', format: 'best_ball', modo: 'neto', holes: 18 },
  { name: 'Match Play 1v1', description: 'Hoyo a hoyo, mano a mano', format: 'match_play', modo: 'neto', holes: 18 },
]

/**
 * Partial que aplica una plantilla sobre la config actual del borrador.
 * Solo toca la primera ronda si su cantidad de hoyos difiere de la plantilla.
 */
export function templateToPartial(
  template: TournamentTemplate,
  config: TournamentConfig,
): Partial<TournamentConfig> {
  const partial: Partial<TournamentConfig> = {
    format: template.format,
    modo: template.modo,
  }
  if (config.rounds.length > 0 && config.rounds[0].hole_count !== template.holes) {
    partial.rounds = config.rounds.map((r, i) =>
      i === 0 ? { ...r, hole_count: template.holes } : r,
    )
  }
  return partial
}
