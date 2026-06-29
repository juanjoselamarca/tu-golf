'use client'

import { PersonStanding, Eye } from '@/components/icons'
import { SITE_URL } from '@/lib/site-url'
import type { SharePayload } from '@/golf/share/types'
import { buildOrganizerShare, buildLiveShare } from '@/golf/share/payload'
import { useShare } from '@/components/share/useShare'

/**
 * Bottom-sheet para compartir una ronda libre. La cascada (native → wa.me →
 * portapapeles) la delega al canónico `useShare` y el copy a los builders de
 * `golf/share` (joinText/liveText) — una sola fuente, sin re-derivar wa.me.
 * Extracted from src/app/ronda-libre/[codigo]/score/page.tsx (T4 Sprint 1).
 */
export function ShareMenu({ codigo, onClose, isAdminMode }: { codigo: string; onClose: () => void; isAdminMode?: boolean }) {
  const { share } = useShare()
  const scoreUrl = `${SITE_URL}/ronda-libre/${codigo}/score`
  const liveUrl = `${SITE_URL}/ronda-libre/${codigo}`

  const doShare = async (payload: SharePayload) => {
    await share(payload)
    onClose()
  }

  return (
    <div data-testid="sharemenu-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px', background: '#ffffff', borderRadius: '16px 16px 0 0', padding: '20px 16px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <div style={{ width: '36px', height: '4px', background: '#d1d5db', borderRadius: '2px', margin: '0 auto 16px' }} />
        {!isAdminMode && (
          <button onClick={() => doShare(buildOrganizerShare({ url: scoreUrl }))} style={{
            width: '100%', padding: '16px', marginBottom: '8px', background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.25)', borderRadius: '12px', color: '#1a1a2e', fontSize: '15px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <PersonStanding size={20} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle' }} /> Invitar a jugar
          </button>
        )}
        <button onClick={() => doShare(buildLiveShare({ url: liveUrl }))} style={{
          width: '100%', padding: '16px', background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: '12px', color: '#1a1a2e', fontSize: '15px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <Eye size={20} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle' }} /> Seguir en vivo
        </button>
        <button onClick={onClose} style={{ width: '100%', padding: '14px', marginTop: '8px', background: 'none', border: 'none', color: '#94a3b8', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
      </div>
    </div>
  )
}
