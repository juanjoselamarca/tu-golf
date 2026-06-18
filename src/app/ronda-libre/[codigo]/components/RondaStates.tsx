// Estados de carga / error / no-encontrada de la vista live. Verbatim del monolito.
import Link from 'next/link'
import { Flag, PersonStanding } from '@/components/icons'

export function LoadingView() {
  return (
    <div style={{ background: 'var(--bg-surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', fontFamily: 'DM Sans, sans-serif' }}>
      Cargando ronda...
    </div>
  )
}

export function FetchErrorView({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ background: 'var(--bg-surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'DM Sans, sans-serif', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><Flag size={48} strokeWidth={1.5} /></div>
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: 'var(--text)', textAlign: 'center' }}>
        Error al cargar la ronda
      </h1>
      <p style={{ color: 'var(--text-2)', textAlign: 'center', maxWidth: '320px', fontSize: '14px' }}>
        No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.
      </p>
      <button
        onClick={onRetry}
        style={{
          background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700,
          fontSize: '14px', padding: '12px 24px', borderRadius: '10px',
          border: 'none', cursor: 'pointer',
        }}
      >
        Reintentar
      </button>
      <Link href="/" style={{ color: '#c4992a', textDecoration: 'none', fontSize: '13px' }}>
        Ir al inicio
      </Link>
    </div>
  )
}

export function NotFoundView({ codigo }: { codigo: string }) {
  return (
    <div style={{ background: 'var(--bg-surface)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'DM Sans, sans-serif', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><PersonStanding size={64} strokeWidth={1.5} /></div>
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: 'var(--text)', textAlign: 'center' }}>
        Ronda no encontrada
      </h1>
      <p style={{ color: 'var(--text-2)', textAlign: 'center', maxWidth: '320px', lineHeight: 1.5 }}>
        El código <strong style={{ color: '#c4992a' }}>{codigo}</strong> no existe o fue eliminado.
        Verifica que el código sea exacto (mayúsculas y minúsculas importan).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
        <Link href="/ronda-libre/nueva" style={{
          background: '#c4992a', color: 'var(--brand-dark)', textDecoration: 'none',
          fontWeight: 600, fontSize: '15px', padding: '12px 24px', borderRadius: '10px',
          display: 'inline-block',
        }}>
          Crear nueva ronda
        </Link>
        <Link href="/" style={{ color: 'var(--text-2)', textDecoration: 'none', fontSize: '14px' }}>← Ir al inicio</Link>
      </div>
    </div>
  )
}
