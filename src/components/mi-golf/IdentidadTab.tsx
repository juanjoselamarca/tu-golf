// src/components/mi-golf/IdentidadTab.tsx
import Link from 'next/link'
import { Trophy, MapPin, Flag, BarChart3 } from '@/components/icons'
import type { Nivel, StatsForma, TaigerLine } from '@/lib/mi-golf/types'
import { LevelsBar } from '@/components/perfil/LevelsBar'
import { ROTULO_INDICE, CTA_SIN_INDICE, type IndiceVisible } from '@/golf/core/indice-visible'
import { RUTA_EDITAR_INDICE } from '@/lib/rutas'

type Props = {
  userName: string
  /** Índice oficial del jugador (`indiceVisible`); el Golfers+ se ve solo en /perfil. */
  indice: IndiceVisible
  nivel: Nivel | null
  totalRounds: number
  taigerSessionCount: number
  stats: StatsForma
  taigerLine: TaigerLine
  ultimasGross: number[]
}

const GOLD = 'var(--brand-on-bg)'
const GOLD_SOFT = 'rgba(196,153,42,0.08)'
const TEXT = 'var(--text)'
const TEXT_2 = 'var(--text-2)'
const TEXT_3 = 'var(--text-3)'
const BORDER = 'var(--border)'
const BG_SOFT = 'var(--bg-surface)'

export function IdentidadTab(props: Props) {
  const {
    userName,
    indice,
    nivel,
    totalRounds,
    taigerSessionCount,
    stats,
    taigerLine,
    ultimasGross,
  } = props
  void userName

  const mostrarBarraTaiger = totalRounds < 5 || taigerSessionCount === 0

  const mostrarSeccionTuJuego =
    stats.mejorScore != null ||
    stats.canchaFavorita != null ||
    stats.rondasJugadas > 0 ||
    stats.promedioUltimas5 != null

  return (
    <main style={{ padding: '32px 24px 32px', maxWidth: '640px', margin: '0 auto' }}>
      <Hero indice={indice} />

      {nivel && <LevelsBar nivel={nivel} />}

      {mostrarBarraTaiger && (
        <div style={{ margin: '40px 0 0' }}>
          <SectionLabel>Progresos</SectionLabel>
          <Progreso label="Desbloqueo tAIger+" actual={Math.min(totalRounds, 5)} total={5} />
        </div>
      )}

      {mostrarSeccionTuJuego && <TuJuego stats={stats} ultimasGross={ultimasGross} />}

      <TaigerCard line={taigerLine} taigerSessionCount={taigerSessionCount} totalRounds={totalRounds} />
    </main>
  )
}

/**
 * El índice oficial (profiles.indice), rotulado "Índice". Sin índice no se inventa
 * número: el CTA lleva a /perfil a cargarlo. El Índice Golfers+ vive solo en /perfil.
 */
function Hero({ indice }: { indice: IndiceVisible }) {
  const conIndice = indice.estado === 'con-indice'
  return (
    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
      <div
        className="num"
        style={{
          fontSize: '40px',
          fontWeight: 700,
          color: conIndice ? GOLD : TEXT_3,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {conIndice ? indice.texto : '—'}
      </div>
      <div style={{ fontSize: '13px', color: TEXT_2, fontWeight: 600, marginTop: '8px' }}>
        {ROTULO_INDICE}
      </div>
      {!conIndice && (
        <Link
          href={RUTA_EDITAR_INDICE}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: '44px',
            marginTop: '8px',
            padding: '0 18px',
            border: '1px solid rgba(196,153,42,0.6)',
            borderRadius: '12px',
            color: GOLD,
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {CTA_SIN_INDICE} →
        </Link>
      )}
    </div>
  )
}

function Progreso({ label, actual, total }: { label: string; actual: number; total: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((actual / total) * 100)))
  return (
    <div style={{ marginBottom: '18px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '6px',
        }}
      >
        <span style={{ fontSize: '13px', color: TEXT, fontWeight: 500 }}>{label}</span>
        <span
          style={{
            fontFamily: 'var(--font-playfair)',
            fontSize: '14px',
            fontWeight: 700,
            color: GOLD,
          }}
        >
          {pct}%
        </span>
      </div>
      <div style={{ height: '3px', background: BORDER, borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: GOLD, width: `${pct}%`, borderRadius: '2px' }} />
      </div>
    </div>
  )
}

function TuJuego({ stats, ultimasGross }: { stats: StatsForma; ultimasGross: number[] }) {
  return (
    <div style={{ marginTop: '36px' }}>
      <SectionLabel>Tu juego</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px',
        }}
      >
        {stats.mejorScore != null && (
          <StatCard
            icon={<Trophy size={14} />}
            label="Mejor score"
            value={String(stats.mejorScore.gross)}
            sub={`${stats.mejorScore.vsPar >= 0 ? '+' : ''}${stats.mejorScore.vsPar} vs par`}
            accent
          />
        )}
        {stats.promedioUltimas5 != null && (
          <StatCard
            icon={<BarChart3 size={14} />}
            label="Promedio últimas 5"
            value={stats.promedioUltimas5.toFixed(1)}
            sub="golpes"
            sparkline={ultimasGross}
          />
        )}
        {stats.rondasJugadas > 0 && (
          <StatCard
            icon={<Flag size={14} />}
            label="Rondas jugadas"
            value={String(stats.rondasJugadas)}
          />
        )}
        {stats.canchaFavorita && (
          <StatCard
            icon={<MapPin size={14} />}
            label="Cancha favorita"
            value={stats.canchaFavorita.nombre}
            sub={`${stats.canchaFavorita.vecesJugada} veces`}
            compact
          />
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  compact,
  sparkline,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent?: boolean
  compact?: boolean
  sparkline?: number[]
}) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${BORDER}`,
        borderTop: accent ? `2px solid ${GOLD}` : `1px solid ${BORDER}`,
        borderRadius: '12px',
        padding: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        minHeight: '96px',
        display: 'flex',
        flexDirection: 'column',
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
          letterSpacing: '0.05em',
          color: TEXT_3,
          fontWeight: 700,
          marginBottom: '8px',
        }}
      >
        <span style={{ color: accent ? GOLD : TEXT_2 }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: compact ? '15px' : '26px',
          fontWeight: 700,
          color: TEXT,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: '11px',
            color: TEXT_2,
            marginTop: '4px',
            fontWeight: 500,
          }}
        >
          {sub}
        </div>
      )}
      {sparkline && sparkline.length >= 2 && (
        <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
          <Sparkline values={sparkline} />
        </div>
      )}
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const width = 80
  const height = 18
  const step = width / (values.length - 1)
  const points = values
    .map((v, i) => {
      const x = i * step
      const y = height - ((v - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function TaigerCard({
  line,
  taigerSessionCount,
  totalRounds,
}: {
  line: TaigerLine
  taigerSessionCount: number
  totalRounds: number
}) {
  const hasUsed = taigerSessionCount > 0

  return (
    <div
      style={{
        marginTop: '32px',
        padding: '20px',
        background: `linear-gradient(180deg, ${GOLD_SOFT} 0%, ${BG_SOFT} 100%)`,
        borderRadius: '16px',
        border: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${GOLD}`,
        position: 'relative',
      }}
    >
      {/* Quote mark decorativo */}
      <div
        style={{
          fontFamily: 'var(--font-playfair)',
          fontSize: '40px',
          color: GOLD,
          opacity: 0.35,
          position: 'absolute',
          top: '8px',
          left: '14px',
          lineHeight: 1,
          pointerEvents: 'none',
        }}
      >
        “
      </div>

      <div
        style={{
          fontSize: '9px',
          fontFamily: 'var(--font-dm-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: GOLD,
          fontWeight: 700,
          marginBottom: '10px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        tAIger Coach
      </div>

      <div
        style={{
          fontFamily: 'var(--font-playfair)',
          fontSize: '15px',
          color: TEXT,
          fontWeight: 500,
          lineHeight: 1.5,
          marginBottom: '12px',
          paddingLeft: '18px',
          position: 'relative',
          zIndex: 1,
          fontStyle: 'italic',
        }}
      >
        {line.texto}
      </div>

      {/* Meta info */}
      {hasUsed && (
        <div
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-dm-mono)',
            color: TEXT_3,
            fontWeight: 500,
            marginBottom: '12px',
            paddingLeft: '18px',
          }}
        >
          {taigerSessionCount} {taigerSessionCount === 1 ? 'sesión' : 'sesiones'} · basado en tus últimas {Math.min(totalRounds, 20)} rondas
        </div>
      )}

      {/* CTAs */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
        <Link
          href={line.cta_href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: GOLD,
            color: '#fff',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {line.cta_texto.replace('→', '').trim()} →
        </Link>
        {hasUsed && (
          <Link
            href="/coach/sesion/nueva"
            style={{
              fontSize: '12px',
              color: TEXT_2,
              fontWeight: 500,
              textDecoration: 'none',
              borderBottom: `1px solid ${BORDER}`,
              paddingBottom: '2px',
            }}
          >
            Nueva sesión
          </Link>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '10px',
        fontFamily: 'var(--font-dm-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: TEXT_3,
        fontWeight: 700,
        marginBottom: '16px',
      }}
    >
      {children}
    </div>
  )
}
