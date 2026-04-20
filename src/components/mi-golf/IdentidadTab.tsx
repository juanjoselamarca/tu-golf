// src/components/mi-golf/IdentidadTab.tsx
import Link from 'next/link'
import type { Insight, StatsForma, Tendencia } from '@/lib/mi-golf/types'

type Props = {
  userName: string
  indiceGolfers: number | null
  rondasConDiferencial: number
  totalRounds: number
  taigerSessionCount: number
  tendencia: Tendencia
  stats: StatsForma
  insight: Insight
  cpiScore: number | null
  cpiStatus: string | null
}

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e5e5',
  borderRadius: '12px',
  padding: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

export function IdentidadTab(props: Props) {
  const { userName, indiceGolfers, rondasConDiferencial, totalRounds, taigerSessionCount, tendencia, stats, insight, cpiScore, cpiStatus } = props

  return (
    <main style={{ padding: '16px 16px 80px', maxWidth: '640px', margin: '0 auto' }}>
      <HeroIdentidad
        userName={userName}
        indiceGolfers={indiceGolfers}
        rondasConDiferencial={rondasConDiferencial}
        tendencia={tendencia}
      />
      <TaigerCoachCard taigerSessionCount={taigerSessionCount} />
      <InsightDelDia insight={insight} />
      {totalRounds > 0 && <StatsGrid stats={stats} />}
      <ProgresoHitos
        totalRounds={totalRounds}
        rondasConDiferencial={rondasConDiferencial}
        taigerSessionCount={taigerSessionCount}
        cpiScore={cpiScore}
        cpiStatus={cpiStatus}
      />
      <Link
        href="/perfil/historial"
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '14px',
          marginTop: '20px',
          background: '#ffffff',
          border: '1px solid #e5e5e5',
          borderRadius: '12px',
          color: '#1a1a1a',
          fontSize: '14px',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Ver mi historial completo →
      </Link>
    </main>
  )
}

function HeroIdentidad({
  userName,
  indiceGolfers,
  rondasConDiferencial,
  tendencia,
}: {
  userName: string
  indiceGolfers: number | null
  rondasConDiferencial: number
  tendencia: Tendencia
}) {
  return (
    <section style={{ marginBottom: '16px', ...cardStyle, padding: '20px' }}>
      <div
        style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '24px',
          color: '#1a1a1a',
          marginBottom: '12px',
        }}
      >
        {userName}
      </div>

      {indiceGolfers != null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span
              style={{
                fontFamily: '"Playfair Display", serif',
                fontSize: '56px',
                color: '#c4992a',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {indiceGolfers.toFixed(1)}
            </span>
            <span style={{ fontSize: '13px', color: '#666' }}>Índice Golfers+</span>
          </div>
          {tendencia && (
            <div
              style={{
                marginTop: '8px',
                fontSize: '13px',
                color: tendencia.direccion === 'up' ? '#2d7a3e' : tendencia.direccion === 'down' ? '#c44040' : '#666',
                fontWeight: 600,
              }}
            >
              {tendencia.direccion === 'up' && `▲ Mejoró ${tendencia.delta.toFixed(1)} en ${tendencia.dias} días`}
              {tendencia.direccion === 'down' && `▼ Subió ${tendencia.delta.toFixed(1)} en ${tendencia.dias} días`}
              {tendencia.direccion === 'flat' && `— Estable en ${tendencia.dias} días`}
            </div>
          )}
          <div
            style={{
              marginTop: '12px',
              display: 'inline-block',
              background: '#f0f5f0',
              color: '#2d7a3e',
              padding: '3px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Activo
          </div>
        </>
      ) : rondasConDiferencial > 0 ? (
        <>
          <div style={{ fontSize: '14px', color: '#1a1a1a', fontWeight: 600, marginBottom: '8px' }}>
            Calibrando {rondasConDiferencial} de 3 rondas
          </div>
          <div style={{ background: '#f0f0f0', borderRadius: '6px', height: '6px', overflow: 'hidden' }}>
            <div style={{ background: '#c4992a', height: '100%', width: `${(rondasConDiferencial / 3) * 100}%` }} />
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
            Juega {3 - rondasConDiferencial} ronda{3 - rondasConDiferencial !== 1 ? 's' : ''} más en canchas con slope/rating
          </div>
        </>
      ) : (
        <div style={{ fontSize: '14px', color: '#666' }}>
          Juega 3 rondas en canchas con slope/rating para desbloquear tu Índice Golfers+
        </div>
      )}
    </section>
  )
}

function TaigerCoachCard({ taigerSessionCount }: { taigerSessionCount: number }) {
  const hasUsed = taigerSessionCount > 0
  return (
    <section style={{ marginBottom: '16px', ...cardStyle, borderLeft: '3px solid #c4992a' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        tAIger Coach
      </div>
      {hasUsed ? (
        <>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginTop: '6px' }}>
            Último análisis completado
          </div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
            Revisa los patrones detectados en tu juego reciente.
          </div>
          <Link
            href="/coach"
            style={{
              display: 'inline-block',
              marginTop: '10px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#c4992a',
              textDecoration: 'none',
            }}
          >
            Ver sesión →
          </Link>
        </>
      ) : (
        <>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginTop: '6px' }}>
            Tu coach con IA está listo
          </div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
            Analiza tus últimas rondas y encuentra patrones para mejorar.
          </div>
          <Link
            href="/coach"
            style={{
              display: 'inline-block',
              marginTop: '12px',
              padding: '8px 16px',
              background: '#c4992a',
              color: '#ffffff',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Hablar con tAIger
          </Link>
        </>
      )}
    </section>
  )
}

function InsightDelDia({ insight }: { insight: Insight }) {
  return (
    <section style={{ marginBottom: '16px', ...cardStyle, background: '#fafafa' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Insight del día
      </div>
      <div style={{ fontSize: '15px', color: '#1a1a1a', fontWeight: 500, marginTop: '6px' }}>
        {insight.titulo}
      </div>
      {insight.detalle && (
        <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{insight.detalle}</div>
      )}
      {insight.href && (
        <Link
          href={insight.href}
          style={{
            display: 'inline-block',
            marginTop: '8px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#c4992a',
            textDecoration: 'none',
          }}
        >
          Ver más →
        </Link>
      )}
    </section>
  )
}

function StatsGrid({ stats }: { stats: StatsForma }) {
  const cells: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: 'Promedio últimas 5',
      value: stats.promedioUltimas5 != null ? stats.promedioUltimas5.toFixed(1) : '—',
      sub: 'golpes',
    },
    {
      label: 'Mejor score',
      value: stats.mejorScore ? String(stats.mejorScore.gross) : '—',
      sub: stats.mejorScore ? `${stats.mejorScore.vsPar >= 0 ? '+' : ''}${stats.mejorScore.vsPar} vs par` : undefined,
    },
    { label: 'Rondas jugadas', value: String(stats.rondasJugadas) },
    {
      label: 'Cancha más jugada',
      value: stats.canchaFavorita?.nombre ?? '—',
      sub: stats.canchaFavorita ? `${stats.canchaFavorita.vecesJugada} veces` : undefined,
    },
  ]

  return (
    <section style={{ marginBottom: '16px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '8px',
          paddingLeft: '4px',
        }}
      >
        Forma
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {cells.map((c) => (
          <div key={c.label} style={{ ...cardStyle, padding: '14px' }}>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {c.label}
            </div>
            <div
              style={{
                fontSize: c.label === 'Cancha más jugada' ? '14px' : '22px',
                fontWeight: 700,
                color: '#1a1a1a',
                marginTop: '4px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.value}
            </div>
            {c.sub && <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{c.sub}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

function ProgresoHitos({
  totalRounds,
  rondasConDiferencial,
  taigerSessionCount,
  cpiScore,
  cpiStatus,
}: {
  totalRounds: number
  rondasConDiferencial: number
  taigerSessionCount: number
  cpiScore: number | null
  cpiStatus: string | null
}) {
  let hito: { texto: string; progreso: number } | null = null

  if (rondasConDiferencial < 3) {
    hito = {
      texto: `${3 - rondasConDiferencial} ronda${3 - rondasConDiferencial !== 1 ? 's' : ''} más para tu índice oficial`,
      progreso: rondasConDiferencial / 3,
    }
  } else if (totalRounds < 5) {
    hito = {
      texto: `${5 - totalRounds} ronda${5 - totalRounds !== 1 ? 's' : ''} más para activar tAIger+`,
      progreso: totalRounds / 5,
    }
  } else if (taigerSessionCount === 0) {
    hito = {
      texto: 'Probá tu primera sesión con tAIger+',
      progreso: 0,
    }
  }

  if (!hito && cpiScore == null) return null

  return (
    <section style={{ marginBottom: '16px', ...cardStyle }}>
      {hito && (
        <>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>
            {hito.texto}
          </div>
          <div style={{ background: '#f0f0f0', borderRadius: '6px', height: '6px', overflow: 'hidden' }}>
            <div style={{ background: '#c4992a', height: '100%', width: `${hito.progreso * 100}%` }} />
          </div>
        </>
      )}
      {cpiScore != null && (
        <div style={{ marginTop: hito ? '12px' : 0, fontSize: '12px', color: '#666' }}>
          CPI: <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{cpiScore}</span>
          {cpiStatus && <span style={{ marginLeft: '8px' }}>({cpiStatus})</span>}
        </div>
      )}
    </section>
  )
}
