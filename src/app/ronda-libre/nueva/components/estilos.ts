/**
 * Tokens del asistente de nueva ronda.
 *
 * `oro` es el oro de SUPERFICIE (fondos de botón activo, bordes, el toggle).
 * `oroTexto` es el oro de TEXTO, y son valores distintos a propósito: el
 * `#c4992a` sobre fondo claro da ~3.35:1 y reprueba WCAG AA, mientras que
 * `--brand-on-bg` está definido por tema para pasarlo. La página tenía `#c4992a`
 * hardcodeado como color de texto en el HCP de cada jugador, en los chips de
 * Stableford/Stroke y en la diferencia de handicap de Match Play.
 */
export const colores = {
  fondo: 'var(--bg)',
  tarjeta: 'var(--bg-surface)',
  borde: 'var(--border)',
  texto: 'var(--text)',
  texto2: 'var(--text-2)',
  texto3: 'var(--text-3)',
  oro: '#c4992a',
  oroTexto: 'var(--brand-on-bg, #8A6A16)',
  oroSobreTexto: 'var(--brand-dark)',
  oroTenue: 'rgba(196,153,42,0.06)',
  oroBorde: 'rgba(196,153,42,0.2)',
  inputFondo: 'var(--input-bg)',
  inputBorde: 'var(--input-border)',
  peligro: '#ef4444',
  aviso: '#d97706',
  ok: '#16a34a',
} as const

/** Tarjeta blanca estándar del asistente. */
export const tarjeta = {
  background: colores.tarjeta,
  border: `1px solid ${colores.borde}`,
  borderRadius: '16px',
  padding: '20px',
  marginBottom: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
} as const

/** Etiqueta de campo. */
export const etiqueta = {
  display: 'block',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: '13px',
  color: colores.texto2,
  marginBottom: '8px',
  fontWeight: 500,
} as const

/** Input de texto/número/fecha. */
export const input = {
  background: colores.inputFondo,
  border: `1px solid ${colores.inputBorde}`,
  color: colores.texto,
  borderRadius: '10px',
  padding: '10px 12px',
  fontSize: '15px',
  outline: 'none',
  boxSizing: 'border-box' as const,
  minHeight: '44px',
} as const

/** Botón de opción (formato, hoyos, tees…) en sus dos estados. */
export function opcion(activa: boolean) {
  return {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: activa ? `2px solid ${colores.oro}` : `1px solid ${colores.borde}`,
    background: activa ? colores.oroTenue : colores.tarjeta,
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.15s',
    WebkitTapHighlightColor: 'transparent',
  }
}

/** Botón primario (avanzar, crear). */
export function primario(deshabilitado: boolean) {
  return {
    padding: '14px',
    background: deshabilitado ? 'var(--bg)' : colores.oro,
    color: deshabilitado ? colores.texto3 : colores.oroSobreTexto,
    border: deshabilitado ? `1px solid ${colores.borde}` : 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 700,
    cursor: deshabilitado ? 'not-allowed' : 'pointer',
    boxShadow: deshabilitado ? 'none' : '0 2px 8px rgba(196,153,42,0.3)',
    transition: 'all 0.15s',
    WebkitTapHighlightColor: 'transparent',
  }
}

/** Botón secundario (volver). */
export const secundario = {
  flex: 1,
  padding: '14px',
  background: 'transparent',
  border: `1px solid ${colores.borde}`,
  borderRadius: '12px',
  color: colores.texto2,
  fontSize: '15px',
  fontWeight: 500,
  cursor: 'pointer',
} as const

/** Bloque informativo dorado (explicación de formato). */
export const informativo = {
  marginTop: '16px',
  padding: '12px 16px',
  borderRadius: '10px',
  background: colores.oroTenue,
  border: `1px solid rgba(196,153,42,0.15)`,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
} as const

/** Chip monoespaciado de la leyenda de puntajes. */
export const chip = {
  fontSize: '11px',
  fontFamily: '"DM Mono", monospace',
  color: colores.texto2,
  background: colores.tarjeta,
  border: `1px solid ${colores.oroBorde}`,
  borderRadius: '6px',
  padding: '3px 7px',
  whiteSpace: 'nowrap' as const,
} as const
