import type React from 'react'

// CTA de los avisos de los scorers del torneo (jugador y organizador; fondo rojo o dorado tenue): relleno dorado con texto oscuro
// (7,35:1 en claro y en oscuro). El texto dorado `--brand-on-bg` sobre ese rojo compositado no llegaba a
// 4,5:1 en modo claro.
export const CTA_RELLENO: React.CSSProperties = {
  minHeight: '44px', display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: '10px',
  // Borde `--brand-on-bg`: el dorado solo sobre el rojo tenue claro queda en 2,2:1 (límite del botón ≥3:1).
  border: '1px solid var(--brand-on-bg)', background: 'var(--brand)', color: 'var(--brand-dark)', fontWeight: 700, fontSize: '15px', textDecoration: 'none',
}

/** Acción secundaria: texto subrayado, 44 px de alto. Sirve para `<Link>` y para `<button>` (sin fondo ni borde). */
export const CTA_SECUNDARIO: React.CSSProperties = {
  minHeight: '44px', display: 'inline-flex', alignItems: 'center', color: 'var(--text)', fontWeight: 600, fontSize: '14px', textDecoration: 'underline',
  background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
}
