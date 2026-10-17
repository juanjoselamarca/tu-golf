'use client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { esInscribible } from '@/lib/data/tournaments/joinFlow'
import { useInscripcionTorneo } from './hooks/useInscripcionTorneo'
import { TarjetaTorneoInscripcion } from './components/TarjetaTorneoInscripcion'
import { TarjetaPerfilInscripcion } from './components/TarjetaPerfilInscripcion'
import { FormInvitado } from './components/FormInvitado'
import { AvisoInscripcion, LinkVerLeaderboard } from './components/AvisoInscripcion'
import { InscripcionExitosa } from './components/InscripcionExitosa'

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
        <Link href={`/torneo/${slug}`} style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', padding: '12px 0', display: 'inline-block' }}>
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
              background: 'rgba(220,50,50,0.12)',
              border: '1px solid rgba(220,50,50,0.3)',
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
            <button
              type="button"
              onClick={reintentarCarga}
              style={{
                width: '100%',
                background: 'var(--brand)',
                color: 'var(--brand-dark)',
                fontWeight: 700,
                fontSize: '16px',
                padding: '16px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
            <Link
              href="/"
              style={{ fontSize: '13px', color: 'var(--text-2)', textDecoration: 'underline', textUnderlineOffset: '3px', marginTop: '14px', display: 'inline-block' }}
            >
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
              esInscribible(tournament.status) ? (
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
              <div
                style={{
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  borderRadius: '12px',
                  padding: '18px',
                  textAlign: 'center',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontSize: '15px', color: 'var(--status-live-fg)', fontWeight: 600, marginBottom: '4px' }}>
                  Ya estás inscrito en este torneo
                </div>
                <LinkVerLeaderboard slug={slug} />
              </div>
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
                    display: 'inline-block',
                    background: 'var(--brand)',
                    color: 'var(--brand-dark)',
                    fontWeight: 700,
                    fontSize: '14px',
                    padding: '12px 24px',
                    borderRadius: '10px',
                    textDecoration: 'none',
                  }}
                >
                  Cargar mi índice
                </Link>
              </AvisoInscripcion>
            ) : (
              <button
                type="button"
                onClick={handleInscribirse}
                disabled={inscribing || !profile}
                style={{
                  width: '100%',
                  background: 'var(--brand)',
                  color: 'var(--brand-dark)',
                  fontWeight: 700,
                  fontSize: '16px',
                  padding: '16px',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: inscribing ? 'not-allowed' : 'pointer',
                  opacity: inscribing ? 0.7 : 1,
                  transition: 'opacity 200ms',
                }}
              >
                {inscribing ? 'Inscribiendo...' : 'Inscribirme'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
