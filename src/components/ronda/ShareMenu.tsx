'use client'

import { PersonStanding, Eye } from '@/components/icons'

/**
 * Bottom-sheet modal to share a ronda libre via native share API or WhatsApp fallback.
 * Extracted from src/app/ronda-libre/[codigo]/score/page.tsx (T4 Sprint 1).
 */
export function ShareMenu({ codigo, onClose, isAdminMode }: { codigo: string; onClose: () => void; isAdminMode?: boolean }) {
  const siteUrl = 'https://golfersplus.vercel.app'
  const scoreUrl = `${siteUrl}/ronda-libre/${codigo}/score`
  const liveUrl = `${siteUrl}/ronda-libre/${codigo}`

  const doShare = async (url: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: 'Golfers+', text, url }) } catch {}
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank')
    }
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px', background: '#ffffff', borderRadius: '16px 16px 0 0', padding: '20px 16px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <div style={{ width: '36px', height: '4px', background: '#d1d5db', borderRadius: '2px', margin: '0 auto 16px' }} />
        {!isAdminMode && (
          <button onClick={() => doShare(scoreUrl, 'Únete a jugar en Golfers+')} style={{
            width: '100%', padding: '16px', marginBottom: '8px', background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '12px', color: '#1a1a2e', fontSize: '15px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <PersonStanding size={20} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle' }} /> Invitar a jugar
          </button>
        )}
        <button onClick={() => doShare(liveUrl, 'Sigue mi ronda en vivo en Golfers+')} style={{
          width: '100%', padding: '16px', background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: '12px', color: '#1a1a2e', fontSize: '15px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <Eye size={20} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle' }} /> Seguir en vivo
        </button>
        <button onClick={onClose} style={{ width: '100%', padding: '14px', marginTop: '8px', background: 'none', border: 'none', color: '#94a3b8', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
      </div>
    </div>
  )
}
