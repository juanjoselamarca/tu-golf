'use client'
import { AlertTriangle } from '@/components/icons'
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><AlertTriangle size={48} strokeWidth={1.5} /></div>
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', marginBottom: '8px' }}>Algo salió mal</h1>
      <p style={{ fontSize: '14px', color: '#94a8c0', marginBottom: '24px', maxWidth: '320px' }}>Estamos trabajando para solucionarlo. Intenta de nuevo o vuelve al inicio.</p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={reset} style={{ background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '14px', padding: '12px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>Reintentar</button>
        <a href="/" style={{ color: '#8A6A16', fontWeight: 600, fontSize: '14px', padding: '12px 24px', borderRadius: '10px', textDecoration: 'none', border: '1px solid rgba(196,153,42,0.4)', display: 'flex', alignItems: 'center' }}>Inicio</a>
      </div>
    </div>
  )
}
