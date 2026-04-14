'use client'

import Link from 'next/link'
import { Flag } from '@/components/icons'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{
      background: '#070d18', minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px', textAlign: 'center',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}><Flag size={48} strokeWidth={1.5} /></div>
      <h1 style={{
        fontFamily: '"Playfair Display", serif',
        fontSize: '24px', fontWeight: 700, color: '#edeae4',
        marginBottom: '8px',
      }}>
        Algo salió mal
      </h1>
      <p style={{ fontSize: '14px', color: '#94a8c0', marginBottom: '24px', maxWidth: '320px' }}>
        Estamos trabajando para solucionarlo. Intenta de nuevo o vuelve al inicio.
      </p>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={reset} style={{
          background: '#c4992a', color: '#070d18', fontWeight: 700,
          fontSize: '14px', padding: '12px 24px', borderRadius: '10px',
          border: 'none', cursor: 'pointer',
        }}>
          Reintentar
        </button>
        <Link href="/" style={{
          border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a',
          fontSize: '14px', padding: '12px 24px', borderRadius: '10px',
          textDecoration: 'none', display: 'inline-block',
        }}>
          Inicio
        </Link>
      </div>
    </div>
  )
}
