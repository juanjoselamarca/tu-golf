/**
 * Nota de acceso anticipado para beta testers.
 * Integrada al contenido, no un banner flotante.
 */
export function CoachBetaBanner() {
  return (
    <div style={{
      margin: '0 16px 12px',
      padding: '10px 16px',
      borderRadius: 10,
      // Tokens theme-aware: el navy fijo de antes quedaba gris sobre gris en claro (1.4:1).
      background: 'var(--surface-soft)',
      border: '1px solid var(--border)',
      fontSize: 12,
      lineHeight: 1.5,
      color: 'var(--text-2)',
    }}>
      Acceso anticipado · Esta versión es gratuita y puede presentar
      errores mientras la perfeccionamos.
    </div>
  )
}
