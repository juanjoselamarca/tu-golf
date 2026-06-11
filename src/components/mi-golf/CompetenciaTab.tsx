// src/components/mi-golf/CompetenciaTab.tsx
import Link from 'next/link'
import { Flag, Trophy, Check } from '@/components/icons'
import TournamentCardMenu from '@/components/TournamentCardMenu'
import type { Tournament, RondaLibre, HistoricalRound, ComunidadMensaje } from '@/lib/mi-golf/types'
import { torneoEnVivo } from '@/golf/tournament-live-status'
import { esMejorDelMes } from '@/lib/mi-golf/mejor-del-mes'
import { UltimaRondaHero } from '@/components/mi-golf/UltimaRondaHero'
import { getUltimaRondaReciente } from '@/lib/mi-golf/ultima-ronda'

type Props = {
  userName: string
  hcpDisplay: string | null
  activeRonda: RondaLibre | null
  activeRondaSummary: { hoyoActual: number; totalHoyos: number; scoreParcial: number | null } | null
  torneoInminente: (Tournament & { horaSalida: string | null; diasRestantes: number }) | null
  playingInTournaments: (Tournament & { horaSalida: string | null; diasRestantes: number })[]
  organizingTournaments: (Tournament & { inscritos: number; hoyoActual: number | null })[]
  recentFinishedTournaments: (Tournament & { posicionFinal: string | null; totalJugadores: number | null })[]
  finishedRondas: (RondaLibre & {
    total_gross: number | null
    vsPar: number | null
    scores: number[] | null
    parPerHole: number[] | null
  })[]
  historico: HistoricalRound[]
  comunidad: ComunidadMensaje
  fechaHoy: string
}

const GOLD = '#c4992a'
const TEXT = '#1a1a1a'
const TEXT_2 = '#666'
const TEXT_3 = '#999'
const BORDER = '#e8e8e8'
const BORDER_SOFT = '#f2f2f2'
const BG_SOFT = '#fafafa'
const GREEN = '#2d7a3e'

export function CompetenciaTab(props: Props) {
  const {
    userName,
    hcpDisplay,
    activeRonda,
    activeRondaSummary,
    torneoInminente,
    playingInTournaments,
    organizingTournaments,
    recentFinishedTournaments,
    finishedRondas,
    historico,
    comunidad,
    fechaHoy,
  } = props

  return (
    <main style={{ padding: '24px 24px 32px', maxWidth: '640px', margin: '0 auto' }}>
      {/* GREETING */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px' }}>
        <div style={{ fontFamily: 'var(--font-playfair)', fontSize: '22px', color: TEXT, fontWeight: 600 }}>
          Hola, {userName}
        </div>
        {hcpDisplay && (
          <div style={{ fontSize: '12px', color: TEXT_2, fontWeight: 500 }}>
            HCP{' '}
            <span style={{ fontFamily: 'var(--font-playfair)', fontWeight: 700, color: GOLD, marginLeft: '4px', fontSize: '14px' }}>
              {hcpDisplay}
            </span>
          </div>
        )}
      </div>

      {/* HERO CONTEXTUAL (4 estados, prioridad descendente) */}
      {activeRonda ? (
        <HeroActiva ronda={activeRonda} summary={activeRondaSummary} />
      ) : torneoInminente ? (
        <HeroProximo torneo={torneoInminente} />
      ) : (() => {
        const ultima = getUltimaRondaReciente(finishedRondas, fechaHoy)
        return ultima ? <UltimaRondaHero ronda={ultima} /> : <HeroVacio />
      })()}

      {/* ACCIONES — jerarquía 80/20 */}
      <Acciones />


      {/* TORNEOS */}
      {(playingInTournaments.length > 0 ||
        organizingTournaments.length > 0 ||
        recentFinishedTournaments.length > 0) && (
        <Torneos
          playing={playingInTournaments}
          organizing={organizingTournaments}
          finished={recentFinishedTournaments}
        />
      )}

      {/* RONDAS */}
      {finishedRondas.length > 0 && <Rondas rondas={finishedRondas} historico={historico} fechaHoy={fechaHoy} />}

      {/* COMUNIDAD */}
      {comunidad && <Comunidad comunidad={comunidad} />}
    </main>
  )
}

function HeroActiva({
  ronda,
  summary,
}: {
  ronda: RondaLibre
  summary: { hoyoActual: number; totalHoyos: number; scoreParcial: number | null } | null
}) {
  return (
    <Link
      href={`/ronda-libre/${ronda.codigo}/score`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        background: GOLD,
        color: '#fff',
        borderRadius: '12px',
        padding: '18px 20px',
        marginBottom: '20px',
        textDecoration: 'none',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 8px rgba(34,197,94,0.7)',
              animation: 'livePulse 2s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-dm-mono)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              fontWeight: 700,
              color: '#fff',
            }}
          >
            En vivo
          </span>
        </div>
        <div style={{ fontSize: '17px', fontWeight: 700, lineHeight: 1.2 }}>{ronda.course_name}</div>
        {summary && (
          <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '4px' }}>
            Hoyo {summary.hoyoActual} de {summary.totalHoyos} · Continuar →
          </div>
        )}
      </div>
      {summary?.scoreParcial != null && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-playfair)', fontSize: '32px', fontWeight: 700, lineHeight: 1 }}>
            {summary.scoreParcial >= 0 ? '+' : ''}{summary.scoreParcial}
          </div>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px', fontWeight: 600, opacity: 0.85 }}>
            vs par
          </div>
        </div>
      )}
    </Link>
  )
}

function HeroProximo({
  torneo,
}: {
  torneo: Tournament & { horaSalida: string | null; diasRestantes: number }
}) {
  const countdown = torneo.diasRestantes === 0 ? 'Hoy' : torneo.diasRestantes === 1 ? '1d' : `${torneo.diasRestantes}d`
  const sub = torneo.horaSalida
    ? `${torneo.courses?.nombre ?? 'Cancha'} · Salida ${torneo.horaSalida}`
    : (torneo.courses?.nombre ?? 'Cancha por confirmar')

  return (
    <Link
      href={`/torneo/${torneo.slug}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        background: '#fff',
        color: TEXT,
        border: `1px solid ${GOLD}`,
        borderLeft: `4px solid ${GOLD}`,
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px',
        textDecoration: 'none',
      }}
    >
      <div>
        <div style={{ fontSize: '11px', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: GOLD, marginBottom: '6px' }}>
          Próximo compromiso
        </div>
        <div style={{ fontSize: '17px', fontWeight: 700, lineHeight: 1.2 }}>{torneo.name}</div>
        <div style={{ fontSize: '12px', color: TEXT_2, marginTop: '4px' }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-playfair)', fontSize: '32px', fontWeight: 700, lineHeight: 1, color: GOLD }}>
          {countdown}
        </div>
        <div style={{ fontSize: '10px', fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px', fontWeight: 600, color: TEXT_2 }}>
          restantes
        </div>
      </div>
    </Link>
  )
}

function HeroVacio() {
  return (
    <div
      style={{
        background: BG_SOFT,
        borderRadius: '12px',
        padding: '18px 20px',
        marginBottom: '20px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '14px', color: TEXT, fontWeight: 500, marginBottom: '6px' }}>
        Sin torneos ni rondas en curso
      </div>
      <div style={{ fontSize: '12px', color: TEXT_2 }}>¿Querés jugar hoy?</div>
    </div>
  )
}

function Acciones() {
  return (
    <div style={{ marginBottom: '28px' }}>
      <Link
        href="/ronda-libre/nueva"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          background: TEXT,
          color: '#fff',
          borderRadius: '14px',
          padding: '16px 20px',
          fontSize: '15px',
          fontWeight: 700,
          textDecoration: 'none',
          minHeight: '56px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          marginBottom: '12px',
        }}
      >
        <span style={{ fontSize: '20px', fontWeight: 300, lineHeight: 1 }}>+</span>
        Nueva ronda
      </Link>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          fontSize: '12px',
        }}
      >
        <Link
          href="/torneo/nuevo"
          style={{
            color: TEXT_2,
            fontWeight: 500,
            textDecoration: 'none',
            borderBottom: `1px solid ${BORDER}`,
            paddingBottom: '2px',
          }}
        >
          Organizar torneo
        </Link>
        <Link
          href="/torneo/unirme"
          style={{
            color: TEXT_2,
            fontWeight: 500,
            textDecoration: 'none',
            borderBottom: `1px solid ${BORDER}`,
            paddingBottom: '2px',
          }}
        >
          Unirme con código
        </Link>
      </div>
    </div>
  )
}

function Torneos({
  playing,
  organizing,
  finished,
}: {
  playing: (Tournament & { horaSalida: string | null; diasRestantes: number })[]
  organizing: (Tournament & { inscritos: number; hoyoActual: number | null })[]
  finished: (Tournament & { posicionFinal: string | null; totalJugadores: number | null })[]
}) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <SectionLabel label="Torneos" linkText="Ver todos →" linkHref="/perfil/historial" />

      {playing.length > 0 && (
        <SubGroup
          icon={<Flag size={14} />}
          label="Jugando en"
          accent={GOLD}
          accentBorder
        >
          {playing.map((t) => (
            <TorneoRowPlaying key={t.id} t={t} />
          ))}
        </SubGroup>
      )}
      {organizing.length > 0 && (
        <SubGroup
          icon={<Trophy size={14} />}
          label="Organizando"
          accent={TEXT_2}
          accentBorder
        >
          {organizing.map((t) => (
            <TorneoRowOrganizing key={t.id} t={t} />
          ))}
        </SubGroup>
      )}
      {finished.length > 0 && (
        <SubGroup
          icon={<Check size={14} />}
          label="Finalizados recientes"
          accent={TEXT_3}
          muted
        >
          {finished.map((t) => (
            <TorneoRowFinished key={t.id} t={t} />
          ))}
        </SubGroup>
      )}
    </div>
  )
}

function TorneoRowPlaying({ t }: { t: Tournament & { horaSalida: string | null; diasRestantes: number } }) {
  const chipText =
    t.diasRestantes === 0
      ? 'Hoy'
      : t.diasRestantes === 1
      ? 'Mañana'
      : t.diasRestantes < 0
      ? 'En curso'
      : `En ${t.diasRestantes} días`

  return (
    <Link
      href={`/torneo/${t.slug}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '12px',
        padding: '11px 0',
        borderBottom: `1px solid ${BORDER_SOFT}`,
        textDecoration: 'none',
        color: TEXT,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.name}
        </div>
        <div style={{ fontSize: '11px', color: TEXT_2, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Chip variant="upcoming">{chipText}</Chip>
          <span>{t.courses?.nombre}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', color: TEXT_2, fontWeight: 500 }}>Inscrito</div>
        {t.horaSalida && <div style={{ fontSize: '11px', color: TEXT, fontWeight: 600, marginTop: '2px' }}>Salida {t.horaSalida}</div>}
      </div>
    </Link>
  )
}

function TorneoRowOrganizing({ t }: { t: Tournament & { inscritos: number; hoyoActual: number | null } }) {
  const isLive = torneoEnVivo(t.status, t.date_start, null, new Date())
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        gap: '12px',
        padding: '11px 0',
        borderBottom: `1px solid ${BORDER_SOFT}`,
        alignItems: 'center',
      }}
    >
      <Link
        href={`/torneo/${t.slug}`}
        style={{
          minWidth: 0,
          textDecoration: 'none',
          color: TEXT,
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.name}
        </div>
        <div style={{ fontSize: '11px', color: TEXT_2, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isLive ? <Chip variant="live">En curso</Chip> : <Chip variant="upcoming">Abierto</Chip>}
          <span>{t.courses?.nombre}</span>
        </div>
      </Link>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', color: TEXT_2, fontWeight: 500 }}>{t.inscritos} jugadores</div>
        {t.hoyoActual != null && (
          <div style={{ fontSize: '11px', color: TEXT, fontWeight: 600, marginTop: '2px' }}>Hoyo {t.hoyoActual}/18</div>
        )}
      </div>
      <TournamentCardMenu slug={t.slug} isActive={isLive} />
    </div>
  )
}

function TorneoRowFinished({
  t,
}: {
  t: Tournament & { posicionFinal: string | null; totalJugadores: number | null }
}) {
  return (
    <Link
      href={`/torneo/${t.slug}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '12px',
        padding: '11px 0',
        borderBottom: `1px solid ${BORDER_SOFT}`,
        textDecoration: 'none',
        color: TEXT,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.name}
        </div>
        <div style={{ fontSize: '11px', color: TEXT_2, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Chip variant="finished">Finalizado</Chip>
          <span>{t.courses?.nombre}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {t.posicionFinal && (
          <>
            <div style={{ fontFamily: 'var(--font-playfair)', fontSize: '16px', fontWeight: 700, color: GOLD }}>
              {t.posicionFinal}
            </div>
            {t.totalJugadores && (
              <div style={{ fontSize: '9px', color: TEXT_3, fontWeight: 600, marginTop: '2px' }}>
                de {t.totalJugadores}
              </div>
            )}
          </>
        )}
      </div>
    </Link>
  )
}

function Chip({ variant, children }: { variant: 'live' | 'upcoming' | 'finished'; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    live: { background: '#fef5e0', color: GOLD },
    upcoming: { background: '#f0f5ff', color: '#3b5aa3' },
    finished: { background: '#f2f2f2', color: TEXT_2 },
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '9px',
        fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 700,
        ...styles[variant],
      }}
    >
      {children}
    </span>
  )
}

function Rondas({
  rondas,
  historico,
  fechaHoy,
}: {
  rondas: (RondaLibre & { total_gross: number | null; vsPar: number | null })[]
  historico: HistoricalRound[]
  fechaHoy: string
}) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <SectionLabel label="Últimas rondas" linkText="Ver todas →" linkHref="/rondas" />
      {rondas.slice(0, 3).map((r) => {
        const matchingHist = historico.find((h) => h.course_name === r.course_name && h.played_at === r.fecha)
        const esMejor = matchingHist ? esMejorDelMes(matchingHist, historico, fechaHoy) : false
        const fechaContextual = formatFechaContextual(r.fecha, fechaHoy)

        return (
          <Link
            key={r.id}
            href={`/ronda-libre/${r.codigo}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: '12px',
              padding: '11px 0',
              borderBottom: `1px solid ${BORDER_SOFT}`,
              textDecoration: 'none',
              color: TEXT,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.course_name}
              </div>
              <div style={{ fontSize: '11px', color: TEXT_3, marginTop: '3px' }}>{fechaContextual}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {r.total_gross != null && (
                <>
                  <div style={{ fontFamily: 'var(--font-playfair)', fontSize: '16px', fontWeight: 700, color: TEXT }}>
                    {r.total_gross}
                  </div>
                  {esMejor ? (
                    <div style={{ fontSize: '11px', color: GREEN, fontWeight: 700, marginTop: '2px' }}>↑ Tu mejor del mes</div>
                  ) : r.vsPar != null ? (
                    <div style={{ fontSize: '11px', color: TEXT_2, fontWeight: 500, marginTop: '2px' }}>
                      {r.vsPar >= 0 ? '+' : ''}{r.vsPar} vs par
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function formatFechaContextual(fecha: string | null, hoy: string): string {
  if (!fecha) return ''
  const d = new Date(fecha + 'T12:00:00')
  const h = new Date(hoy + 'T12:00:00')
  const diffDays = Math.round((h.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) {
    const dia = d.toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'America/Santiago' })
    return dia.charAt(0).toUpperCase() + dia.slice(1)
  }
  if (diffDays < 14) {
    const dia = d.toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'America/Santiago' })
    return `${dia.charAt(0).toUpperCase() + dia.slice(1)} pasado`
  }
  return `Hace ${diffDays} días`
}

function Comunidad({ comunidad }: { comunidad: NonNullable<ComunidadMensaje> }) {
  return (
    <Link
      href={comunidad.href}
      style={{
        marginTop: '20px',
        padding: '10px 14px',
        background: BG_SOFT,
        borderRadius: '10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        textDecoration: 'none',
        color: TEXT,
      }}
    >
      <div style={{ fontSize: '12px' }} dangerouslySetInnerHTML={{ __html: comunidad.texto }} />
      <div style={{ fontSize: '14px', color: GOLD, fontWeight: 700 }}>→</div>
    </Link>
  )
}

function SectionLabel({ label, linkText, linkHref }: { label: string; linkText: string; linkHref: string }) {
  return (
    <div
      style={{
        fontSize: '10px',
        fontFamily: 'var(--font-dm-mono)', textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: TEXT_3,
        fontWeight: 700,
        marginBottom: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
      }}
    >
      <span>{label}</span>
      <Link href={linkHref} style={{ fontSize: '11px', color: GOLD, textTransform: 'none', letterSpacing: 0, fontWeight: 600, textDecoration: 'none' }}>
        {linkText}
      </Link>
    </div>
  )
}

function SubGroup({
  icon,
  label,
  accent,
  accentBorder,
  muted,
  children,
}: {
  icon: React.ReactNode
  label: string
  accent: string
  accentBorder?: boolean
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        marginBottom: '20px',
        paddingLeft: accentBorder ? '12px' : '0',
        borderLeft: accentBorder ? `2px solid ${accent}` : 'none',
        opacity: muted ? 0.75 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '9px',
          fontFamily: 'var(--font-dm-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: accent,
          fontWeight: 700,
          marginBottom: '8px',
        }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div>{children}</div>
    </div>
  )
}
