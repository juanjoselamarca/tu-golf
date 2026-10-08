import Link from 'next/link'
import { loginUrl } from '@/lib/auth/login-url'

/**
 * Ronda neto vista sin el neto (decisión de Juanjo, 08-oct-2026): dice por qué
 * la tabla es bruta y cómo ver el neto. Sin columnas neto vacías ni "0 pts".
 */
export function AvisoClasificacionBruta({ motivo, codigo }: { motivo: 'sin-sesion' | 'error'; codigo: string }) {
  return (
    <p
      role="status"
      style={{
        margin: '0 0 8px', fontSize: '13px', lineHeight: 1.4, color: 'var(--text-2, var(--text))',
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0 6px', minHeight: '44px',
      }}
    >
      <span style={{ fontWeight: 600 }}>Clasificación bruta</span>
      <span aria-hidden="true" style={{ color: 'var(--text-3)' }}>·</span>
      {motivo === 'sin-sesion' ? (
        <Link
          href={loginUrl(`/ronda-libre/${codigo}`)}
          style={{
            color: 'var(--brand-on-bg)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px',
            display: 'inline-flex', alignItems: 'center', minHeight: '44px',
          }}
        >
          Inicia sesión para ver el neto
        </Link>
      ) : (
        <span style={{ color: 'var(--text-3)' }}>No pudimos cargar el neto. Reintentando…</span>
      )}
    </p>
  )
}
