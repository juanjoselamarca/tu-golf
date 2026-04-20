// src/components/mi-golf/CompetenciaTab.tsx
import Link from 'next/link'
import { Flag, Upload, Trophy } from '@/components/icons'
import { EmptyStateOnboarding } from './EmptyStateOnboarding'
import TournamentCardMenu from '@/components/TournamentCardMenu'
import EnVivoWidget from '@/components/EnVivoWidget'
import type { Tournament, RondaLibre } from '@/lib/mi-golf/types'

type Props = {
  userName: string
  activeRonda: RondaLibre | null
  activeTournaments: Tournament[]
  myTournaments: Tournament[]
  playedTournaments: Tournament[]
  finishedRondas: RondaLibre[]
  isNewUser: boolean
}

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e5e5',
  borderRadius: '12px',
  padding: '14px 16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

export function CompetenciaTab(props: Props) {
  const { userName, activeRonda, activeTournaments, myTournaments, playedTournaments, finishedRondas, isNewUser } = props

  if (isNewUser) {
    return (
      <main style={{ padding: '16px 16px 80px', maxWidth: '640px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#1a1a1a', margin: '8px 0 4px' }}>
          Hola, {userName}
        </h1>
        <EmptyStateOnboarding />
      </main>
    )
  }

  const now = Date.now()
  const sieteDias = 7 * 86400000
  const torneoInminente = activeTournaments.find((t) => {
    if (!t.date_start) return false
    const dt = new Date(t.date_start).getTime()
    return dt - now <= sieteDias
  })

  return (
    <main style={{ padding: '16px 16px 80px', maxWidth: '640px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#1a1a1a', margin: '8px 0 16px' }}>
        Hola, {userName}
      </h1>

      {activeRonda ? (
        <HeroRondaActiva ronda={activeRonda} torneoInminente={torneoInminente ?? null} />
      ) : torneoInminente ? (
        <HeroTorneoInminente torneo={torneoInminente} />
      ) : (
        <HeroVacio />
      )}

      <AccionesRapidas />

      {(activeTournaments.length > 0 || myTournaments.length > 0 || playedTournaments.length > 0) && (
        <MisTorneos
          activosJugador={activeTournaments}
          misOrganizados={myTournaments}
          jugadosFinalizados={playedTournaments}
        />
      )}

      {finishedRondas.length > 0 && <UltimasRondas rondas={finishedRondas} />}

      <EnVivoWidget />
    </main>
  )
}

function HeroRondaActiva({ ronda, torneoInminente }: { ronda: RondaLibre; torneoInminente: Tournament | null }) {
  return (
    <section style={{ marginBottom: '16px' }}>
      <Link
        href={`/ronda-libre/${ronda.codigo}/score`}
        style={{
          display: 'block',
          background: '#c4992a',
          color: '#1a1a2e',
          borderRadius: '12px',
          padding: '18px',
          textDecoration: 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>
          Ronda en curso
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>{ronda.course_name}</div>
        <div style={{ fontSize: '14px', marginTop: '8px', fontWeight: 600 }}>Continuar →</div>
      </Link>
      {torneoInminente && (
        <Link
          href={`/torneo/${torneoInminente.slug}`}
          style={{
            display: 'block',
            marginTop: '8px',
            ...cardStyle,
            color: '#1a1a1a',
            textDecoration: 'none',
            borderLeft: '3px solid #c4992a',
          }}
        >
          <div style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>
            También tenés torneo próximo
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px' }}>{torneoInminente.name}</div>
        </Link>
      )}
    </section>
  )
}

function HeroTorneoInminente({ torneo }: { torneo: Tournament }) {
  const dias = torneo.date_start
    ? Math.max(0, Math.floor((new Date(torneo.date_start).getTime() - Date.now()) / 86400000))
    : 0
  const countdown = dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `En ${dias} días`

  return (
    <section style={{ marginBottom: '16px' }}>
      <Link
        href={`/torneo/${torneo.slug}`}
        style={{
          display: 'block',
          ...cardStyle,
          textDecoration: 'none',
          color: '#1a1a1a',
          borderLeft: '3px solid #c4992a',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c4992a' }}>
          {countdown}
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>{torneo.name}</div>
        <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
          {torneo.courses?.nombre ?? 'Cancha por confirmar'}
        </div>
      </Link>
    </section>
  )
}

function HeroVacio() {
  return (
    <section style={{ marginBottom: '16px' }}>
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>Sin actividad en curso</div>
        <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
          ¿Listo para jugar hoy?
        </div>
        <Link
          href="/coach"
          style={{
            display: 'inline-block',
            marginTop: '10px',
            fontSize: '12px',
            color: '#c4992a',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ¿Qué dice tu coach esta semana? →
        </Link>
      </div>
    </section>
  )
}

function AccionesRapidas() {
  const pillBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 16px',
    minHeight: '44px',
    borderRadius: '22px',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  }
  return (
    <section style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Link
          href="/ronda-libre/nueva"
          style={{ ...pillBase, background: '#c4992a', color: '#ffffff', fontWeight: 700 }}
        >
          <Flag size={16} />
          Nueva ronda
        </Link>
        <Link
          href="/torneo/nuevo"
          style={{ ...pillBase, background: '#ffffff', color: '#1a1a1a', border: '1px solid #e5e5e5' }}
        >
          <Trophy size={16} />
          Organizar torneo
        </Link>
        <Link
          href="/torneo/unirme"
          style={{ ...pillBase, background: '#ffffff', color: '#1a1a1a', border: '1px solid #e5e5e5' }}
        >
          <Upload size={16} />
          Unirme con código
        </Link>
      </div>
    </section>
  )
}

function MisTorneos({
  activosJugador,
  misOrganizados,
  jugadosFinalizados,
}: {
  activosJugador: Tournament[]
  misOrganizados: Tournament[]
  jugadosFinalizados: Tournament[]
}) {
  const ultimosFinalizados = jugadosFinalizados.slice(0, 2)

  return (
    <section style={{ marginBottom: '20px', ...cardStyle }}>
      {activosJugador.length > 0 && (
        <Subseccion label="Jugando en">
          {activosJugador.map((t) => (
            <TorneoRow key={t.id} t={t} />
          ))}
        </Subseccion>
      )}
      {misOrganizados.length > 0 && (
        <Subseccion label="Organizando">
          {misOrganizados.map((t) => (
            <TorneoRow key={t.id} t={t} withMenu />
          ))}
        </Subseccion>
      )}
      {ultimosFinalizados.length > 0 && (
        <Subseccion label="Finalizados recientes">
          {ultimosFinalizados.map((t) => (
            <TorneoRow key={t.id} t={t} muted />
          ))}
        </Subseccion>
      )}
      <Link
        href="/perfil/historial"
        style={{
          display: 'block',
          textAlign: 'center',
          marginTop: '10px',
          paddingTop: '10px',
          borderTop: '1px solid #e5e5e5',
          fontSize: '13px',
          fontWeight: 600,
          color: '#c4992a',
          textDecoration: 'none',
        }}
      >
        Ver todos mis torneos
      </Link>
    </section>
  )
}

function Subseccion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '8px',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{children}</div>
    </div>
  )
}

function TorneoRow({ t, withMenu, muted }: { t: Tournament; withMenu?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <Link
        href={`/torneo/${t.slug}`}
        style={{
          fontSize: '14px',
          fontWeight: muted ? 500 : 600,
          color: muted ? '#666' : '#1a1a1a',
          textDecoration: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}
      >
        {t.name}
      </Link>
      {withMenu && <TournamentCardMenu slug={t.slug} isActive={t.status === 'active' || t.status === 'in_progress'} />}
    </div>
  )
}

function UltimasRondas({ rondas }: { rondas: RondaLibre[] }) {
  const feed = rondas.slice(0, 3)
  return (
    <section style={{ marginBottom: '20px', ...cardStyle }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '8px',
        }}
      >
        Últimas rondas
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {feed.map((r, i) => {
          const fecha = r.fecha
            ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
            : ''
          return (
            <Link
              key={r.id}
              href={`/ronda-libre/${r.codigo}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderTop: i > 0 ? '1px solid #f0f0f0' : 'none',
                textDecoration: 'none',
                color: '#1a1a1a',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.course_name}
              </span>
              <span style={{ fontSize: '12px', color: '#666', flexShrink: 0 }}>{fecha}</span>
            </Link>
          )
        })}
      </div>
      <Link
        href="/rondas"
        style={{
          display: 'block',
          textAlign: 'center',
          marginTop: '10px',
          paddingTop: '10px',
          borderTop: '1px solid #e5e5e5',
          fontSize: '13px',
          fontWeight: 600,
          color: '#c4992a',
          textDecoration: 'none',
        }}
      >
        Ver todas mis rondas
      </Link>
    </section>
  )
}
