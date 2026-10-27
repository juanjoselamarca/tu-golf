// src/lib/draft/team-config-legacy.fixtures.ts
//
// Solo para tests: `team_config` con la forma VIEJA, tal como quedó guardado en
// borradores y torneos anteriores a la decisión del 23-oct-2026. Los nombres de
// los métodos viejos viven acá y en `team-config-legacy.ts` (que los convierte
// al leer); ningún otro archivo los escribe.

/** Parejas con el método viejo "USGA 35/15" → se lee como oficial. */
export const TEAM_CONFIG_VIEJO_PAREJA_OFICIAL = { size: 2, handicap_pct: 'usga_35_15', formation_mode: 'random' }

/** Tríos con el método viejo "USGA 25/15" (eliminado) → se lee como oficial. */
export const TEAM_CONFIG_VIEJO_TRIO_25_15 = { size: 3, handicap_pct: 'usga_25_15', formation_mode: 'random' }

/** Parejas con el personalizado viejo 60/40 → se lee como personalizado [60, 40]. */
export const TEAM_CONFIG_VIEJO_PAREJA_CUSTOM = {
  size: 2,
  handicap_pct: 'custom',
  handicap_pct_custom: { lower_pct: 60, higher_pct: 40 },
  formation_mode: 'manual',
}
