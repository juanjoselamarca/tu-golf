// src/lib/draft/schema.ts
import { z } from 'zod'
import { HCP_PCT_OPCIONES, esHcpPctValido } from '@/golf/core/playing-handicap'
import { esPorcentajeDeEquipo } from '@/golf/formats/team-handicap'
import { normalizarTeamConfig } from './team-config-legacy'

export const tournamentFormatSchema = z.enum([
  'stroke_play', 'stableford', 'best_ball',
  'scramble', 'match_play', 'foursome',
])

export const scoringModeSchema = z.enum(['gross', 'neto'])

/** Handicap de juego: solo las opciones de la canónica (`HCP_PCT_OPCIONES`). */
export const hcpPctSchema = z.number().refine(esHcpPctValido, {
  message: `hcp_pct debe ser uno de ${HCP_PCT_OPCIONES.join(', ')}`,
})

const porcentajeSchema = z.number().refine(esPorcentajeDeEquipo, {
  message: 'El porcentaje debe ser un entero entre 0 y 100',
})

// Handicap del equipo (types.ts → TeamHandicapConfig). La forma correcta para
// cada formato (porcentajes en scramble, porcentaje_suma en foursome, largo =
// tamaño) la exige el validador de golf (`team_handicap_shape` /
// `team_handicap_pcts_length`), que conoce el formato. Por eso un
// `personalizado` todavía sin porcentajes (la IA lo propone sin números) pasa
// el schema y el validador pide completarlo, en vez de rechazar todo el turno.
export const teamHandicapConfigSchema = z.union([
  z.object({ modo: z.literal('oficial') }),
  z.object({ modo: z.literal('personalizado'), porcentajes: z.array(porcentajeSchema).min(2).max(4) }),
  z.object({ modo: z.literal('personalizado'), porcentaje_suma: porcentajeSchema }),
  // strict: con porcentajes fuera de rango NO debe caer aquí y perder el error.
  z.object({ modo: z.literal('personalizado') }).strict(),
])

const teamConfigObjectSchema = z.object({
  size: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  handicap: teamHandicapConfigSchema.optional(),
  min_drives_per_player: z.number().int().min(0).optional(),
  formation_mode: z.enum(['manual', 'random', 'by_handicap', 'players_choose']),
})

// Borradores y torneos viejos (`handicap_pct: 'usga_35_15' | …`) se convierten
// al leer: sin migración de JSONB (team-config-legacy.ts).
export const teamConfigSchema = z.preprocess(normalizarTeamConfig, teamConfigObjectSchema)
const teamConfigPartialSchema = z.preprocess(normalizarTeamConfig, teamConfigObjectSchema.partial())

export const matchPlayConfigSchema = z.object({
  bracket_mode: z.enum(['single_elimination', 'round_robin', 'one_vs_one']),
  // Retirado: Match Play reparte siempre el 100 % de la diferencia (ver types.ts).
  // Opcional para que los borradores viejos sigan validando.
  handicap_diff: z.enum(['full', 'three_quarters', 'none']).optional(),
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
  tee_assignment_mode: z.enum(['per_player', 'per_category', 'manual']),
  custom_si: z.record(z.string(), z.number().int().min(1).max(18)).optional(),
  notes: z.string().optional(),
})

// Campos opcionales que el wizard puede "borrar": aceptan `null` ("sin valor")
// además de ausentes. Protocolo: las secciones mandan `null` al limpiar, nunca
// `undefined` (JSON lo descarta y el server conservaría el valor viejo, que la
// respuesta del autosave haría reaparecer en pantalla — inbox c894c74c).
export const registrationConfigSchema = z.object({
  mode: z.enum(['open_with_code', 'invite_only', 'club_members_only']),
  code: z.string().optional(),
  deadline: z.string().nullable().optional(),
  max_players: z.number().int().positive().nullable().optional(),
})

export const prizeConfigSchema = z.object({
  id: z.string(),
  type: z.enum(['category_position', 'closest_to_pin', 'long_drive', 'special']),
  description: z.string().min(1),
  category_id: z.string().nullable().optional(),
  position: z.number().int().positive().nullable().optional(),
  hole_number: z.number().int().min(1).max(18).nullable().optional(),
  // Escala del premio para ranking-based prizes (`category_position`).
  // NULL/undefined = sin distinción. La normalización final (Match Play,
  // tipos no ranking-based) la hace `mapPrizeForInsert` antes del INSERT.
  kind: z.enum(['gross', 'neto']).nullable().optional(),
})

export const tournamentConfigSchema = z.object({
  schema_version: z.literal(1),
  name: z.string(),
  // Texto libre del wizard (textarea con maxLength 500). Vacío es válido:
  // borrar la descripción es un estado legítimo del borrador.
  description: z.string().max(500).optional(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  cover_image_url: z.string().url().nullable(),
  format: tournamentFormatSchema,
  modo: scoringModeSchema,
  use_handicap: z.boolean(),
  hcp_pct: hcpPctSchema.optional(),
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
// porque teamConfigSchema exige size + formation_mode. Esos campos
// requeridos se rellenan post-merge en fillMissingSubConfigs (regresion 047ca225).
// Marcas de items de lista en un partial (ver `list-markers.ts`). Sin
// declararlas, zod las descarta en silencio y el borrado nunca llega al server.
const listItemMarkersShape = {
  _delete: z.literal(true).optional(),
  _replace: z.literal(true).optional(),
}

export const tournamentConfigPartialSchema = z.object({
  schema_version: z.literal(1).optional(),
  name: z.string().optional(),
  description: z.string().max(500).optional(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  cover_image_url: z.string().url().nullable().optional(),
  format: tournamentFormatSchema.optional(),
  modo: scoringModeSchema.optional(),
  use_handicap: z.boolean().optional(),
  hcp_pct: hcpPctSchema.optional(),
  team_config: teamConfigPartialSchema.optional(),
  match_play_config: matchPlayConfigSchema.partial().optional(),
  stableford_config: stablefordConfigSchema.partial().optional(),
  categories: z.array(categoryConfigSchema.partial().extend(listItemMarkersShape)).optional(),
  rounds: z.array(roundConfigSchema.partial().extend(listItemMarkersShape)).optional(),
  registration: registrationConfigSchema.partial().optional(),
  prizes: z.array(prizeConfigSchema.partial().extend(listItemMarkersShape)).optional(),
  is_practice: z.boolean().optional(),
  pending_confirmations: z.array(z.string()).optional(),
})
