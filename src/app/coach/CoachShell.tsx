import Link from 'next/link'

// Chrome del coach (header + fondo). SIN auth: el middleware ya protege
// /coach (protectedRoutes en src/middleware.ts) y redirige a /login server-side
// antes de renderizar. El guard client-side anterior (getUser() + "Cargando...")
// era redundante y bloqueaba el render server-side — se eliminó.
export function CoachShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <header style={{
        background: 'rgba(14,28,47,0.97)',
        borderBottom: '1px solid rgba(196,153,42,0.15)',
        padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#c4992a', fontWeight: 700 }}>
          tAIger+
        </span>
        <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none' }}>
          ← Volver a Golfers+
        </Link>
      </header>
      {children}
    </div>
  )
}
