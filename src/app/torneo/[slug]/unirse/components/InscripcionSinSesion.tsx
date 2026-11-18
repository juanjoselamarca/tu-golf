import type { CapacityInfo } from '@/lib/data/tournaments/enrollPlayer'
import { motivoNoInscribible } from '@/golf/tournament-status'
import { type InvitadosInfo, type JoinInfoTournament } from '@/lib/data/tournaments/joinFlow'
import { Button } from '@/components/ui/Button'
import { AvisoInscripcion, AvisoInscripcionesCerradas, AvisoTorneoCompleto, LinkVerLeaderboard } from './AvisoInscripcion'
import { FormInvitado, LinkIniciarSesion } from './FormInvitado'

/**
 * Qué ve un visitante SIN sesión en /torneo/[slug]/unirse. Cada rama es un estado honesto:
 * nunca un formulario que el backend va a rechazar.
 *
 *  - torneo cerrado o aún no abierto → aviso (igual que con sesión)
 *  - cupo lleno → "Torneo completo" (antes el invitado chocaba con el 409 escrito para el organizador)
 *  - el organizador no puede recibir invitados (gate Pro) → la salida que sirve: iniciar sesión / crear cuenta.
 *    Antes (22-oct-2026) se mostraba el formulario completo y recién al enviar llegaba el 403.
 *  - no se pudo verificar el plan → reintentar (es un hipo, no un "no")
 *  - ya inscrito y este teléfono perdió el acceso → sin formulario (otra inscripción sería la misma persona
 *    dos veces): sólo "Ver el torneo" y a quién pedirle los golpes (Fable #833 v2)
 *  - si no, el formulario de invitado
 */
export const COPY_ACCESO_PERDIDO = {
  titulo: 'Ya estás inscrito en este torneo',
  detalle: 'Este teléfono perdió el acceso a tu tarjeta. Pídele al organizador que anote tus golpes.',
} as const

export const COPY_SIN_INVITADOS = {
  titulo: 'Este torneo no acepta invitados',
  detalle: 'Para inscribirte necesitas una cuenta Golfers+. Es gratis y el torneo queda en tu historial.',
  link: 'Iniciar sesión o crear cuenta',
  ayuda: 'Vuelves a este mismo link con tu cuenta lista.',
} as const

export const COPY_PLAN_SIN_VERIFICAR = {
  titulo: 'No pudimos verificar si este torneo acepta invitados',
} as const

export function InscripcionSinSesion({
  slug,
  tournament,
  capacity,
  invitados,
  guestName,
  onGuestName,
  guestHandicap,
  onGuestHandicap,
  guestJoining,
  accesoPerdido = false,
  onJoin,
  onReintentar,
}: {
  slug: string
  tournament: JoinInfoTournament
  capacity: CapacityInfo | null
  invitados: InvitadosInfo
  guestName: string
  onGuestName: (v: string) => void
  guestHandicap: string
  onGuestHandicap: (v: string) => void
  guestJoining: boolean
  accesoPerdido?: boolean
  onJoin: () => void
  onReintentar: () => void
}) {
  if (accesoPerdido) {
    return (
      <AvisoInscripcion titulo={COPY_ACCESO_PERDIDO.titulo} detalle={COPY_ACCESO_PERDIDO.detalle}>
        <LinkVerLeaderboard slug={slug} />
      </AvisoInscripcion>
    )
  }
  const motivo = motivoNoInscribible(tournament, new Date())
  if (motivo) {
    return <AvisoInscripcionesCerradas motivo={motivo} slug={slug} />
  }
  if (capacity?.full) {
    return <AvisoTorneoCompleto capacity={capacity} slug={slug} />
  }
  if (!invitados.permitido) {
    if (invitados.motivo === 'plan_unavailable') {
      return (
        <AvisoInscripcion titulo={COPY_PLAN_SIN_VERIFICAR.titulo} detalle={invitados.mensaje}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Button type="button" variant="commit" size="lg" fullWidth onClick={onReintentar}>
              Reintentar
            </Button>
            <LinkIniciarSesion slug={slug} />
          </div>
        </AvisoInscripcion>
      )
    }
    return (
      <AvisoInscripcion titulo={COPY_SIN_INVITADOS.titulo} detalle={COPY_SIN_INVITADOS.detalle}>
        <LinkIniciarSesion slug={slug} texto={COPY_SIN_INVITADOS.link} ayuda={COPY_SIN_INVITADOS.ayuda} destacado />
      </AvisoInscripcion>
    )
  }
  return (
    <FormInvitado
      slug={slug}
      guestName={guestName}
      onGuestName={onGuestName}
      guestHandicap={guestHandicap}
      onGuestHandicap={onGuestHandicap}
      guestJoining={guestJoining}
      onJoin={onJoin}
    />
  )
}
