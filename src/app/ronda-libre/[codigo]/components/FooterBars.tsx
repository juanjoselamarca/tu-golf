// Bloques chicos del pie de la vista live: info admin, links post-ronda,
// barra admin "volver a scorear", banner de registro. Verbatim del monolito.
import Link from 'next/link'
import { ClipboardList } from '@/components/icons'

/** Banner informativo cuando un admin lleva el score del grupo. */
export function AdminInfoBanner({ adminPlayerName }: { adminPlayerName: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.2)',
      borderRadius: '12px', padding: '12px 16px', marginBottom: '16px',
    }}>
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><ClipboardList size={18} /></span>
      <span style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.4 }}>
        <strong style={{ color: 'var(--text)' }}>{adminPlayerName}</strong> lleva el score del grupo
      </span>
    </div>
  )
}

/** Links post-ronda (ver estadísticas) — para rondas finalizadas. */
export function PostRondaLinks({ isAnonymous, onRequireAuth }: { isAnonymous: boolean; onRequireAuth: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '8px', paddingBottom: '24px' }}>
      {isAnonymous ? (
        <button
          onClick={onRequireAuth}
          style={{
            background: 'none', border: 'none',
            color: '#c4992a', textDecoration: 'none', fontSize: '15px',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Ver mis estadísticas →
        </button>
      ) : (
        <Link
          href="/perfil/stats"
          style={{
            color: '#c4992a', textDecoration: 'none', fontSize: '15px',
            fontWeight: 600,
          }}
        >
          Ver mis estadísticas →
        </Link>
      )}
    </div>
  )
}

/** Barra fija "Volver a scorear" para el admin de la ronda en curso. */
export function AdminScoringBar({ codigo }: { codigo: string }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'var(--bg-surface)', borderTop: '1px solid #e2e8f0',
      padding: '12px 20px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
      display: 'flex', justifyContent: 'center',
    }}>
      <Link href={`/ronda-libre/${codigo}/score-grupo`} style={{
        background: '#c4992a', color: '#ffffff', fontWeight: 700,
        fontSize: '15px', padding: '14px 32px', borderRadius: '12px',
        textDecoration: 'none', textAlign: 'center', width: '100%', maxWidth: '400px',
        display: 'block',
      }}>
        Volver a scorear
      </Link>
    </div>
  )
}

/** Banner de registro para espectadores anónimos (tras 8s o scroll). */
export function RegistrationBanner({ codigo, onDismiss }: { codigo: string; onDismiss: () => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderTop: '1px solid #e2e8f0',
      padding: '14px 16px',
      animation: 'slideUpBanner 0.4s ease-out',
    }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
            Registra tu propio score
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>
            Crea tu cuenta gratis y juega con Golfers+
          </div>
        </div>
        <Link
          href={`/register?next=/ronda-libre/${codigo}`}
          style={{
            background: '#c4992a', color: 'var(--brand-dark)', fontWeight: 700,
            fontSize: '13px', padding: '10px 18px', borderRadius: '8px',
            textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          Unirme gratis
        </Link>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', color: 'var(--text-2)',
            fontSize: '20px', cursor: 'pointer', padding: '4px 8px',
            flexShrink: 0, minHeight: '44px', minWidth: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
