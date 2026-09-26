// src/golf/tournament-config-validator.ts
//
// Validador de reglas invariantes de golf para el config de un torneo en
// armado. NO valida estructura/tipos (eso lo hace el zod schema); valida
// reglas semánticas del deporte que la IA o el organizador podrían violar.
//
// Reglas implementadas:
// - team formats (scramble/best_ball/foursome) requieren team_config
// - match_play requiere match_play_config
// - match_play típicamente neto (warning, no error). Es el único formato
//   donde el modo es exclusivo: no se pueden mantener brackets paralelos
//   gross/neto porque la concesión de palos cambia quién gana cada hoyo.
// - stableford acepta gross ("Scratch Stableford") y neto — ambos válidos
//   USGA/R&A. El motor calcula los dos rankings en paralelo.
// - rondas con round_number duplicado son inválidas
// - debe haber al menos una ronda
// - stableford points_table tiene que ser monotónica
// - team_config.handicap_pct_custom debe estar en [0, 100]
// - fechas: dentro del margen, ronda 1 = inicio, rondas en orden
//   (`@/golf/tournament-fechas`, fuente única compartida con los inputs del wizard)
//
// `isReadyToCreate` = errors vacíos + name/date/courses completos.
import type { TournamentConfig } from '@/lib/draft/types'
import { rondasSonSecuenciales } from '@/lib/draft/rounds-defaults'
import { validarFechasDeTorneo } from './tournament-fechas'

export interface ValidationError {
  code: string
  field: string
  message: string
}

export interface ValidationResult {
  errors: ValidationError[]
  warnings: ValidationError[]
  isReadyToCreate: boolean
}

const TEAM_FORMATS: ReadonlySet<TournamentConfig['format']> = new Set<TournamentConfig['format']>([
  'best_ball',
  'scramble',
  'foursome',
])

export interface ValidateGolfRulesOptions {
  /** "Hoy" para juzgar las fechas. Inyectable para tests; default `new Date()`. */
  hoy?: Date
}

export function validateGolfRules(
  config: TournamentConfig,
  opts: ValidateGolfRulesOptions = {},
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []
  const hoy = opts.hoy ?? new Date()

  // ── Reglas invariantes por formato ─────────────────────────────────────
  if (TEAM_FORMATS.has(config.format) && !config.team_config) {
    errors.push({
      code: `${config.format}_requires_team_config`,
      field: 'team_config',
      message: `${config.format} requiere team_config (tamaño, % handicap, modo de formación)`,
    })
  }

  if (config.format === 'match_play' && !config.match_play_config) {
    errors.push({
      code: 'match_play_requires_config',
      field: 'match_play_config',
      message: 'match_play requiere match_play_config (bracket_mode, handicap_diff)',
    })
  }

  if (config.format === 'match_play' && config.modo === 'gross') {
    warnings.push({
      code: 'match_play_typically_neto',
      field: 'modo',
      message: 'Match Play típicamente se juega neto. Confirma si quieres gross.',
    })
  }

  // ── Rondas ─────────────────────────────────────────────────────────────
  const roundNumbers = new Set<number>()
  for (const r of config.rounds) {
    if (roundNumbers.has(r.round_number)) {
      errors.push({
        code: 'duplicate_round_number',
        field: 'rounds',
        message: `Hay dos rondas con round_number=${r.round_number}`,
      })
    }
    roundNumbers.add(r.round_number)
  }

  if (config.rounds.length === 0) {
    errors.push({
      code: 'no_rounds',
      field: 'rounds',
      message: 'Tiene que haber al menos una ronda',
    })
  } else if (roundNumbers.size === config.rounds.length && !rondasSonSecuenciales(config.rounds)) {
    // Sin duplicados pero con hueco ({1,3}): `total_rounds` sería 2 y la fila
    // round_number=3 no se jugaría nunca, mientras la "ronda 2" caería al
    // fallback de la cancha de la 1. Exactamente 1..N, sin excepciones.
    errors.push({
      code: 'rounds_not_sequential',
      field: 'rounds',
      message: 'Las rondas tienen que estar numeradas 1, 2, 3… sin saltos',
    })
  }

  // ── Fechas (inbox 891b0199 / f83156b1: 01-01-0001 llegaba a la base) ──
  errors.push(...validarFechasDeTorneo(config, hoy))

  // ── Categorías ─────────────────────────────────────────────────────────
  if (config.categories.length === 0) {
    warnings.push({
      code: 'no_categories',
      field: 'categories',
      message: 'Sin categorías el leaderboard será uno solo. ¿Es lo que quieres?',
    })
  }

  // ── Stableford points table monotónica ─────────────────────────────────
  if (config.format === 'stableford' && config.stableford_config) {
    const t = config.stableford_config.points_table
    if (t.par <= t.bogey || t.birdie <= t.par || t.eagle <= t.birdie) {
      errors.push({
        code: 'stableford_points_not_monotonic',
        field: 'stableford_config',
        message:
          'Puntos de Stableford deben ser monotónicos: doble < bogey < par < birdie < eagle < albatross',
      })
    }
  }

  // ── Team config sanity ────────────────────────────────────────────────
  if (config.team_config && config.team_config.handicap_pct === 'custom') {
    const c = config.team_config.handicap_pct_custom
    if (
      !c ||
      c.lower_pct < 0 ||
      c.lower_pct > 100 ||
      c.higher_pct < 0 ||
      c.higher_pct > 100
    ) {
      errors.push({
        code: 'team_handicap_custom_out_of_range',
        field: 'team_config.handicap_pct_custom',
        message: 'El % de handicap personalizado debe estar entre 0 y 100',
      })
    }
  }

  // ── ¿Listo para crear? ────────────────────────────────────────────────
  const isReadyToCreate =
    errors.length === 0 &&
    config.name.trim().length > 0 &&
    config.date_start !== null &&
    config.rounds.length > 0 &&
    config.rounds.every((r) => r.date !== null && r.course_id !== null)

  return { errors, warnings, isReadyToCreate }
}
