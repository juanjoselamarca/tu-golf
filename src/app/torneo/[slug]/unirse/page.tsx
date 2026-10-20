'use client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { esInscribible } from '@/lib/data/tournaments/joinFlow'
import { useInscripcionTorneo } from './hooks/useInscripcionTorneo'
import { TarjetaTorneoInscripcion } from './components/TarjetaTorneoInscripcion'
import { TarjetaPerfilInscripcion } from './components/TarjetaPerfilInscripcion'
import { FormInvitado } from './components/FormInvitado'
import { AvisoInscripcion, LinkVerLeaderboard, LINK_SECUNDARIO_44 } from './components/AvisoInscripcion'
import { Button } from '@/components/ui/Button'
import { InscripcionExitosa } from './components/InscripcionExitosa'
import { loginUrl, registerUrl } from '@/lib/auth/login-url'

export default function UnirsePage() {
  const params = useParams()
  const slug = params.slug as string
  const {
    loading,
    tournament,
    profile,
    alreadyRegistered,
    capacity,
    authenticated,
    invitadosCerrados,
    inscribing,
    error,
    success,
    loadFailed,
    guestName,
    setGuestName,
    guestHandicap,
    setGuestHandicap,
    guestJoining,
    reintentarCarga,
    handleInscribirse,
    handleGuestJoin,
  } = useInscripcionTorneo(slug)

  if (success && tournament) {
    return <InscripcionExitosa slug={slug} nombreTorneo={tournament.name} />
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0' }}>
      <div style={{ padding: '24px 20px 0' }}>
        <Link href={`/torneo/${slug}`} style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>
          ← Volver al torneo
        </Link>
      </div>
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 20px' }}>
        <h1
          style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '26px',
            color: 'var(--text)',
            fontWeight: 700,
            margin: '0 0 24px',
          }}
        >
          Inscribirse al torneo
        </h1>

        {error && (
          <div
            style={{
              background: 'var(--status-closed-bg)',
              border: '1px solid var(--status-closed-bg)',
              borderRadius: '12px',
              padding: '14px 16px',
              color: 'var(--status-closed-fg)',
              fontSize: '14px',
              marginBottom: '20px',
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-2)', fontSize: '14px' }}>
            Cargando...
          </div>
        )}

        {!loading && loadFailed && (
          <div style={{ textAlign: 'center' }}>
            <Button type="button" variant="commit" size="lg" fullWidth onClick={reintentarCarga}>
              Reintentar
            </Button>
            <Link href="/" style={{ ...LINK_SECUNDARIO_44, marginTop: '6px' }}>
              Ir al inicio →
            </Link>
          </div>
        )}

        {!loading && tournament && (
          <>
            <TarjetaTorneoInscripcion tournament={tournament} />

            {profile && <TarjetaPerfilInscripcion profile={profile} />}

            {!authenticated ? (
              /* Visitor sin sesión — guest scoring form + opción de login */
              esInscribible(tournament.status) && invitadosCerrados ? (
                /* Guard CERO FALLOS: el plan del organizador no admite invitados. Antes
                   el formulario se llenaba y moría en un 403 que el jugador no puede
                   resolver; ahora se le ofrece el camino que sí funciona: con cuenta. */
                <AvisoInscripcion
                  titulo="Este torneo es solo para jugadores con cuenta"
                  detalle="Inicia sesión o crea tu cuenta gratis para inscribirte. Al entrar vuelves directo a la inscripción."
                >
                  <Link
                    href={registerUrl(`/torneo/${slug}/unirse`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '48px',
                      background: 'var(--brand)',
                      color: 'var(--brand-dark)',
                      fontWeight: 700,
                      fontSize: '15px',
                      borderRadius: '10px',
                      textDecoration: 'none',
                    }}
                  >
                    Crear cuenta gratis
                  </Link>
                  <Link href={loginUrl(`/torneo/${slug}/unirse`)} style={{ ...LINK_SECUNDARIO_44, marginTop: '6px' }}>
                    Ya tengo cuenta · Iniciar sesión
                  </Link>
                </AvisoInscripcion>
              ) : esInscribible(tournament.status) ? (
                <FormInvitado
                  slug={slug}
                  guestName={guestName}
                  onGuestName={setGuestName}
                  guestHandicap={guestHandicap}
                  onGuestHandicap={setGuestHandicap}
                  guestJoining={guestJoining}
                  onJoin={handleGuestJoin}
                />
              ) : (
                /* Torneo no inscribible y no autenticado */
                <AvisoInscripcion
                  titulo={tournament.status === 'draft'
                    ? 'Las inscripciones de este torneo aún no están abiertas'
                    : 'Las inscripciones de este torneo están cerradas'}
                >
                  <LinkVerLeaderboard slug={slug} />
                </AvisoInscripcion>
              )
            ) : alreadyRegistered ? (
              <AvisoInscripcion tono="ok" titulo="Ya estás inscrito en este torneo">
                <LinkVerLeaderboard slug={slug} />
              </AvisoInscripcion>
            ) : !esInscribible(tournament.status) ? (
              /* Guard CERO FALLOS: el torneo NO acepta auto-inscripción
                 (draft = aún no abierto; closed/in_progress = ya cerró).
                 Mostramos estado honesto en vez de un botón que falla. */
              <AvisoInscripcion
                titulo={tournament.status === 'draft'
                  ? 'Las inscripciones de este torneo aún no están abiertas'
                  : 'Las inscripciones de este torneo están cerradas'}
                detalle={tournament.status === 'draft'
                  ? 'El organizador todavía no abrió las inscripciones. Vuelve a intentarlo más tarde.'
                  : 'Ya no se puede inscribir en este torneo.'}
              >
                <LinkVerLeaderboard slug={slug} />
              </AvisoInscripcion>
            ) : capacity?.full ? (
              /* Guard CERO FALLOS: el torneo llegó a su cupo. El RPC rechaza con
                 un 409 cuyo mensaje ("Amplía el cupo máximo...") está escrito para
                 el ORGANIZADOR. Al jugador le mostramos un estado honesto ANTES. */
              <AvisoInscripcion
                titulo="Torneo completo"
                detalle={capacity.maxPlayers != null
                  ? `Este torneo llegó a su cupo de ${capacity.maxPlayers} jugadores. Habla con el organizador para que lo amplíe.`
                  : 'Este torneo ya no admite más inscritos. Habla con el organizador.'}
              >
                <LinkVerLeaderboard slug={slug} />
              </AvisoInscripcion>
            ) : profile && profile.indice == null ? (
              /* Guard CERO FALLOS: sin índice de handicap el score NETO sale
                 corrupto (caso garantizado del recién registrado). Lo mandamos a
                 cargar el índice ANTES de inscribirse, en vez de dejarlo entrar mal. */
              <AvisoInscripcion
                titulo="Necesitas tu índice de handicap"
                detalle="Sin índice, tu score neto sale mal en el torneo. Cárgalo en tu perfil y vuelve por este mismo link."
              >
                <Link
                  href="/perfil"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: '44px',
                    background: 'var(--brand)',
                    color: 'var(--brand-dark)',
                    fontWeight: 700,
                    fontSize: '14px',
                    padding: '0 24px',
                    borderRadius: '10px',
                    textDecoration: 'none',
                  }}
                >
                  Cargar mi índice
                </Link>
              </AvisoInscripcion>
            ) : (
              <Button type="button" variant="commit" size="lg" fullWidth onClick={handleInscribirse} disabled={inscribing || !profile}>
                {inscribing ? 'Inscribiendo...' : 'Inscribirme'}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
