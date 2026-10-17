import type { JoinInfoProfile } from '@/lib/data/tournaments/joinFlow'

/** Quién se va a inscribir: inicial, nombre e índice del perfil con sesión. */
export function TarjetaPerfilInscripcion({ profile }: { profile: JoinInfoProfile }) {
  return (
    <div
      style={{
        background: 'var(--surface-soft)',
        border: '1px solid var(--surface-border)',
        borderRadius: '14px',
        padding: '24px',
        marginBottom: '24px',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
        Tu perfil
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(196,153,42,0.15)',
            border: '1.5px solid rgba(196,153,42,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            color: 'var(--brand-on-bg)',
            fontWeight: 700,
          }}
        >
          {profile.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>{profile.name}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
            {profile.indice != null
              ? `Índice: ${Number(profile.indice).toFixed(1)}`
              : 'Sin índice registrado'}
          </div>
        </div>
      </div>
    </div>
  )
}
