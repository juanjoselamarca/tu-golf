'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Oculta el footer en rutas full-screen donde estorba la UX
// (chat del coach: input fijo en bottom + scroll de mensajes).
const HIDDEN_PREFIXES = ['/coach/sesion']

export default function GlobalFooter() {
  const pathname = usePathname() || ''
  if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return null

  return (
    <footer style={{ background: 'var(--bg-surface)', paddingTop: '1px' }}>
      <div style={{ height: '1px', background: 'var(--border)' }} />
      <div className="py-10 text-center">
        <p className="font-display text-xl mb-2">
          <span style={{ color: 'var(--text)' }}>Golfers</span>
          <span style={{ color: '#c4992a' }}>+</span>
        </p>
        <p style={{ color: 'var(--text-2)', fontSize: '14px' }}>
          © {new Date().getFullYear()} Golfers+ · Diseñado para el golf amateur en Latinoamérica
        </p>
        <nav style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/terminos" style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}>
            Términos y Condiciones
          </Link>
          <Link href="/privacidad" style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}>
            Privacidad
          </Link>
          <Link href="/reembolsos" style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}>
            Reembolsos
          </Link>
        </nav>
      </div>
    </footer>
  )
}
