import Link from 'next/link'
import { loginUrl } from '@/lib/auth/login-url'

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: '10px',
  color: 'var(--text)',
  fontSize: '15px',
  outline: 'none',
  boxSizing: 'border-box',
} as const

/** Visitante sin sesión: scorear como invitado o iniciar sesión y volver a este link. */
export function FormInvitado({
  slug,
  guestName,
  onGuestName,
  guestHandicap,
  onGuestHandicap,
  guestJoining,
  onJoin,
}: {
  slug: string
  guestName: string
  onGuestName: (v: string) => void
  guestHandicap: string
  onGuestHandicap: (v: string) => void
  guestJoining: boolean
  onJoin: () => void
}) {
  const bloqueado = guestJoining || guestName.trim().length < 2
  return (
    <div>
      {/* Guest form */}
      <div
        style={{
          background: 'var(--surface-soft)',
          border: '1px solid var(--surface-border)',
          borderRadius: '14px',
          padding: '24px',
          marginBottom: '20px',
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
          Scorear como invitado
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="guest-name" style={{ fontSize: '13px', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
            Tu nombre *
          </label>
          <input
            id="guest-name"
            type="text"
            value={guestName}
            onChange={(e) => onGuestName(e.target.value)}
            placeholder="Nombre y apellido"
            maxLength={100}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="guest-handicap" style={{ fontSize: '13px', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
            Índice de handicap (opcional)
          </label>
          <input
            id="guest-handicap"
            type="number"
            step="0.1"
            min="-10"
            max="54"
            value={guestHandicap}
            onChange={(e) => onGuestHandicap(e.target.value)}
            placeholder="Ej: 18.5"
            inputMode="decimal"
            style={inputStyle}
          />
        </div>

        <button
          type="button"
          onClick={onJoin}
          disabled={bloqueado}
          style={{
            width: '100%',
            background: 'var(--brand)',
            color: 'var(--brand-dark)',
            fontWeight: 700,
            fontSize: '16px',
            padding: '16px',
            borderRadius: '10px',
            border: 'none',
            cursor: bloqueado ? 'not-allowed' : 'pointer',
            opacity: bloqueado ? 0.7 : 1,
            transition: 'opacity 200ms',
          }}
        >
          {guestJoining ? 'Inscribiendo...' : 'Scorear como invitado'}
        </button>
      </div>

      {/* Separador */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--surface-border)' }} />
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>o</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--surface-border)' }} />
      </div>

      {/* Login option */}
      <div style={{ textAlign: 'center' }}>
        <Link
          href={loginUrl(`/torneo/${slug}/unirse`)}
          style={{
            display: 'block',
            width: '100%',
            background: 'transparent',
            color: 'var(--text)',
            fontWeight: 600,
            fontSize: '15px',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid var(--surface-border)',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          Iniciar sesión con mi cuenta
        </Link>
        <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '8px' }}>
          Si ya tienes cuenta, ingresa para guardar tu historial y estadísticas
        </p>
      </div>
    </div>
  )
}
