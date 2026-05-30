// src/app/torneo/[slug]/components/TournamentFooter.tsx
//
// Footer minimal premium con CTA a registro y demo. Aparece al pie de
// la vista pública del torneo.

import Link from 'next/link'

export function TournamentFooter() {
  return (
    <footer style={{ borderTop: '1px solid rgba(196,153,42,0.08)', marginTop: '32px' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: '#1a1a2e', fontWeight: 700, marginBottom: '4px' }}>
          <span>Golfers</span><span style={{ color: '#c4992a' }}>+</span>
        </div>
        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>
          Scoring en vivo &middot; &Iacute;ndices &middot; Coach IA
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <Link href="/register" style={{
            background: '#c4992a', color: '#1a1a2e', fontWeight: 700, fontSize: '14px',
            padding: '12px 24px', borderRadius: '10px', textDecoration: 'none',
          }}>
            Crear cuenta gratis
          </Link>
          <Link href="/demo" style={{
            color: '#4a5568', fontSize: '14px', fontWeight: 500,
            padding: '12px 16px', textDecoration: 'none',
          }}>
            Ver demo
          </Link>
        </div>
      </div>
    </footer>
  )
}
