import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase', 'migrations')

/** Prod's schema as of 20261019200000, generated from its catalog. Every other migration is newer. */
export const BASELINE = '20261019200001_baseline.sql'

export const readMigration = (file: string) => readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')

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
