// src/lib/draft/fill-missing-sub-configs.ts
//
// Defense in depth FINAL (post-merge) del flow del asistente IA.
//
// Por que post-merge y no en normalize-ai-partial:
//   Si el normalize agregaba defaults a un partial que despues se merge con un
//   base que YA tenia esos campos configurados, los defaults pisaban silenciosamente
//   los valores del organizador (multi-turno). Para ver fallar el merge:
//     base.team_config = { size:2, handicap:{ modo:'personalizado', … }, formation_mode:'random' }
//     partial = { team_config: { size: 4 } } + autocomplete → handicap/formation_mode default
//     merge { ...base, ...partial } sobrescribe el handicap personalizado con el oficial.
//   Movemos la responsabilidad a aca: solo rellenamos campos AUSENTES en el config
//   FUSIONADO, nunca tocamos campos que ya existen sin importar quien los puso.
//
// Que rellena:
//   - team_config: cuando format es scramble|best_ball|foursome. El handicap
//     del equipo solo en bola compartida (scramble|foursome): best ball no lo usa.
//   - match_play_config: cuando format es match_play
//   - rounds[].tee_assignment_mode + hole_count
//
// Cada relleno se reporta en el array de paths devuelto para que el caller lo
// agregue a pending_confirmations (el organizador ve un badge "Confirmá esto").

import type { TournamentConfig } from './types'
import { isTeamFormat, isSharedBallFormat } from '@/golf/formats'
import { normalizarTeamConfig } from './team-config-legacy'

const TEAM_CONFIG_DEFAULTS = {
  size: 2,
  formation_mode: 'manual',
} as const

const TEAM_HANDICAP_DEFAULT = { modo: 'oficial' } as const

const MATCH_PLAY_CONFIG_DEFAULTS = {
  bracket_mode: 'single_elimination',
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
  if (typeof cfg.format === 'string' && isTeamFormat(cfg.format)) {
    const defaults: Record<string, unknown> = isSharedBallFormat(cfg.format)
      ? { size: TEAM_CONFIG_DEFAULTS.size, handicap: { ...TEAM_HANDICAP_DEFAULT }, formation_mode: TEAM_CONFIG_DEFAULTS.formation_mode }
      : { ...TEAM_CONFIG_DEFAULTS }
    // Forma vieja (`handicap_pct`) → nueva ANTES de rellenar: si no, el
    // default oficial taparía un personalizado viejo.
    cfg.team_config = normalizarTeamConfig(cfg.team_config)
    if (!isPlainObject(cfg.team_config)) {
      cfg.team_config = { ...defaults }
      autoFilled.push(...Object.keys(defaults).map((k) => `team_config.${k}`))
    } else {
      const tc = cfg.team_config
      for (const [k, def] of Object.entries(defaults)) {
        if (!(k in tc) || tc[k] === undefined) {
          tc[k] = isPlainObject(def) ? { ...def } : def
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
