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
  ok: 'var(--status-live-fg)',
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

/** Ajuste del `input` para el índice de cada jugador: angosto, pero sin bajar
 *  de 44px (touch con guante) ni de 16px (bajo 16px iOS hace zoom al enfocar).
 *  Un índice es un dato → DM Mono (DESIGN.md §4). */
export const inputNumerico = {
  width: '90px',
  padding: '8px 12px',
  fontSize: '16px',
  fontFamily: 'var(--font-dm-mono), monospace',
} as const

/** Borde del índice que no deja avanzar el paso (a medio escribir o inválido): 2px en el color de error, para
 *  que se vea al sol cuál de las tarjetas es la que el aviso bajo el botón está nombrando. */
export const inputQueBloquea = {
  border: '1px solid var(--error-fg)',
  boxShadow: 'inset 0 0 0 1px var(--error-fg)',
} as const

/**
 * El aviso bajo el botón cuando un dato está mal (índice o hándicap fuera de rango, repetido, sobra). `--error-fg`
 * a 12px pasa AA compositado en los dos temas (claro 6,2:1 sobre `--bg`; oscuro 9,0:1 sobre `--bg-surface`). El
 * ámbar `colores.aviso` daba ~3:1 sobre claro.
 */
export const avisoQueFrena = {
  fontSize: '12px',
  color: 'var(--error-fg)',
  textAlign: 'center' as const,
  lineHeight: 1.3,
} as const

/**
 * El aviso bajo el botón cuando solo falta completar algo (el paso recién abierto): mismo tamaño, en `--text-2`
 * para no gritar error antes de que el usuario haga nada. AA en los dos temas (claro ~5,6:1, oscuro ~8:1).
 */
export const avisoQueFalta = {
  ...avisoQueFrena,
  color: colores.texto2,
} as const

/** El estilo del aviso de un problema: rojo si un dato está mal (o `forzarError`, p. ej. un índice a medio escribir). */
export function estiloDeAviso(problema: { esError?: true } | null | undefined, forzarError = false) {
  return forzarError || problema?.esError ? avisoQueFrena : avisoQueFalta
}

/** "HCP n" junto a cada jugador. */
export const hcpDeJugador = {
  fontFamily: 'var(--font-dm-mono), monospace',
  fontSize: '12px',
  color: colores.texto2,
  fontWeight: 600,
} as const

/** Botón de opción (formato, hoyos, tees…) en sus dos estados.
 *  Diseño tier 1: borde fino siempre + pip dorado 3px izquierdo como indicador.
 *  Fondo oro sutil en activo. Sin borde grueso dorado (regla <5% oro). */
export function opcion(activa: boolean) {
  return {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: `1px solid ${activa ? 'rgba(196,153,42,0.35)' : colores.borde}`,
    borderLeft: activa ? `3px solid ${colores.oro}` : `1px solid ${colores.borde}`,
    background: activa ? 'rgba(196,153,42,0.04)' : colores.tarjeta,
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
  fontFamily: 'var(--font-dm-mono), monospace',
  color: colores.texto2,
  background: colores.tarjeta,
  border: `1px solid ${colores.oroBorde}`,
  borderRadius: '6px',
  padding: '3px 7px',
  whiteSpace: 'nowrap' as const,
} as const
