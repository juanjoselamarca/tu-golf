/**
 * Banner informativo para usuarios con acceso beta al coach.
 * No es dismissable — es información, no promo.
 * Se renderiza dentro del CoachShell, debajo del header.
 */
export function CoachBetaBanner() {
  return (
    <div style={{
      padding: '12px 20px',
      background: 'rgba(196,153,42,0.06)',
      borderBottom: '1px solid rgba(196,153,42,0.1)',
      fontSize: 13,
      lineHeight: 1.5,
      color: 'var(--text-2)',
    }}>
      Acceso anticipado gratuito. Esta versión puede presentar errores
      mientras la perfeccionamos.
    </div>
  )
}
