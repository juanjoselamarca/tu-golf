'use client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { esInscribible } from '@/lib/data/tournaments/joinFlow'
import { useInscripcionTorneo } from './hooks/useInscripcionTorneo'
import { TarjetaTorneoInscripcion } from './components/TarjetaTorneoInscripcion'
import { TarjetaPerfilInscripcion } from './components/TarjetaPerfilInscripcion'
import { InscripcionSinSesion } from './components/InscripcionSinSesion'
import {
  AvisoInscripcion, AvisoInscripcionesCerradas, AvisoTorneoCompleto, LinkVerLeaderboard, LINK_SECUNDARIO_44,
} from './components/AvisoInscripcion'
import { Button } from '@/components/ui/Button'
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
    invitados,
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
              /* Visitor sin sesión: cerrado / completo / sin invitados / formulario de invitado */
              <InscripcionSinSesion
                slug={slug}
                tournament={tournament}
                capacity={capacity}
                invitados={invitados}
                guestName={guestName}
                onGuestName={setGuestName}
                guestHandicap={guestHandicap}
                onGuestHandicap={setGuestHandicap}
                guestJoining={guestJoining}
                onJoin={handleGuestJoin}
                onReintentar={reintentarCarga}
              />
            ) : alreadyRegistered ? (
              <AvisoInscripcion tono="ok" titulo="Ya estás inscrito en este torneo">
                <LinkVerLeaderboard slug={slug} />
              </AvisoInscripcion>
            ) : !esInscribible(tournament.status) ? (
              <AvisoInscripcionesCerradas status={tournament.status} slug={slug} />
            ) : capacity?.full ? (
              <AvisoTorneoCompleto capacity={capacity} slug={slug} />
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
