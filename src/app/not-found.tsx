import Link from 'next/link'
import { Flag } from '@/components/icons'

export default function NotFound() {
  return (
    <div style={{
      background: 'var(--bg)', minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px', textAlign: 'center',
    }}>
      {/* DESIGN.md §1/§10: icono de línea, nunca emoji en UI chrome. */}
      <Flag size={44} strokeWidth={1.5} aria-hidden style={{ color: 'var(--brand-on-bg)', marginBottom: '16px' }} />
      <h1 style={{
        fontFamily: '"Playfair Display", serif',
        fontSize: '28px', fontWeight: 700, color: 'var(--text)',
        marginBottom: '8px',
      }}>
        Página no encontrada
      </h1>
      <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '24px', maxWidth: '320px' }}>
        Esta página no existe. El link puede haber cambiado o expirado.
      </p>
      <Link href="/" style={{
        background: 'var(--brand)', color: 'var(--brand-dark)', fontWeight: 700,
        fontSize: '14px', padding: '12px 24px', borderRadius: '10px',
        textDecoration: 'none', minHeight: '44px', display: 'inline-flex', alignItems: 'center',
      }}>
        Ir al inicio
      </Link>
    </div>
  )
}
