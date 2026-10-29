import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase', 'migrations')

/** Prod's schema as of 20261019200000, generated from its catalog. Every other migration is newer. */
export const BASELINE = '20261019200001_baseline.sql'

// En Windows (core.autocrlf) el checkout trae CRLF: se normaliza a LF para que las regex
// con saltos de línea lean lo mismo que en el CI.
export const readMigration = (file: string) =>
  readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/\r\n/g, '\n')

/** Top-level migrations (rollback/ excluded). */
export const migrationFiles = () => readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))

export const stripSqlComments = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

/** Regex source for a public object name, with or without schema, quoted or not. */
export const sqlIdentifier = (name: string) => String.raw`(?:"?public"?\.)?"?${name}"?(?!\w)`

/** From the last CREATE FUNCTION <name>( in `sql` to the next function definition or the end. */
export function functionDefinition(sql: string, name: string): string | undefined {
  const own = [...sql.matchAll(new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+${sqlIdentifier(name)}\s*\(`, 'gi'))].at(-1)
  if (!own) return undefined
  const next = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s/gi)].find(m => m.index > own.index)
  return sql.slice(own.index, next?.index)
}

/** Roles a request with the anon key or a user session runs as (PUBLIC applies to both). */
export const CLIENT_ROLES = ['public', 'anon', 'authenticated']

/** Regex source for ALL TABLES / ALL FUNCTIONS IN SCHEMA public, quoted or not. */
export const sqlAllInSchemaPublic = (kind: 'tables' | 'functions') => String.raw`all\s+${kind}\s+in\s+schema\s+"?public"?(?!\w)`

/**
 * Columns of ronda_libre_jugadores that anon and authenticated cannot SELECT. Single source for the
 * repo canary (canary-column-select, which also pins that the migrations declare exactly these) and
 * the prod canary (prod/rls-public-read).
 */
export const RONDA_LIBRE_JUGADORES_PRIVATE_COLUMNS: readonly string[] = ['perfil_sugerido_id', 'telefono_invitado']

/**
 * The tables /torneo/[slug] and /api/ronda-libre/[codigo]/live read without a session, and the only columns
 * anon can SELECT on each (20261027120000_anon_columnas_vistas_publicas). A column a public view starts reading
 * goes here and in its migration's GRANT SELECT (col) ... TO anon. Checked against supabase/schema.sql by
 * canary-anon-columns and in prod by prod/rls-public-read.
 */
export const ANON_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  hole_scores: ['id', 'round_id', 'hole_number', 'par', 'gross_score', 'net_score', 'points', 'putts', 'fairway_hit', 'gir'],
  players: [
    'id', 'tournament_id', 'user_id', 'category_id', 'handicap_at_registration', 'status', 'created_at', 'status_reason',
    'pending_user_id', 'player_name', 'tee_id', 'genero',
  ],
  rounds: ['id', 'tournament_id', 'player_id', 'status', 'total_gross', 'total_net', 'total_points', 'closed_at', 'round_number'],
  tournament_groups: ['id', 'tournament_id', 'name', 'tee_time', 'ronda_libre_id', 'sort_order'],
  tournament_group_players: ['id', 'group_id', 'player_id', 'jugador_ronda_id'],
  rondas_libres: [
    'id', 'codigo', 'creador_id', 'course_id', 'course_name', 'tees', 'holes', 'fecha', 'estado', 'created_at', 'modo_juego',
    'hoyo_inicio', 'admin_mode', 'admin_user_id', 'recorridos', 'formato_juego', 'es_demo', 'hcp_pct',
  ],
  ronda_libre_jugadores: ['id', 'ronda_id', 'nombre', 'user_id', 'scores', 'handicap', 'tees'],
  ronda_equipos: ['id', 'ronda_id', 'nombre', 'handicap_equipo', 'scores', 'created_at', 'handicap_equipo_juego'],
  ronda_equipo_jugadores: ['equipo_id', 'jugador_id', 'orden'],
}

/**
 * Every column anon can SELECT where it has no table-level SELECT: the public views (ANON_COLUMNS) and profiles
 * (20261029200000_anon_restos_capa3). No policy shows anon a profiles row, but PostgREST checks the column privilege
 * of what /ranking, /api/health and the tournament embeds (players -> profiles) select. Checked against
 * supabase/schema.sql by canary-anon-columns and in prod by prod/rls-public-read.
 */
export const ANON_COLUMN_SELECT: Readonly<Record<string, readonly string[]>> = {
  ...ANON_COLUMNS,
  profiles: ['avatar_url', 'id', 'indice', 'indice_golfers', 'name', 'nivel'],
}

/**
 * The only table-level privileges anon has in public (20261029120000_anon_sin_permisos_de_tabla): SELECT on what
 * runs without a session reads, INSERT on the browser's analytics and error logs. Apart from these, anon only has
 * the column SELECT of ANON_COLUMN_SELECT and no sequence privilege. A table a page without a session starts
 * reading goes here and in its migration's GRANT ... TO anon. Checked against supabase/schema.sql by
 * canary-anon-table-privileges and in prod by prod/rls-public-read.
 */
export const ANON_TABLE_PRIVILEGES: Readonly<Record<string, readonly string[]>> = {
  analytics_events: ['INSERT'],
  categories: ['SELECT'],
  course_holes: ['SELECT'],
  course_tees: ['SELECT'],
  courses: ['SELECT'],
  error_logs: ['INSERT'],
  historical_rounds: ['SELECT'],
  tournament_rounds: ['SELECT'],
  tournaments: ['SELECT'],
}

/**
 * Splits SQL into statements on `;`. String literals stay whole; with `insideBodies` the `;` inside
 * dollar-quoted function bodies also split (one chunk per statement of the body), without it a whole
 * CREATE FUNCTION is one statement.
 */
export function sqlStatements(sql: string, { insideBodies = false } = {}): string[] {
  const out: string[] = []
  let start = 0
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === "'") {
      const end = sql.indexOf("'", i + 1)
      i = end === -1 ? sql.length : end
    } else if (sql[i] === '$' && !insideBodies && !/\w/.test(sql[i - 1] ?? '')) {
      const tag = /^\$\w*\$/.exec(sql.slice(i))?.[0]
      if (!tag) continue
      const end = sql.indexOf(tag, i + tag.length)
      i = end === -1 ? sql.length : end + tag.length - 1
    } else if (sql[i] === ';') {
      out.push(sql.slice(start, i))
      start = i + 1
    }
  }
  out.push(sql.slice(start))
  return out.map(s => s.trim()).filter(Boolean)
}
