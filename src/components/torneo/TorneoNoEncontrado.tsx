import Link from 'next/link'
import { Flag } from '@/components/icons'

/**
 * Pantalla "Torneo no encontrado" de las rutas de torneo y organizador
 * (score, salida, scoring). Antes cada una pintaba un texto suelto sin salida
 * — en el scorer, rosado sobre crema (#fca5a5, ~1.8:1). Hereda el modo del
 * contexto (DESIGN.md §2, error states) y siempre ofrece el camino de vuelta.
 */
export function TorneoNoEncontrado() {
  return (
    <div
      role="alert"
      style={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <Flag size={36} strokeWidth={1.5} aria-hidden style={{ color: 'var(--brand-on-bg)', marginBottom: '8px' }} />
      <h1 style={{ fontFamily: 'var(--font-playfair), "Playfair Display", serif', fontSize: '24px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
        Torneo no encontrado
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--text-2)', margin: '0 0 16px', maxWidth: '320px' }}>
        Verifica el link o vuelve al inicio.
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '44px', padding: '0 24px', borderRadius: '10px',
          background: 'var(--brand)', color: 'var(--brand-dark)',
          fontSize: '14px', fontWeight: 700, textDecoration: 'none',
        }}
      >
        Ir al inicio
      </Link>
    </div>
  )
}
