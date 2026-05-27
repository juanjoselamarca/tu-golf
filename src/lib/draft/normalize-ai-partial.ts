// src/lib/draft/normalize-ai-partial.ts
//
// Capa de defensa: el modelo Haiku 4.5 a veces traduce valores literales del
// schema (ej. "neto" → "net", "stroke_play" → "stroke") por sesgo a inglés
// o por aproximaciones. El schema zod rechaza esas variantes con z.enum,
// y el endpoint responde 502 "IA propuso campos inválidos" → la UI muestra
// "El asistente no pudo procesar eso, reformulá" → el organizador ve la
// feature como rota.
//
// Esta función mapea variantes conocidas a los valores canónicos del schema
// ANTES de validar con zod. No inventa campos: si una variante no está en la
// tabla, se deja como vino (zod luego la rechaza con el mismo error que antes).
//
// Reglas:
// - Solo coerciona campos enumerados con sinónimos comunes. No toca números,
//   strings libres (nombres, descripciones) ni objetos anidados que no estén
//   listados explícitamente.
// - Es idempotente: aplicar dos veces produce el mismo resultado.
// - No muta el input.

type Json = unknown

const MODO_SYNONYMS: Record<string, 'gross' | 'neto'> = {
  net: 'neto',
  netto: 'neto',
  neto: 'neto',
  scratch: 'gross',
  gross: 'gross',
  raw: 'gross',
}

const FORMAT_SYNONYMS: Record<string, string> = {
  stroke: 'stroke_play',
  stroke_play: 'stroke_play',
  strokeplay: 'stroke_play',
  medal: 'stroke_play',
  stableford: 'stableford',
  best_ball: 'best_ball',
  bestball: 'best_ball',
  fourball: 'best_ball',
  four_ball: 'best_ball',
  scramble: 'scramble',
  match_play: 'match_play',
  matchplay: 'match_play',
  match: 'match_play',
  foursome: 'foursome',
  greensome: 'foursome',
}

const HANDICAP_PCT_SYNONYMS: Record<string, 'usga_35_15' | 'usga_25_15' | 'simple_avg' | 'custom'> = {
  usga_35_15: 'usga_35_15',
  usga_25_15: 'usga_25_15',
  simple_avg: 'simple_avg',
  average: 'simple_avg',
  promedio: 'simple_avg',
  custom: 'custom',
  manual: 'custom',
}

const FORMATION_MODE_SYNONYMS: Record<string, 'manual' | 'random' | 'by_handicap' | 'players_choose'> = {
  manual: 'manual',
  random: 'random',
  aleatorio: 'random',
  by_handicap: 'by_handicap',
  por_handicap: 'by_handicap',
  handicap: 'by_handicap',
  players_choose: 'players_choose',
  jugadores: 'players_choose',
}

const BRACKET_MODE_SYNONYMS: Record<string, 'single_elimination' | 'round_robin' | 'one_vs_one'> = {
  single_elimination: 'single_elimination',
  eliminacion: 'single_elimination',
  elimination: 'single_elimination',
  bracket: 'single_elimination',
  round_robin: 'round_robin',
  todos_contra_todos: 'round_robin',
  one_vs_one: 'one_vs_one',
  uno_contra_uno: 'one_vs_one',
  cabeza_a_cabeza: 'one_vs_one',
}

const HANDICAP_DIFF_SYNONYMS: Record<string, 'full' | 'three_quarters' | 'none'> = {
  full: 'full',
  completo: 'full',
  three_quarters: 'three_quarters',
  '3_4': 'three_quarters',
  '3/4': 'three_quarters',
  none: 'none',
  ninguno: 'none',
}

const REGISTRATION_MODE_SYNONYMS: Record<string, 'open_with_code' | 'invite_only' | 'club_members_only'> = {
  open_with_code: 'open_with_code',
  open: 'open_with_code',
  abierto: 'open_with_code',
  invite_only: 'invite_only',
  invite: 'invite_only',
  invitacion: 'invite_only',
  club_members_only: 'club_members_only',
  club: 'club_members_only',
  socios: 'club_members_only',
}

const GENDER_SYNONYMS: Record<string, 'male' | 'female' | 'mixed'> = {
  male: 'male',
  masculino: 'male',
  varones: 'male',
  varon: 'male',
  hombre: 'male',
  female: 'female',
  femenino: 'female',
  damas: 'female',
  mujer: 'female',
  mixed: 'mixed',
  mixto: 'mixed',
}

const PRIZE_TYPE_SYNONYMS: Record<string, 'category_position' | 'closest_to_pin' | 'long_drive' | 'special'> = {
  category_position: 'category_position',
  categoria: 'category_position',
  position: 'category_position',
  closest_to_pin: 'closest_to_pin',
  closest: 'closest_to_pin',
  ctp: 'closest_to_pin',
  long_drive: 'long_drive',
  ld: 'long_drive',
  special: 'special',
  especial: 'special',
}

const TEE_ASSIGNMENT_MODE_SYNONYMS: Record<string, 'per_player' | 'per_category'> = {
  per_player: 'per_player',
  por_jugador: 'per_player',
  per_category: 'per_category',
  por_categoria: 'per_category',
}

function coerceEnum<T extends string>(value: unknown, table: Record<string, T>): unknown {
  if (typeof value !== 'string') return value
  const key = value.trim().toLowerCase()
  return table[key] ?? value
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Formats que requieren team_config en el schema FULL. Si el LLM trae uno de estos
// como format Y no completó team_config, el merge produce un config FULL inválido.
const TEAM_FORMATS = new Set(['scramble', 'best_ball', 'foursome'])

// Defaults sensatos cuando el LLM provee team_config parcial o cuando solo eligió
// un team format. Sin estos, el FULL schema rechaza y la UI muestra "El asistente
// no pudo procesar eso" (regresion inbox 047ca225).
const TEAM_CONFIG_DEFAULTS = {
  size: 2 as const,
  handicap_pct: 'usga_35_15' as const,
  formation_mode: 'manual' as const,
}

const MATCH_PLAY_CONFIG_DEFAULTS = {
  bracket_mode: 'single_elimination' as const,
  handicap_diff: 'full' as const,
  extra_holes_on_tie: false as const,
}

const ROUND_DEFAULTS = {
  tee_assignment_mode: 'per_player' as const,
  hole_count: 18 as const,
}

function autocompleteSubConfigs(out: Record<string, unknown>): void {
  // team_config: completar con defaults si format es team-based o si team_config viene parcial.
  const needsTeam =
    typeof out.format === 'string' && TEAM_FORMATS.has(out.format)
  const hasTeamPartial = isPlainObject(out.team_config)
  if (needsTeam || hasTeamPartial) {
    out.team_config = {
      ...TEAM_CONFIG_DEFAULTS,
      ...(hasTeamPartial ? (out.team_config as Record<string, unknown>) : {}),
    }
  }

  // match_play_config: idem para match_play.
  const needsMP = out.format === 'match_play'
  const hasMPPartial = isPlainObject(out.match_play_config)
  if (needsMP || hasMPPartial) {
    out.match_play_config = {
      ...MATCH_PLAY_CONFIG_DEFAULTS,
      ...(hasMPPartial ? (out.match_play_config as Record<string, unknown>) : {}),
    }
  }

  // rounds: completar tee_assignment_mode y hole_count si vienen sin ellos.
  // El merge por round_number combina, pero un round NUEVO debe traer requireds completos.
  if (Array.isArray(out.rounds)) {
    out.rounds = (out.rounds as unknown[]).map((r) => {
      if (!isPlainObject(r)) return r
      const rr: Record<string, unknown> = { ...r }
      if (!('tee_assignment_mode' in rr)) rr.tee_assignment_mode = ROUND_DEFAULTS.tee_assignment_mode
      if (!('hole_count' in rr)) rr.hole_count = ROUND_DEFAULTS.hole_count
      // round_number es required pero NO defaulteable — el merge por round_number lo necesita
      // como key. Si falta, se deja faltante y zod lo rechaza con mensaje claro.
      return rr
    })
  }
}

export function normalizeAiConfigPartial(raw: Json): Json {
  if (!isPlainObject(raw)) return raw

  const out: Record<string, unknown> = { ...raw }

  if ('modo' in out) out.modo = coerceEnum(out.modo, MODO_SYNONYMS)
  if ('format' in out) out.format = coerceEnum(out.format, FORMAT_SYNONYMS)

  if (isPlainObject(out.team_config)) {
    const tc = { ...out.team_config }
    if ('handicap_pct' in tc) tc.handicap_pct = coerceEnum(tc.handicap_pct, HANDICAP_PCT_SYNONYMS)
    if ('formation_mode' in tc) tc.formation_mode = coerceEnum(tc.formation_mode, FORMATION_MODE_SYNONYMS)
    out.team_config = tc
  }

  if (isPlainObject(out.match_play_config)) {
    const mpc = { ...out.match_play_config }
    if ('bracket_mode' in mpc) mpc.bracket_mode = coerceEnum(mpc.bracket_mode, BRACKET_MODE_SYNONYMS)
    if ('handicap_diff' in mpc) mpc.handicap_diff = coerceEnum(mpc.handicap_diff, HANDICAP_DIFF_SYNONYMS)
    out.match_play_config = mpc
  }

  if (isPlainObject(out.registration)) {
    const reg = { ...out.registration }
    if ('mode' in reg) reg.mode = coerceEnum(reg.mode, REGISTRATION_MODE_SYNONYMS)
    out.registration = reg
  }

  if (Array.isArray(out.categories)) {
    out.categories = (out.categories as unknown[]).map(c => {
      if (!isPlainObject(c)) return c
      const cc = { ...c }
      if ('gender' in cc && cc.gender !== null) cc.gender = coerceEnum(cc.gender, GENDER_SYNONYMS)
      return cc
    })
  }

  if (Array.isArray(out.rounds)) {
    out.rounds = (out.rounds as unknown[]).map(r => {
      if (!isPlainObject(r)) return r
      const rr = { ...r }
      if ('tee_assignment_mode' in rr) rr.tee_assignment_mode = coerceEnum(rr.tee_assignment_mode, TEE_ASSIGNMENT_MODE_SYNONYMS)
      return rr
    })
  }

  if (Array.isArray(out.prizes)) {
    out.prizes = (out.prizes as unknown[]).map(p => {
      if (!isPlainObject(p)) return p
      const pp = { ...p }
      if ('type' in pp) pp.type = coerceEnum(pp.type, PRIZE_TYPE_SYNONYMS)
      return pp
    })
  }

  // Defense in depth: completar sub-configs requeridos cuando el LLM solo trae el
  // format/tipo sin los campos secundarios. Sin esto, el merge sobre un initial
  // config que no los tenia produce un FULL config invalido. Regresion inbox 047ca225.
  autocompleteSubConfigs(out)

  return out
}
