// src/app/torneo/[slug]/components/TournamentFooter.tsx
//
// Footer minimal premium con CTA a registro y demo. Aparece al pie de
// la vista pública del torneo. Tokens CSS para theme-awareness.

import Link from 'next/link'
import { Wordmark } from '@/components/Wordmark'

export function TournamentFooter() {
  return (
    <footer style={{ borderTop: '1px solid rgba(196,153,42,0.08)', marginTop: '32px' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ marginBottom: '4px' }}>
          <Wordmark size={16} />
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px' }}>
          Scoring en vivo &middot; &Iacute;ndices &middot; Coach IA
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <Link href="/register" style={{
            background: 'var(--brand)', color: 'var(--brand-text)', fontWeight: 700, fontSize: '14px',
            padding: '12px 24px', borderRadius: '10px', textDecoration: 'none',
          }}>
            Crear cuenta gratis
          </Link>
          <Link href="/demo" style={{
            color: 'var(--text-2)', fontSize: '14px', fontWeight: 500,
            padding: '12px 16px', textDecoration: 'none',
          }}>
            Ver demo
          </Link>
        </div>
      </div>
    </footer>
  )
}
