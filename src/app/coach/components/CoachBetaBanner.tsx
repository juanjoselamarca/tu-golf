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
      background: 'rgba(14,28,47,0.5)',
      border: '1px solid rgba(196,153,42,0.08)',
      fontSize: 12,
      lineHeight: 1.5,
      color: 'var(--text-3)',
    }}>
      Acceso anticipado · Esta versión es gratuita y puede presentar
      errores mientras la perfeccionamos.
    </div>
  )
}
