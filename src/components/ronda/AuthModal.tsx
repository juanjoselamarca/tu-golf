'use client'

import Link from 'next/link'
import { Flag } from '@/components/icons'

/**
 * Modal de autenticación con Google para ronda libre.
 * Extraído de src/app/ronda-libre/[codigo]/page.tsx (T6 Sprint 1).
 */
export function AuthModal({ action, codigo, onClose }: { action: string; codigo: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '24px',
          border: '1px solid #e2e8f0',
          padding: '40px 32px 32px',
          maxWidth: '400px', width: '100%',
          textAlign: 'center',
          boxShadow: '0 25px 50px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
        }}
      >
        {/* Logo */}
        <div style={{
          width: '64px', height: '64px', borderRadius: '16px',
          background: 'rgba(196,153,42,0.1)',
          border: '1px solid rgba(196,153,42,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <Flag size={28} />
        </div>
        <h2 style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '24px', fontWeight: 700, color: '#1a1a2e',
          marginBottom: '8px', lineHeight: 1.3,
        }}>
          {action}
        </h2>
        <p style={{
          fontSize: '14px', color: '#4a5568', marginBottom: '28px',
          lineHeight: 1.6, maxWidth: '300px', margin: '0 auto 28px',
        }}>
          Crea tu cuenta gratis en Golfers+ para acceder a todas las funciones.
        </p>
        <Link
          href={`/login?next=/ronda-libre/${codigo}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            width: '100%', padding: '14px 20px',
            background: '#c4992a', color: '#1a1a2e',
            fontWeight: 700, fontSize: '15px',
            borderRadius: '12px', textDecoration: 'none',
            marginBottom: '8px',
            transition: 'opacity 0.15s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuar con Google
        </Link>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none',
            color: '#4a5568', fontSize: '14px',
            cursor: 'pointer', padding: '12px 16px',
            width: '100%',
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  )
}
