/**
 * Estados vacíos y de error para /perfil/historial:
 *   - LoadingScreen           → spinner full-screen mientras se verifica auth
 *   - FatalErrorScreen        → falla total cargando, sin rondas (botón Reintentar)
 *   - RoundsSkeleton          → 4 cards skeleton mientras llega la lista de rondas
 *   - EmptyHistorialState     → "Tu historial está vacío" + CTAs
 */
'use client'

import Link from 'next/link'
import { AlertTriangle, ClipboardList, Radio } from '@/components/icons'

export function LoadingScreen() {
  return (
    <div style={{
      background: 'var(--bg)', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-3)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '32px', height: '32px',
          border: '3px solid var(--border)', borderTopColor: '#c4992a',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 12px',
        }} />
        <div style={{ fontSize: '14px' }}>Cargando historial...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

interface FatalErrorScreenProps {
  onRetry: () => void
}

export function FatalErrorScreen({ onRetry }: FatalErrorScreenProps) {
  return (
    <div style={{
      background: 'var(--bg)', minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '16px', padding: '20px',
    }}>
      <div style={{ color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AlertTriangle size={48} strokeWidth={1.5} />
      </div>
      <p style={{ color: 'var(--text)', fontSize: '16px', textAlign: 'center', margin: 0 }}>
        No se pudieron cargar las tarjetas
      </p>
      <p style={{ color: 'var(--text-3)', fontSize: '13px', textAlign: 'center', margin: 0 }}>
        Revisa tu conexión e intenta de nuevo
      </p>
      <button
        onClick={onRetry}
        style={{
          background: '#c4992a',
          color: 'var(--brand-dark)',
          fontWeight: 700, fontSize: '14px',
          padding: '12px 28px', borderRadius: '10px',
          border: 'none', cursor: 'pointer', marginTop: '8px',
        }}
      >
        Reintentar
      </button>
      <Link
        href="/dashboard"
        style={{
          color: 'var(--text-3)', fontSize: '13px',
          textDecoration: 'none', marginTop: '4px',
        }}
      >
        &#8592; Volver al dashboard
      </Link>
    </div>
  )
}

export function RoundsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" style={{ padding: '24px 16px' }}>
      <span className="sr-only">Cargando historial…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: '80px',
            marginBottom: '12px',
            borderRadius: '12px',
            background: 'linear-gradient(90deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.07) 50%, rgba(0,0,0,0.04) 100%)',
            backgroundSize: '200% 100%',
            animation: 'historial-skel 1.4s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  )
}

interface EmptyHistorialStateProps {
  loadError: boolean
  onAddRound: () => void
}

export function EmptyHistorialState({ loadError, onAddRound }: EmptyHistorialStateProps) {
  if (loadError) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <Radio size={56} strokeWidth={1.5} />
        </div>
        <div style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '22px', color: 'var(--text)', marginBottom: '8px',
        }}>
          La carga tardó más de lo esperado
        </div>
        <div style={{
          fontSize: '14px', color: 'var(--text-3)',
          marginBottom: '28px', maxWidth: '320px',
          margin: '0 auto 28px',
        }}>
          Puede ser tu conexión a internet. Intenta recargar la página.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#c4992a', color: 'var(--brand-dark)',
            fontWeight: 700, fontSize: '14px',
            padding: '12px 24px', borderRadius: '10px',
            border: 'none', cursor: 'pointer',
          }}
        >
          Recargar
        </button>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <ClipboardList size={56} strokeWidth={1.5} />
      </div>
      <div style={{
        fontFamily: '"Playfair Display", serif',
        fontSize: '22px', color: 'var(--text)', marginBottom: '8px',
      }}>
        Tu historial está vacío
      </div>
      <div style={{
        fontSize: '14px', color: 'var(--text-2)',
        marginBottom: '28px', maxWidth: '360px',
        margin: '0 auto 28px', lineHeight: 1.6,
      }}>
        Importa tu historial o registra tu primera ronda para activar tus estadísticas y el coaching con IA.
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={onAddRound}
          style={{
            background: '#c4992a', color: 'var(--brand-dark)',
            fontWeight: 700, fontSize: '14px',
            padding: '12px 24px', borderRadius: '10px',
            border: 'none', cursor: 'pointer',
          }}
        >
          Registrar ronda
        </button>
        <a
          href="/importar"
          style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'transparent', color: '#c4992a',
            fontWeight: 600, fontSize: '14px',
            padding: '12px 24px', borderRadius: '10px',
            border: '1px solid rgba(196,153,42,0.4)',
            textDecoration: 'none',
          }}
        >
          Importar historial
        </a>
      </div>
      <div style={{
        fontSize: '12px', color: 'rgba(196,153,42,0.6)',
        padding: '10px 16px',
        background: 'rgba(196,153,42,0.06)',
        borderRadius: '8px',
        display: 'inline-block', marginTop: '20px',
      }}>
        &#128047; tAIger+ analizará tu juego con 3+ rondas
      </div>
    </div>
  )
}
