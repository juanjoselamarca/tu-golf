/**
 * Canary: every migration has a yyyyMMddHHmmss version the Supabase CLI applies, and only once.
 *
 * `supabase db push` takes the digits before the first `_` as the version. A file that
 * does not match `<digits>_<name>.sql` is skipped with a warning and the push still
 * succeeds; with a repeated version it applies the first file and fails on the second.
 * `supabase migration new` names files this way. A migration older than the baseline would run
 * before it when a database is built from these files, on tables that do not exist yet.
 */
import { readdirSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { BASELINE, MIGRATIONS_DIR } from './helpers/migration-sql'
// El formato que acepta la CLI vive en un .mjs que comparten este canario y verify-db-schema.
import { NOMBRE_MIGRACION_CLI as CLI_NAME, versionesRepetidas } from '../../scripts/lib/nombre-migracion.mjs'

const entries = readdirSync(MIGRATIONS_DIR).filter(entry => entry !== 'rollback' && !entry.startsWith('.'))

describe('migration file names', () => {
  it('match <yyyyMMddHHmmss>_<name>.sql', () => {
    expect(entries.filter(entry => !CLI_NAME.test(entry))).toEqual([])
  })

  it('have unique versions', () => {
    // Mismo predicado que el check de CI (scripts/ci/migraciones-inmutables.mjs --arbol).
    expect(versionesRepetidas(entries)).toEqual([])
  })

  it('are not older than the baseline', () => {
    expect(entries).toContain(BASELINE)
    expect(entries.filter(entry => entry < BASELINE)).toEqual([])
  })
})
