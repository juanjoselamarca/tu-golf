import Link from 'next/link'
import { loginUrl } from '@/lib/auth/login-url'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

/**
 * Visitante sin sesión: scorear como invitado o iniciar sesión y volver a este link.
 * Inputs y botón son los compartidos (`ui/Input`, `ui/Button`): 16px (iOS no hace
 * zoom al enfocar), foco visible y 44px+ de alto.
 */
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
          <Input
            id="guest-name"
            type="text"
            value={guestName}
            onChange={(e) => onGuestName(e.target.value)}
            placeholder="Nombre y apellido"
            maxLength={100}
            autoComplete="name"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="guest-handicap" style={{ fontSize: '13px', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
            Índice de handicap (opcional)
          </label>
          <Input
            id="guest-handicap"
            type="number"
            step="0.1"
            min="-10"
            max="54"
            value={guestHandicap}
            onChange={(e) => onGuestHandicap(e.target.value)}
            placeholder="Ej: 18.5"
            inputMode="decimal"
            // `style` reemplaza el del input interno de ui/Input: se repite el color.
            style={{ color: 'var(--text)', fontFamily: 'var(--font-dm-mono), monospace' }}
          />
        </div>

        <Button type="button" variant="commit" size="lg" fullWidth onClick={onJoin} disabled={bloqueado}>
          {guestJoining ? 'Inscribiendo...' : 'Scorear como invitado'}
        </Button>
      </div>

      {/* Separador */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--surface-border)' }} />
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>o</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--surface-border)' }} />
      </div>

      <LinkIniciarSesion slug={slug} />
    </div>
  )
}

/**
 * Iniciar sesión (o crear cuenta) y volver a este link. Lo usa el formulario de invitado
 * y el aviso de "este torneo no acepta invitados", donde es la única salida que sirve.
 */
export function LinkIniciarSesion({
  slug,
  texto = 'Iniciar sesión con mi cuenta',
  ayuda = 'Si ya tienes cuenta, ingresa para guardar tu historial y estadísticas',
}: {
  slug: string
  texto?: string
  ayuda?: string
}) {
  return (
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
        {texto}
      </Link>
      <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '8px' }}>
        {ayuda}
      </p>
    </div>
  )
}
