// src/lib/draft/schema.ts
import { z } from 'zod'

export const tournamentFormatSchema = z.enum([
  'stroke_play', 'stableford', 'best_ball',
  'scramble', 'match_play', 'foursome',
])

export const scoringModeSchema = z.enum(['gross', 'neto'])

export const teamConfigSchema = z.object({
  size: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  handicap_pct: z.enum(['usga_35_15', 'usga_25_15', 'simple_avg', 'custom']),
  handicap_pct_custom: z.object({
    lower_pct: z.number().min(0).max(100),
    higher_pct: z.number().min(0).max(100),
  }).optional(),
  min_drives_per_player: z.number().int().min(0).optional(),
  formation_mode: z.enum(['manual', 'random', 'by_handicap', 'players_choose']),
})

export const matchPlayConfigSchema = z.object({
  bracket_mode: z.enum(['single_elimination', 'round_robin', 'one_vs_one']),
  handicap_diff: z.enum(['full', 'three_quarters', 'none']),
  extra_holes_on_tie: z.boolean(),
})

export const stablefordConfigSchema = z.object({
  points_table: z.object({
    albatross_or_better: z.number().int(),
    eagle: z.number().int(),
    birdie: z.number().int(),
    par: z.number().int(),
    bogey: z.number().int(),
    double_or_worse: z.number().int(),
  }),
})

export const categoryConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  handicap_min: z.number().nullable(),
  handicap_max: z.number().nullable(),
  gender: z.enum(['male', 'female', 'mixed']).nullable(),
  age_min: z.number().int().optional(),
  age_max: z.number().int().optional(),
  default_tee_color: z.string().optional(),
})

export const roundConfigSchema = z.object({
  round_number: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  course_id: z.string().uuid().nullable(),
  hole_count: z.union([z.literal(9), z.literal(18)]),
  tee_assignment_mode: z.enum(['per_player', 'per_category']),
  custom_si: z.record(z.string(), z.number().int().min(1).max(18)).optional(),
  notes: z.string().optional(),
})

export const registrationConfigSchema = z.object({
  mode: z.enum(['open_with_code', 'invite_only', 'club_members_only']),
  code: z.string().optional(),
  deadline: z.string().optional(),
  max_players: z.number().int().positive().optional(),
})

export const prizeConfigSchema = z.object({
  id: z.string(),
  type: z.enum(['category_position', 'closest_to_pin', 'long_drive', 'special']),
  description: z.string().min(1),
  category_id: z.string().optional(),
  position: z.number().int().positive().optional(),
  hole_number: z.number().int().min(1).max(18).optional(),
})

export const tournamentConfigSchema = z.object({
  schema_version: z.literal(1),
  name: z.string(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  cover_image_url: z.string().url().nullable(),
  format: tournamentFormatSchema,
  modo: scoringModeSchema,
  use_handicap: z.boolean(),
  team_config: teamConfigSchema.optional(),
  match_play_config: matchPlayConfigSchema.optional(),
  stableford_config: stablefordConfigSchema.optional(),
  categories: z.array(categoryConfigSchema),
  rounds: z.array(roundConfigSchema),
  registration: registrationConfigSchema,
  prizes: z.array(prizeConfigSchema),
  is_practice: z.boolean(),
  pending_confirmations: z.array(z.string()),
})

// Schema partial: DEEP partial — cada sub-schema acepta tambien sub-objetos
// parciales. Sin esto, el LLM no puede mandar { team_config: { size: 2 } }
// porque teamConfigSchema exige handicap_pct + formation_mode. Esos campos
// requeridos se rellenan post-merge en fillMissingSubConfigs (regresion 047ca225).
export const tournamentConfigPartialSchema = z.object({
  schema_version: z.literal(1).optional(),
  name: z.string().optional(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  cover_image_url: z.string().url().nullable().optional(),
  format: tournamentFormatSchema.optional(),
  modo: scoringModeSchema.optional(),
  use_handicap: z.boolean().optional(),
  team_config: teamConfigSchema.partial().optional(),
  match_play_config: matchPlayConfigSchema.partial().optional(),
  stableford_config: stablefordConfigSchema.partial().optional(),
  categories: z.array(categoryConfigSchema.partial()).optional(),
  rounds: z.array(roundConfigSchema.partial()).optional(),
  registration: registrationConfigSchema.partial().optional(),
  prizes: z.array(prizeConfigSchema.partial()).optional(),
  is_practice: z.boolean().optional(),
  pending_confirmations: z.array(z.string()).optional(),
})
