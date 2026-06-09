'use client'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import type { Profile } from '@/lib/data/perfil'
import { getPlayerTier } from '../perfilFormat'

interface Props {
  profile: Profile
  tourneysPlayed: number
  onAddIndice: () => void
}

export function ProfileHeaderCard({ profile, tourneysPlayed, onAddIndice }: Props) {
  const playerTier = getPlayerTier(profile.indice)

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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <span style={{ background: 'rgba(196,153,42,0.10)', border: '1px solid rgba(196,153,42,0.28)', color: '#c4992a', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Perfil de jugador
            </span>
            <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-2)', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600 }}>
              {playerTier}
            </span>
          </div>

          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.1 }}>
            {profile.name || 'Golfista'}
          </h1>
          {/* H16 cerrado: email movido a sección Cuenta (evita PII en screenshots del header) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {profile.indice != null ? (
              <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 700 }}>
                Índice: {profile.indice}
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
            <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>
              Torneos: {tourneysPlayed}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
