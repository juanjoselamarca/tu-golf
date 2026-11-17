'use client'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import type { Profile } from '@/lib/data/perfil'
import { formatearIndice } from '@/golf/handicap-index-range'

interface Props {
  profile: Profile
  tourneysPlayed: number
  onAddIndice: () => void
}

export function ProfileHeaderCard({ profile, tourneysPlayed, onAddIndice }: Props) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid rgba(196,153,42,0.22)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '16px',
        animation: 'profileIn 480ms cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <Avatar name={profile.name || 'Golfista'} size="xl" />


        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.1 }}>
            {profile.name || 'Golfista'}
          </h1>
          {/* H16 cerrado: email movido a sección Cuenta (evita PII en screenshots del header) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {profile.indice != null ? (
              <span style={{ fontSize: '13px', color: 'var(--status-live-fg)', fontWeight: 700, fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace' }}>
                Índice: {formatearIndice(profile.indice)}
              </span>
            ) : (
              <Button
                variant="nav"
                size="sm"
                onClick={onAddIndice}
              >
                + Agregar índice →
              </Button>
            )}
            <span style={{ fontSize: '13px', color: 'var(--text-2)', fontFamily: 'var(--font-dm-mono), "DM Mono", ui-monospace, monospace' }}>
              Torneos: {tourneysPlayed}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
