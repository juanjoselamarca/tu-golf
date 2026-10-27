// src/lib/draft/upgrade-config.ts
import type { TournamentConfig } from './types'
import { normalizarTeamConfig } from './team-config-legacy'

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
    // team_config con la forma vieja (`handicap_pct`) se reescribe a la nueva
    // dentro de la v1: así el PATCH y la creación del torneo guardan la forma
    // nueva, sin arrastrar llaves viejas (team-config-legacy.ts).
    if (input.team_config) {
      return { ...input, team_config: normalizarTeamConfig(input.team_config) } as TournamentConfig
    }
    return input as TournamentConfig
  }

  // Aquí van las migraciones futuras (v0 → v1, v1 → v2, etc.)
  throw new Error(`Migración desde schema_version ${input.schema_version} no implementada`)
}
