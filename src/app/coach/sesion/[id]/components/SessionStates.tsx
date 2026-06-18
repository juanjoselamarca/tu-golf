'use client'

import { useRouter } from 'next/navigation'

/** Estado de carga de la sesión (idéntico al original page.tsx:360-372). */
export function LoadingState() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 60px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)',
    }}>
      Cargando sesión...
    </div>
  )
}

/** Estado sesión no encontrada (idéntico al original page.tsx:374-402). */
export function NotFoundState() {
  const router = useRouter()
  return (
    <div style={{
      minHeight: 'calc(100vh - 60px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 20,
    }}>
      <p style={{ color: 'var(--text)', fontSize: 16 }}>Sesión no encontrada</p>
      <button
        onClick={() => router.push('/coach')}
        style={{
          background: 'rgba(196,153,42,0.15)',
          border: '1px solid rgba(196,153,42,0.3)',
          borderRadius: 8,
          padding: '8px 20px',
          color: '#8A6A16',
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        Volver al coach
      </button>
    </div>
  )
}
