/**
 * Opciones de color de tee que se le ofrecen al jugador (las 4 del catálogo
 * chileno estándar). Fuente única para el prompt de la celebración de import
 * y el banner persistente de /coach · /perfil. Mantener alineado con
 * `VALID_COLORS` del endpoint `/api/perfil/default-tee`.
 */
export interface TeeColorOption {
  /** Valor canónico que se guarda en `profiles.default_tee_color`. */
  color: string
  /** Etiqueta visible. */
  label: string
  /** Color del swatch (CSS). */
  swatch: string
  /** Borde del swatch (para colores claros sobre fondo claro). */
  border?: string
}

export const TEE_COLOR_OPTIONS: TeeColorOption[] = [
  { color: 'negro', label: 'Negro', swatch: '#1f2937' },
  { color: 'azul', label: 'Azul', swatch: '#2563eb' },
  { color: 'blanco', label: 'Blanco', swatch: '#f8fafc', border: '#cbd5e1' },
  { color: 'rojo', label: 'Rojo', swatch: '#dc2626' },
]
