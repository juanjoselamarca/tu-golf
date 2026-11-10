import Link from 'next/link'
import { PLACEHOLDER_CAMPO_HANDICAP, REGLA_INVITADO } from '@/golf/handicap-index-range'
import { useAvisoIndiceAlEnviar } from '@/hooks/useAvisoIndiceAlEnviar'
import { useAvisoDeCampo } from '@/hooks/useAvisoDeCampo'
import { MENSAJE_NOMBRE_INVITADO_CORTO, NOMBRE_INVITADO_MAX, nombreDeInvitadoValido } from '@/lib/inscripcion/nombre-invitado'
import { AvisoCampo } from '@/components/ui/AvisoCampo'
import { loginUrl } from '@/lib/auth/login-url'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { buttonClassName } from '@/components/ui/button-classes'

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
  // El botón solo se apaga mientras se inscribe. Un nombre de 1 letra o un hándicap a medio escribir ("+")
  // se avisan al tocarlo, en el campo, y se le da el foco: un botón apagado no dice qué falta.
  const campoNombre = useAvisoDeCampo(guestName, 'guest-name')
  const campoHcp = useAvisoIndiceAlEnviar(guestHandicap, 'guest-handicap', REGLA_INVITADO)
  const enviar = () => {
    if (!nombreDeInvitadoValido(guestName)) {
      campoNombre.avisar(MENSAJE_NOMBRE_INVITADO_CORTO)
      return
    }
    if (campoHcp.validarAlEnviar()) onJoin()
  }
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
            maxLength={NOMBRE_INVITADO_MAX}
            autoComplete="name"
            error={campoNombre.avisoDelEnvio != null}
            {...campoNombre.propsDelCampo}
          />
          {campoNombre.avisoDelEnvio != null && <AvisoCampo id={campoNombre.idAviso}>{campoNombre.avisoDelEnvio}</AvisoCampo>}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="guest-handicap" style={{ fontSize: '13px', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
            Índice de handicap (opcional)
          </label>
          {/* type="text": un type="number" deja el valor en '' con "+2" (y el invitado entraba sin
              hándicap, sin aviso); inputMode "text" porque el teclado decimal del iPhone no tiene signo. */}
          <Input
            id="guest-handicap"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={guestHandicap}
            onChange={(e) => onGuestHandicap(e.target.value)}
            placeholder={PLACEHOLDER_CAMPO_HANDICAP}
            error={campoHcp.aviso != null}
            {...campoHcp.propsDelCampo}
            // `style` reemplaza el del input interno de ui/Input: se repite el color.
            style={{ color: 'var(--text)', fontFamily: 'var(--font-dm-mono), monospace' }}
          />
          {campoHcp.aviso != null && <AvisoCampo id={campoHcp.idAviso}>{campoHcp.aviso}</AvisoCampo>}
        </div>

        <Button type="button" variant="commit" size="lg" fullWidth onClick={enviar} disabled={guestJoining}>
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
 * y el aviso de "este torneo no acepta invitados", donde es la única salida que sirve:
 * ahí va `destacado`, con peso de Button commit. El contorno secundario no llega a 3:1, y el
 * texto `--brand-on-bg` de nav sobre `--surface-soft` da 4,43:1 en claro.
 */
export function LinkIniciarSesion({
  slug,
  texto = 'Iniciar sesión con mi cuenta',
  ayuda = 'Si ya tienes cuenta, ingresa para guardar tu historial y estadísticas',
  destacado = false,
}: {
  slug: string
  texto?: string
  ayuda?: string
  destacado?: boolean
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <Link
        href={loginUrl(`/torneo/${slug}/unirse`)}
        className={destacado ? buttonClassName({ variant: 'commit', size: 'lg', fullWidth: true }) : undefined}
        style={destacado ? undefined : {
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
