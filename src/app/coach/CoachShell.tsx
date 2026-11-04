import Link from 'next/link'
import { FONT_SIZE } from '@/lib/font-size'

// Chrome del coach (header + fondo). SIN auth: el middleware ya protege
// /coach (protectedRoutes en src/proxy.ts) y redirige a /login server-side
// antes de renderizar. El guard client-side anterior (getUser() + "Cargando...")
// era redundante y bloqueaba el render server-side — se eliminó.
export function CoachShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <header data-theme="dark" style={{
        background: 'rgba(14,28,47,0.97)',
        borderBottom: '1px solid rgba(196,153,42,0.15)',
        padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <span style={{ fontFamily: 'var(--font-playfair)', fontSize: FONT_SIZE.lead, color: 'var(--brand-on-bg)', fontWeight: 700 }}>
          tAIger+
        </span>
        {/* inline-flex + center: con el min-height global de 44px el texto quedaba arriba de la caja,
            desalineado del logo. */}
        <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: FONT_SIZE.small, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
          ← Volver a Golfers+
        </Link>
      </header>
      {children}
    </div>
  )
}
