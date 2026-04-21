// src/components/mi-golf/IdentidadTab.tsx
import Link from 'next/link'
import type { Nivel, StatsForma, TaigerLine } from '@/lib/mi-golf/types'
import { NIVELES_ORDEN } from '@/lib/mi-golf/niveles'

type Props = {
  userName: string
  indiceGolfers: number | null
  nivel: Nivel | null
  rondasConDiferencial: number
  totalRounds: number
  taigerSessionCount: number
  stats: StatsForma
  taigerLine: TaigerLine
}

const GOLD = '#c4992a'
const TEXT = '#1a1a1a'
const TEXT_2 = '#666'
const TEXT_3 = '#999'
const BORDER = '#e8e8e8'
const BG_SOFT = '#fafafa'

export function IdentidadTab(props: Props) {
  const { userName, indiceGolfers, nivel, rondasConDiferencial, totalRounds, taigerSessionCount, stats, taigerLine } = props
  void userName

  const mostrarBarraCalibracion = rondasConDiferencial < 3
  const mostrarBarraTaiger = totalRounds < 5 || taigerSessionCount === 0
  const mostrarSeccionProgresos = mostrarBarraCalibracion || mostrarBarraTaiger

  const mostrarSeccionTuJuego =
    stats.mejorScore != null ||
    stats.canchaFavorita != null ||
    stats.rondasJugadas > 0 ||
    stats.promedioUltimas5 != null

  return (
    <main style={{ padding: '32px 24px 32px', maxWidth: '640px', margin: '0 auto' }}>
      {/* HERO */}
      <Hero indice={indiceGolfers} nivel={nivel} />

      {/* LEVELS BAR */}
      {nivel && <LevelsBar nivel={nivel} />}

      {/* PROGRESOS */}
      {mostrarSeccionProgresos && (
        <div style={{ margin: '40px 0 0' }}>
          <SectionLabel>Progresos</SectionLabel>
          {mostrarBarraCalibracion && (
            <Progreso
              label="Calibración del índice"
              actual={rondasConDiferencial}
              total={3}
            />
          )}
          {mostrarBarraTaiger && (
            <Progreso label="Desbloqueo tAIger+" actual={Math.min(totalRounds, 5)} total={5} />
          )}
        </div>
      )}

      {/* TU JUEGO */}
      {mostrarSeccionTuJuego && <TuJuego stats={stats} />}

      {/* TAIGER LINE */}
      <TaigerCard line={taigerLine} />
    </main>
  )
}

function Hero({ indice, nivel }: { indice: number | null; nivel: Nivel | null }) {
  if (indice == null || !nivel) {
    return (
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '72px', fontWeight: 700, color: TEXT_3, lineHeight: 1, letterSpacing: '-0.02em' }}>
          —
        </div>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_2, fontWeight: 600, marginTop: '8px' }}>
          Índice Golfers+
        </div>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: TEXT, fontWeight: 600, marginTop: '20px' }}>
          Sin calibrar
        </div>
        <div style={{ fontSize: '12px', color: TEXT_2, marginTop: '4px' }}>
          Jugá 3 rondas en canchas con slope/rating para desbloquear
        </div>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
      <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '72px', fontWeight: 700, color: GOLD, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {indice.toFixed(1)}
      </div>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_2, fontWeight: 600, marginTop: '8px' }}>
        Índice Golfers+
      </div>
      <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: TEXT, fontWeight: 600, marginTop: '20px' }}>
        {nivel.nombre}
      </div>
      {nivel.nombre_siguiente && nivel.golpes_hasta_siguiente != null && (
        <div style={{ fontSize: '12px', color: TEXT_2, marginTop: '4px' }}>
          {nivel.golpes_hasta_siguiente.toFixed(1)} golpes para pasar a {nivel.nombre_siguiente}
        </div>
      )}
    </div>
  )
}

function LevelsBar({ nivel }: { nivel: Nivel }) {
  const currentIdx = NIVELES_ORDEN.indexOf(nivel.nombre)
  return (
    <div style={{ margin: '24px 0 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px', marginBottom: '8px' }}>
        {NIVELES_ORDEN.map((n, i) => {
          const isPast = i < currentIdx
          const isCurrent = i === currentIdx
          const pct = Math.round(nivel.posicion_en_banda * 100)
          const style: React.CSSProperties = {
            height: '4px',
            borderRadius: '2px',
            position: 'relative',
            background: isPast
              ? GOLD
              : isCurrent
              ? `linear-gradient(to right, ${GOLD} ${pct}%, ${BORDER} ${pct}%)`
              : BORDER,
          }
          return (
            <div key={n} style={style}>
              {isCurrent && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-11px',
                    left: `${pct}%`,
                    transform: 'translateX(-50%)',
                    color: GOLD,
                    fontSize: '7px',
                  }}
                >
                  ▼
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px', fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, textAlign: 'center' }}>
        {NIVELES_ORDEN.map((n) => (
          <div
            key={n}
            style={{ color: n === nivel.nombre ? GOLD : TEXT_3, fontWeight: n === nivel.nombre ? 700 : 600 }}
          >
            {n}
          </div>
        ))}
      </div>
    </div>
  )
}

function Progreso({ label, actual, total }: { label: string; actual: number; total: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((actual / total) * 100)))
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', color: TEXT, fontWeight: 500 }}>{label}</span>
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '14px', fontWeight: 700, color: GOLD }}>{pct}%</span>
      </div>
      <div style={{ height: '3px', background: BORDER, borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: GOLD, width: `${pct}%`, borderRadius: '2px' }} />
      </div>
    </div>
  )
}

function TuJuego({ stats }: { stats: StatsForma }) {
  const rows: Array<{ key: string; value: string; sub?: string }> = []
  if (stats.mejorScore != null) {
    rows.push({
      key: 'Mejor score',
      value: String(stats.mejorScore.gross),
      sub: `${stats.mejorScore.vsPar >= 0 ? '+' : ''}${stats.mejorScore.vsPar} vs par`,
    })
  }
  if (stats.canchaFavorita) {
    rows.push({ key: 'Cancha favorita', value: stats.canchaFavorita.nombre, sub: `· ${stats.canchaFavorita.vecesJugada} veces` })
  }
  if (stats.rondasJugadas > 0) {
    rows.push({ key: 'Rondas jugadas', value: String(stats.rondasJugadas) })
  }
  if (stats.promedioUltimas5 != null) {
    rows.push({ key: 'Promedio últimas 5', value: stats.promedioUltimas5.toFixed(1), sub: 'golpes' })
  }
  if (rows.length === 0) return null

  return (
    <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: `1px solid ${BORDER}` }}>
      <SectionLabel>Tu juego</SectionLabel>
      {rows.map((r, i) => (
        <div
          key={r.key}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '10px 0',
            borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${BORDER}`,
          }}
        >
          <span style={{ fontSize: '13px', color: TEXT_2 }}>{r.key}</span>
          <span style={{ fontSize: '14px', color: TEXT, fontWeight: 600 }}>
            {r.value}
            {r.sub && <span style={{ fontWeight: 400, color: TEXT_3, marginLeft: '4px', fontSize: '12px' }}>{r.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

function TaigerCard({ line }: { line: TaigerLine }) {
  return (
    <div style={{ marginTop: '28px', padding: '14px 16px', background: BG_SOFT, borderRadius: '10px', borderLeft: `2px solid ${GOLD}` }}>
      <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: GOLD, fontWeight: 700, marginBottom: '6px' }}>
        tAIger Coach
      </div>
      <div style={{ fontSize: '13px', color: TEXT, fontWeight: 500, lineHeight: 1.45, marginBottom: '8px' }}>{line.texto}</div>
      <Link href={line.cta_href} style={{ fontSize: '12px', color: GOLD, fontWeight: 600, textDecoration: 'none' }}>
        {line.cta_texto}
      </Link>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '10px',
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
