// src/lib/draft/upgrade-config.ts
import type { TournamentConfig } from './types'

export const CURRENT_SCHEMA_VERSION = 1 as const

type AnyConfig = Partial<TournamentConfig> & { schema_version?: number }

/**
 * Migra config de schema viejo a CURRENT_SCHEMA_VERSION.
 * Cuando agreguemos schema_version 2, agregamos un case más acá.
 */
export function upgradeConfig(input: AnyConfig): TournamentConfig {
  if (typeof input.schema_version !== 'number') {
    throw new Error('Config sin schema_version, no se puede migrar')
  }

  if (input.schema_version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Config con schema_version ${input.schema_version} es futura, este código solo soporta hasta ${CURRENT_SCHEMA_VERSION}`)
  }

  if (input.schema_version === CURRENT_SCHEMA_VERSION) {
    return input as TournamentConfig
  }

  // Aquí van las migraciones futuras (v0 → v1, v1 → v2, etc.)
  throw new Error(`Migración desde schema_version ${input.schema_version} no implementada`)
}
