// src/lib/draft/fill-missing-sub-configs.ts
//
// Defense in depth FINAL (post-merge) del flow del asistente IA.
//
// Por que post-merge y no en normalize-ai-partial:
//   Si el normalize agregaba defaults a un partial que despues se merge con un
//   base que YA tenia esos campos configurados, los defaults pisaban silenciosamente
//   los valores del organizador (multi-turno). Para ver fallar el merge:
//     base.team_config = { size:2, handicap_pct:'simple_avg', formation_mode:'random' }
//     partial = { team_config: { size: 4 } } + autocomplete → handicap_pct/formation_mode default
//     merge { ...base, ...partial } sobrescribe handicap_pct con 'usga_35_15'.
//   Movemos la responsabilidad a aca: solo rellenamos campos AUSENTES en el config
//   FUSIONADO, nunca tocamos campos que ya existen sin importar quien los puso.
//
// Que rellena:
//   - team_config: cuando format es scramble|best_ball|foursome
//   - match_play_config: cuando format es match_play
//   - rounds[].tee_assignment_mode + hole_count
//
// Cada relleno se reporta en el array de paths devuelto para que el caller lo
// agregue a pending_confirmations (el organizador ve un badge "Confirmá esto").

import type { TournamentConfig } from './types'

const TEAM_FORMATS = new Set(['scramble', 'best_ball', 'foursome'])

const TEAM_CONFIG_DEFAULTS = {
  size: 2,
  handicap_pct: 'usga_35_15',
  formation_mode: 'manual',
} as const

const MATCH_PLAY_CONFIG_DEFAULTS = {
  bracket_mode: 'single_elimination',
  handicap_diff: 'full',
  extra_holes_on_tie: false,
} as const

const ROUND_DEFAULTS = {
  tee_assignment_mode: 'per_player',
  hole_count: 18,
} as const

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Rellena en place los sub-configs requeridos por el FULL schema cuando el merge
 * los dejo ausentes o incompletos. Mutates `config`. Devuelve los paths
 * autocompletados para que el caller los agregue a `pending_confirmations`.
 */
export function fillMissingSubConfigs(config: TournamentConfig): string[] {
  const autoFilled: string[] = []
  const cfg = config as unknown as Record<string, unknown>

  // team_config: solo cuando format implica team-based.
  if (typeof cfg.format === 'string' && TEAM_FORMATS.has(cfg.format)) {
    if (!isPlainObject(cfg.team_config)) {
      cfg.team_config = { ...TEAM_CONFIG_DEFAULTS }
      autoFilled.push('team_config.size', 'team_config.handicap_pct', 'team_config.formation_mode')
    } else {
      const tc = cfg.team_config
      for (const [k, def] of Object.entries(TEAM_CONFIG_DEFAULTS)) {
        if (!(k in tc) || tc[k] === undefined) {
          tc[k] = def
          autoFilled.push(`team_config.${k}`)
        }
      }
    }
  }

  // match_play_config: solo cuando format es match_play.
  if (cfg.format === 'match_play') {
    if (!isPlainObject(cfg.match_play_config)) {
      cfg.match_play_config = { ...MATCH_PLAY_CONFIG_DEFAULTS }
      autoFilled.push(
        'match_play_config.bracket_mode',
        'match_play_config.handicap_diff',
        'match_play_config.extra_holes_on_tie'
      )
    } else {
      const mpc = cfg.match_play_config
      for (const [k, def] of Object.entries(MATCH_PLAY_CONFIG_DEFAULTS)) {
        if (!(k in mpc) || mpc[k] === undefined) {
          mpc[k] = def
          autoFilled.push(`match_play_config.${k}`)
        }
      }
    }
  }

  // rounds: cada round necesita tee_assignment_mode y hole_count.
  if (Array.isArray(cfg.rounds)) {
    cfg.rounds.forEach((r, idx) => {
      if (!isPlainObject(r)) return
      for (const [k, def] of Object.entries(ROUND_DEFAULTS)) {
        if (!(k in r) || r[k] === undefined) {
          r[k] = def
          autoFilled.push(`rounds[${idx}].${k}`)
        }
      }
    })
  }

  return autoFilled
}
