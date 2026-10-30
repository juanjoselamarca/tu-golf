/**
 * Los colores de tee del catálogo chileno, del más largo al más corto.
 *
 * FUENTE ÚNICA (regla "un concepto, una fuente"). La consumen:
 *  - el prompt de la celebración de import y el banner de /coach · /perfil
 *    (eligen `color`, que es lo que se guarda en `profiles.default_tee_color`),
 *  - `VALID_COLORS` del endpoint `/api/perfil/default-tee`,
 *  - el selector de tees de ronda libre cuando la cancha NO publica los suyos
 *    (usa `nombreCatalogo`, que es como los escribe `course_tees.nombre`).
 *
 * Son cinco, no cuatro: `dorado` está en 48 canchas activas del catálogo —
 * más que `negras` (34) — y dejarlo fuera obligaba al jugador a declarar un
 * tee que no jugó. Verificado contra prod el 30-oct-2026.
 */
export interface TeeColorOption {
  /** Valor canónico que se guarda en `profiles.default_tee_color`. */
  color: string
  /**
   * Nombre como lo escribe el catálogo de canchas (`course_tees.nombre`).
   * Difiere de `color` en negras, donde el perfil guarda el singular histórico
   * 'negro'; `canonicalColor` los hace equivalentes al resolver CR/slope.
   */
  nombreCatalogo: string
  /** Etiqueta visible. */
  label: string
  /** Color del swatch (CSS). */
  swatch: string
  /** Borde del swatch (para colores claros sobre fondo claro). */
  border?: string
}

export const TEE_COLOR_OPTIONS: TeeColorOption[] = [
  { color: 'negro', nombreCatalogo: 'negras', label: 'Negro', swatch: '#1f2937' },
  { color: 'dorado', nombreCatalogo: 'dorado', label: 'Dorado', swatch: '#c4992a' },
  { color: 'azul', nombreCatalogo: 'azul', label: 'Azul', swatch: '#2563eb' },
  { color: 'blanco', nombreCatalogo: 'blanco', label: 'Blanco', swatch: '#f8fafc', border: '#cbd5e1' },
  { color: 'rojo', nombreCatalogo: 'rojo', label: 'Rojo', swatch: '#dc2626' },
]

/** Los valores que acepta `profiles.default_tee_color`. */
export const TEE_COLOR_VALUES: string[] = TEE_COLOR_OPTIONS.map(o => o.color)

/**
 * Nombres de tee a ofrecer cuando la cancha no publica los suyos. Son nombres
 * del catálogo para que `resolvePlayerTee` los matchee si la cancha se carga
 * después.
 */
export const TEE_NAMES_GENERICOS: string[] = TEE_COLOR_OPTIONS.map(o => o.nombreCatalogo)
